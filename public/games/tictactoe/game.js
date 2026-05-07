const socket = io();
const params = new URLSearchParams(location.search);
const roomCode = (params.get('room') || '').toUpperCase();

let playerIndex = null;
let gameState = null;
let myTurn = false;

if (!roomCode) window.location.href = '/';

// Player 0 = ❌, Player 1 = ⭕
const MARKS = ['❌', '⭕'];

socket.on('connect', () => socket.emit('join-room', { code: roomCode }));
socket.on('room-error', ({ message }) => alert(message));

socket.on('waiting', ({ code }) => {
  document.getElementById('displayCode').textContent = code;
  show('waiting');
});

socket.on('game-start', ({ state, playerIndex: pi, scores }) => {
  playerIndex = pi;
  updateScores(scores);
  applyState(state);
  show('game');
  document.getElementById('legend').textContent =
    `You are ${MARKS[playerIndex]}`;
});

socket.on('game-update', ({ state, scores }) => {
  updateScores(scores);
  applyState(state);
});

socket.on('game-over', ({ winner, scores }) => {
  updateScores(scores);
  showGameOver(winner, scores);
});

socket.on('rematch-start', ({ state, scores, playerIndex: pi }) => {
  if (pi !== undefined) playerIndex = pi;
  updateScores(scores);
  applyState(state);
  hide('gameover');
  show('game');
});

socket.on('rematch-requested', () => {
  document.getElementById('goSub').textContent = 'Opponent wants a rematch!';
});

socket.on('opponent-left', () => {
  alert('Your opponent disconnected.');
  window.location.href = '/';
});

// ── Render ─────────────────────────────────────────────────────────────────────

function applyState(state) {
  gameState = state;
  myTurn = state.currentPlayer === playerIndex && !state.winner;
  renderBoard(state);
  updateStatus(state);
}

function renderBoard(state) {
  const board = document.getElementById('tttBoard');
  board.innerHTML = '';

  for (let i = 0; i < 9; i++) {
    const cell = document.createElement('div');
    cell.className = 'ttt-cell';
    const v = state.board[i];

    if (v !== null) {
      cell.classList.add('taken');
      const span = document.createElement('span');
      span.className = v === 0 ? 'x-mark' : 'o-mark';
      span.textContent = MARKS[v];
      cell.appendChild(span);
    } else if (myTurn) {
      cell.addEventListener('click', () => makeMove(i));
    }

    if (state.winLine && state.winLine.includes(i)) {
      cell.classList.add('win');
    }

    board.appendChild(cell);
  }
}

function updateStatus(state) {
  const el = document.getElementById('statusBanner');
  el.className = 'status-banner';
  if (!state.winner) {
    if (state.currentPlayer === playerIndex) {
      el.textContent = `🟢 Your turn — play ${MARKS[playerIndex]}`;
      el.classList.add('your-turn');
    } else {
      el.textContent = `⏳ Opponent is thinking…`;
      el.classList.add('their-turn');
    }
  }
}

function updateScores(scores) {
  if (scores) {
    document.getElementById('scoreYou').textContent = scores[playerIndex] ?? 0;
    document.getElementById('scoreOpp').textContent = scores[1 - playerIndex] ?? 0;
  }
}

function showGameOver(winner, scores) {
  const emoji = winner === 'draw' ? '🤝' : winner === playerIndex ? '🏆' : '😢';
  const title = winner === 'draw' ? "It's a Draw!" : winner === playerIndex ? 'You Win!' : 'They Win!';
  document.getElementById('goEmoji').textContent = emoji;
  document.getElementById('goTitle').textContent = title;
  document.getElementById('goScoreYou').textContent = scores[playerIndex] ?? 0;
  document.getElementById('goScoreOpp').textContent = scores[1 - playerIndex] ?? 0;
  show('gameover');
}

function makeMove(index) {
  if (!myTurn) return;
  socket.emit('make-move', { move: { index } });
}

function sendRematch() {
  document.getElementById('goSub').textContent = 'Waiting for opponent…';
  socket.emit('rematch');
}

function copyLink() {
  const url = `${location.origin}/games/tictactoe/?room=${roomCode}`;
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.getElementById('copyBtn');
    btn.textContent = '✅ Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = '📋 Copy Invite Link'; btn.classList.remove('copied'); }, 2000);
  });
}

function show(name) {
  document.getElementById('screen-waiting').style.display = 'none';
  document.getElementById('screen-game').style.display = 'none';
  if (name === 'waiting') document.getElementById('screen-waiting').style.display = '';
  if (name === 'game') document.getElementById('screen-game').style.display = '';
  if (name === 'gameover') document.getElementById('screen-gameover').style.display = 'flex';
}
function hide(name) {
  if (name === 'gameover') document.getElementById('screen-gameover').style.display = 'none';
}
