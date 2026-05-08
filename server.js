const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const games = {
  'connect-four': require('./games/connectFour'),
  'tictactoe':    require('./games/tictactoe'),
  'battleship':   require('./games/battleship'),
  'word-scramble': require('./games/wordScramble'),
  '8ball':         require('./games/eightBall'),
};

const rooms = {};

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

// ── REST ──────────────────────────────────────────────────────────────────────

app.post('/api/create-room', (req, res) => {
  const { gameType } = req.body;
  if (!games[gameType]) return res.status(400).json({ error: 'Invalid game type' });

  let code;
  do { code = genCode(); } while (rooms[code]);

  rooms[code] = {
    code, gameType,
    players: [null, null],
    socketIds: [],
    state: null,
    scores: [0, 0],
    rematchVotes: new Set(),
  };

  // Auto-delete if never filled within 10 min
  setTimeout(() => {
    if (rooms[code] && rooms[code].socketIds.length < 2) delete rooms[code];
  }, 10 * 60 * 1000);

  res.json({ code });
});

app.get('/api/room/:code', (req, res) => {
  const room = rooms[req.params.code.toUpperCase()];
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json({ gameType: room.gameType, playerCount: room.socketIds.length });
});

// ── SOCKET ────────────────────────────────────────────────────────────────────

