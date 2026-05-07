const socket = io();
const params = new URLSearchParams(location.search);
const roomCode = (params.get('room') || '').toUpperCase();

if (!roomCode) window.location.href = '/';

let playerIndex = null;
let roundOver = false;

// ── Socket ─────────────────────────────────────────────────────────────────────

socket.on('connect', () => socket.emit('join-room', { code: roomCode }));
socket.on('room-error', ({ message }) => alert(message));

socket.on('waiting', ({ code }) => {
  document.getElementById('displayCode').textContent = code;
  show('waiting');
});

socket.on('game-start', ({ state, playerIndex: pi, scores }) => {
  playerIndex = pi;
  applyState(state, scores);
  show('game');
  focusInput();
});

socket.on('game-update', ({ state, scores }) => {
  applyState(state, scores);
});

socket.on('round-start', ({ state, scores }) => {
  applyState(state, scores);
  clearReveal();
  focusInput();
});

socket.on('wrong-guess', () => {
  shakeInput();
});

socket.on('game-over', ({ winner, scores }) => {
  setTimeout(() => showGameOver(winner, scores), 1500);
});

socket.on('rematch-start', ({ state, scores, playerIndex: pi }) => {
  if (pi !== undefined) playerIndex = pi;
  applyState(state, scores);
  clearReveal();
  hide('gameover');
  show('game');
  focusInput();
});

socket.on('rematch-requested', () => {
  document.getElementById('goSub').textContent = 'Opponent wants a rematch!';
});

socket.on('opponent-left', () => {
  alert('Your opponent disconnected.');
  window.location.href = '/';
});

// ── Render ─────────────────────────────────────────────────────────────────────

function applyState(state, scores) {
  roundOver = state.roundOver;

  document.getElementById('roundLabel').textContent =
    `Round ${state.round} of ${state.totalRounds}`;
  document.getElementById('scrambledWord').textContent =
    (state.scrambled || '——').toUpperCase();

  if (scores) {
    document.getElementById('wsScoreYou').textContent = scores[playerIndex] ?? 0;
    document.getElementById('wsScoreOpp').textContent = scores[1 - playerIndex] ?? 0;
    document.getElementById('scoreYou').textContent = scores[playerIndex] ?? 0;
    document.getElementById('scoreOpp').textContent = scores[1 - playerIndex] ?? 0;
  }

  const status = document.getElementById('statusBanner');
  const input = document.getElementById('guessInput');
  const inputRow = document.getElementById('inputRow');

  if (state.roundOver) {
    // Show round result
    const youWon = state.roundWinner === playerIndex;
    status.className = 'status-banner ' + (youWon ? 'your-turn' : 'their-turn');
    status.textContent = youWon ? '🎉 You got it!' : '⚡ Opponent got it first!';
    input.disabled = true;
    input.value = '';

    if (state.word) {
      const reveal = document.getElementById('revealArea');
      reveal.innerHTML = `<div class="ws-reveal">The word was: <strong>${state.word.toUpperCase()}</strong></div>
        <div class="ws-countdown">Next round in 3 seconds…</div>`;
    }
  } else {
    status.className = 'status-banner your-turn';
    status.textContent = '⚡ Type the unscrambled word!';
    input.disabled = false;
    input.value = '';
  }
}

function clearReveal() {
  document.getElementById('revealArea').innerHTML = '';
  const input = document.getElementById('guessInput');
  input.disabled = false;
  input.className = 'ws-input';
}

// ── Actions ────────────────────────────────────────────────────────────────────

function submitGuess() {
  if (roundOver) return;
  const input = document.getElementById('guessInput');
  const guess = input.value.trim();
  if (!guess) return;
  socket.emit('make-move', { move: { guess } });
  input.value = '';
}

function shakeInput() {
  const input = document.getElementById('guessInput');
  input.classList.remove('wrong');
  void input.offsetWidth; // force reflow
  input.classList.add('wrong');
  setTimeout(() => input.classList.remove('wrong'), 400);
}

function focusInput() {
  setTimeout(() => document.getElementById('guessInput')?.focus(), 100);
}

function showGameOver(winner, scores) {
  const emoji = winner === 'draw' ? '🤝' : winner === playerIndex ? '🏆' : '😢';
  const title = winner === 'draw' ? "It's a Tie!" : winner === playerIndex ? 'You Win!' : 'They Win!';
  document.getElementById('goEmoji').textContent = emoji;
  document.getElementById('goTitle').textContent = title;
  document.getElementById('goScoreYou').textContent = scores[playerIndex] ?? 0;
  document.getElementById('goScoreOpp').textContent = scores[1 - playerIndex] ?? 0;
  show('gameover');
}

function sendRematch() {
  document.getElementById('goSub').textContent = 'Waiting for opponent…';
  socket.emit('rematch');
}

function copyLink() {
  const url = `${location.origin}/games/word-scramble/?room=${roomCode}`;
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.getElementById('copyBtn');
    btn.textContent = '✅ Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = '📋 Copy Invite Link'; btn.classList.remove('copied'); }, 2000);
  });
}

// ── Enter key ──────────────────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
  if (e.key === 'Enter') submitGuess();
});

// ── Helpers ────────────────────────────────────────────────────────────────────

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