io.on('connection', (socket) => {

  socket.on('join-room', ({ code }) => {
    const key = code.toUpperCase();
    const room = rooms[key];
    if (!room) return socket.emit('room-error', { message: 'Room not found. Double-check the code!' });
    if (room.socketIds.length >= 2) return socket.emit('room-error', { message: 'Room is full.' });

    const idx = room.socketIds.length;
    room.socketIds.push(socket.id);
    room.players[idx] = socket.id;
    socket.playerIndex = idx;
    socket.roomCode = key;
    socket.join(key);

    if (idx === 0) {
      // Waiting for partner
      socket.emit('waiting', { code: key, playerIndex: 0 });
    } else {
      // Both players here — start game
      const game = games[room.gameType];
      room.state = game.createGame();
      broadcastGameStart(room);
    }
  });

  socket.on('make-move', ({ move }) => {
    const room = rooms[socket.roomCode];
    if (!room || !room.state) return;

    const game = games[room.gameType];
    const result = game.handleMove(room.state, move, socket.playerIndex);

    if (!result.valid) return socket.emit('invalid-move');

    // Word scramble wrong guess — private feedback only
    if (result.incorrect) return socket.emit('wrong-guess');

    room.state = result.state;

    if (result.winner !== undefined) {
      // Game over
      if (typeof result.winner === 'number') room.scores[result.winner]++;
      broadcastState(room, 'game-update');
      io.to(room.code).emit('game-over', { winner: result.winner, scores: room.scores });
    } else if (result.roundWinner !== undefined) {
      // Word Scramble round win — auto-advance after 3s
      broadcastState(room, 'game-update');
      setTimeout(() => {
        if (!rooms[room.code]) return;
        room.state = games['word-scramble'].nextRound(room.state);
        broadcastState(room, 'round-start');
      }, 3000);
    } else {
      broadcastState(room, 'game-update');
    }
  });

  // Battleship: ship placement phase
  socket.on('place-ships', ({ ships }) => {
    const room = rooms[socket.roomCode];
    if (!room || room.gameType !== 'battleship' || !room.state) return;

    const bsg = games['battleship'];
    const result = bsg.placeShips(room.state, ships, socket.playerIndex);
    if (!result.valid) return socket.emit('placement-invalid', { message: 'Invalid placement — ships overlap or go off-board.' });

    room.state = result.state;
    socket.emit('placement-confirmed');

    if (bsg.bothReady(room.state)) {
      broadcastState(room, 'battle-start');
    } else {
      socket.to(room.code).emit('opponent-placed');
    }
  });

  // ── 8-Ball Pool events ──
  socket.on('take-shot', ({ angle, power }) => {
    const room = rooms[socket.roomCode];
    if (!room || room.gameType !== '8ball' || !room.state) return;
    if (room.state.currentPlayer !== socket.playerIndex) return;
    io.to(room.code).emit('shot-fired', { angle, power, player: socket.playerIndex });
  });

  socket.on('shot-complete', ({ pocketedBalls, cueBallPocketed, firstHitBall, ballPositions }) => {
    const room = rooms[socket.roomCode];
    if (!room || room.gameType !== '8ball' || !room.state) return;
    if (room.state.currentPlayer !== socket.playerIndex) return;

    const eb = games['8ball'];
    const result = eb.processShot(room.state, { pocketedBalls, cueBallPocketed, firstHitBall }, socket.playerIndex);
    if (!result.valid) return;

    room.state = result.state;
    io.to(room.code).emit('turn-update', { state: room.state, ballPositions, scores: room.scores });

    if (result.winner !== undefined) {
      room.scores[result.winner]++;
      io.to(room.code).emit('game-over', { winner: result.winner, scores: room.scores });
    }
  });

  socket.on('place-cue-ball', ({ x, y }) => {
    const room = rooms[socket.roomCode];
    if (!room || room.gameType !== '8ball' || !room.state) return;
    if (room.state.currentPlayer !== socket.playerIndex || !room.state.ballInHand) return;
    room.state.ballInHand = false;
    socket.to(room.code).emit('cue-ball-placed', { x, y });
  });

  socket.on('rematch', () => {
    const room = rooms[socket.roomCode];
    if (!room) return;

    room.rematchVotes.add(socket.id);
    if (room.rematchVotes.size >= 2) {
      room.rematchVotes.clear();
      room.state = games[room.gameType].createGame();
      broadcastGameStart(room);
    } else {
      socket.to(room.code).emit('rematch-requested');
    }
  });

  socket.on('disconnect', () => {
    const room = rooms[socket.roomCode];
    if (!room) return;
    socket.to(socket.roomCode).emit('opponent-left');
    room.socketIds = room.socketIds.filter(id => id !== socket.id);
    if (socket.playerIndex !== undefined) room.players[socket.playerIndex] = null;
    if (room.socketIds.length === 0) {
      setTimeout(() => {
        if (rooms[socket.roomCode]?.socketIds.length === 0) delete rooms[socket.roomCode];
      }, 30000);
    }
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function broadcastGameStart(room) {
  if (room.gameType === 'battleship') {
    const bsg = games['battleship'];
    for (let i = 0; i < 2; i++) {
      if (room.players[i]) {
        io.to(room.players[i]).emit('game-start', {
          gameType: room.gameType,
          playerIndex: i,
          state: bsg.publicState(room.state, i),
          scores: room.scores,
        });
      }
    }
  } else {
    for (let i = 0; i < 2; i++) {
      if (room.players[i]) {
        io.to(room.players[i]).emit('game-start', {
          gameType: room.gameType,
          playerIndex: i,
          state: clientState(room, i),
          scores: room.scores,
        });
      }
    }
  }
}

function broadcastState(room, event) {
  if (room.gameType === 'battleship') {
    const bsg = games['battleship'];
    for (let i = 0; i < 2; i++) {
      if (room.players[i]) {
        io.to(room.players[i]).emit(event, {
          state: bsg.publicState(room.state, i),
          scores: room.scores,
        });
      }
    }
  } else {
    for (let i = 0; i < 2; i++) {
      if (room.players[i]) {
        io.to(room.players[i]).emit(event, {
          state: clientState(room, i),
          scores: room.scores,
        });
      }
    }
  }
}

function clientState(room, playerIndex) {
  const s = room.state;
  if (room.gameType === 'word-scramble') {
    // Hide the answer until the round is over
    return { ...s, word: s.roundOver ? s.word : undefined };
  }
  return s;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🎮 GameNight → http://localhost:${PORT}`));
