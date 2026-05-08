const socket = io();
const params = new URLSearchParams(location.search);
const roomCode = (params.get('room') || '').toUpperCase();

if (!roomCode) window.location.href = '/';

const SHIP_SIZES = [5, 4, 3, 3, 2];
const SHIP_NAMES = ['Carrier (5)', 'Battleship (4)', 'Cruiser (3)', 'Submarine (3)', 'Destroyer (2)'];

let playerIndex = null;
let gameState = null;
let myTurn = false;

// Placement state
let orientation = 'horizontal'; // 'horizontal' | 'vertical'
let selectedShip = 0;
let placedShips = []; // {row, col, horizontal, size}[]
let placementGrid = Array(10).fill(null).map(() => Array(10).fill(false)); // occupied cells

// ── Socket ─────────────────────────────────────────────────────────────────────

socket.on('connect', () => socket.emit('join-room', { code: roomCode }));
socket.on('room-error', ({ message }) => alert(message));

socket.on('waiting', ({ code }) => {
  document.getElementById('displayCode').textContent = code;
  show('waiting');
});

socket.on('game-start', ({ state, playerIndex: pi, scores }) => {
  playerIndex = pi;
  updateScores(scores);
  gameState = state;
  if (state.phase === 'placement') {
    initPlacement();
    show('placement');
  }
});

socket.on('placement-confirmed', () => {
  document.getElementById('placementStatus').textContent = '✅ Ships placed! Waiting for opponent…';
  document.getElementById('confirmPlaceBtn').disabled = true;
});

socket.on('opponent-placed', () => {
  document.getElementById('placementStatus').textContent = '✅ Ships placed! Opponent is ready too…';
});

socket.on('placement-invalid', ({ message }) => alert(message));

socket.on('battle-start', ({ state, scores }) => {
  updateScores(scores);
  gameState = state;
  myTurn = state.currentPlayer === playerIndex;
  renderBattle(state);
  show('battle');
});

socket.on('game-update', ({ state, scores }) => {
  updateScores(scores);
  gameState = state;
  myTurn = state.currentPlayer === playerIndex && !state.winner;
  renderBattle(state);
});

socket.on('game-over', ({ winner, scores }) => {
  updateScores(scores);
  showGameOver(winner, scores);
});

socket.on('rematch-start', ({ state, scores, playerIndex: pi }) => {
  if (pi !== undefined) playerIndex = pi;
  updateScores(scores);
  gameState = state;
  // Reset placement
  selectedShip = 0;
  placedShips = [];
  placementGrid = Array(10).fill(null).map(() => Array(10).fill(false));
  hide('gameover');
  initPlacement();
  show('placement');
});

socket.on('rematch-requested', () => {
  document.getElementById('goSub').textContent = 'Opponent wants a rematch!';
});

socket.on('opponent-left', () => {
  alert('Your opponent disconnected.');
  window.location.href = '/';
});

// ── Placement ──────────────────────────────────────────────────────────────────

function initPlacement() {
  document.getElementById('placementStatus').textContent = 'Place your ships!';
  document.getElementById('confirmPlaceBtn').disabled = true;
  renderShipsList();
  renderPlacementGrid();
}

function renderShipsList() {
  const list = document.getElementById('shipsList');
  list.innerHTML = '';
  SHIP_SIZES.forEach((size, i) => {
    const btn = document.createElement('button');
    btn.className = 'bs-ship-btn' + (i === selectedShip ? ' selected' : '') + (placedShips[i] ? ' placed' : '');
    btn.textContent = SHIP_NAMES[i];
    btn.onclick = () => { selectedShip = i; renderShipsList(); };
    list.appendChild(btn);
  });
}

let _hoveredCells = [];

function renderPlacementGrid() {
  const grid = document.getElementById('placementGrid');
  grid.innerHTML = '';

  // Build placed-cells map
  const cellMap = Array(10).fill(null).map(() => Array(10).fill(null));
  placedShips.forEach((s, idx) => {
    if (!s) return;
    for (let j = 0; j < s.size; j++) {
      const r = s.horizontal ? s.row : s.row + j;
      const c = s.horizontal ? s.col + j : s.col;
      if (r < 10 && c < 10) cellMap[r][c] = idx;
    }
  });

  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) {
      const cell = document.createElement('div');
      cell.className = 'bs-cell';
      cell.dataset.row = r;
      cell.dataset.col = c;
      if (cellMap[r][c] !== null) cell.classList.add('ship');

      // Stable event listeners — no re-render on hover
      cell.addEventListener('mouseenter', () => showShipPreview(r, c));
      cell.addEventListener('click', () => placeShipAt(r, c));
      grid.appendChild(cell);
    }
  }
  grid.addEventListener('mouseleave', clearShipPreview);
}

function showShipPreview(row, col) {
  clearShipPreview();
  if (placedShips[selectedShip]) return; // already placed

  const hor = orientation === 'horizontal';
  const valid = canPlace(selectedShip, row, col, hor);
  const size = SHIP_SIZES[selectedShip];
  const grid = document.getElementById('placementGrid');

  for (let j = 0; j < size; j++) {
    const r = hor ? row : row + j;
    const c = hor ? col + j : col;
    if (r >= 10 || c >= 10) continue;
    const cell = grid.querySelector(`[data-row="${r}"][data-col="${c}"]`);
    if (cell && !cell.classList.contains('ship')) {
      cell.style.background = valid ? 'rgba(107,203,119,.4)' : 'rgba(255,77,77,.4)';
      _hoveredCells.push(cell);
    }
  }
}

function clearShipPreview() {
  _hoveredCells.forEach(c => c.style.background = '');
  _hoveredCells = [];
}

function canPlace(shipIdx, row, col, horizontal) {
  if (row < 0 || col < 0) return false;
  const size = SHIP_SIZES[shipIdx];
  for (let j = 0; j < size; j++) {
    const r = horizontal ? row : row + j;
    const c = horizontal ? col + j : col;
    if (r >= 10 || c >= 10) return false;
    if (placementGrid[r][c]) return false;
  }
  return true;
}

function placeShipAt(row, col) {
  if (placedShips[selectedShip]) return; // already placed
  const hor = orientation === 'horizontal';
  if (!canPlace(selectedShip, row, col, hor)) return;

  const size = SHIP_SIZES[selectedShip];
  placedShips[selectedShip] = { row, col, horizontal: hor, size };

  // Mark cells occupied
  for (let j = 0; j < size; j++) {
    const r = hor ? row : row + j;
    const c = hor ? col + j : col;
    placementGrid[r][c] = true;
  }

  // Move to next unplaced ship
  const next = SHIP_SIZES.findIndex((_, i) => !placedShips[i]);
  selectedShip = next >= 0 ? next : selectedShip;

  renderShipsList();
  renderPlacementGrid();

  if (placedShips.filter(Boolean).length === SHIP_SIZES.length) {
    document.getElementById('confirmPlaceBtn').disabled = false;
  }
}

function toggleOrientation() {
  orientation = orientation === 'horizontal' ? 'vertical' : 'horizontal';
  document.getElementById('orientBtn').textContent =
    orientation === 'horizontal' ? '↔ Horizontal' : '↕ Vertical';
}

function confirmPlacement() {
  if (placedShips.filter(Boolean).length < SHIP_SIZES.length) return;
  socket.emit('place-ships', {
    ships: placedShips.map(s => ({ row: s.row, col: s.col, horizontal: s.horizontal })),
  });
}

// ── Battle ─────────────────────────────────────────────────────────────────────

function renderBattle(state) {
  renderGrid('myGrid', state.myGrid, false, state);
  renderGrid('oppGrid', state.oppGrid, true, state);

  const status = document.getElementById('battleStatus');
  status.className = 'status-banner';
  if (state.winner === null) {
    if (state.currentPlayer === playerIndex) {
      status.textContent = '🎯 Your turn — fire at the enemy!';
      status.classList.add('your-turn');
    } else {
      status.textContent = '⏳ Opponent is firing…';
      status.classList.add('their-turn');
    }
  }

  const sunk = state.oppGrid.shipsSunk || 0;
  const total = state.oppGrid.totalShips || SHIP_SIZES.length;
  document.getElementById('sinkStatus').textContent = `Enemy ships sunk: ${sunk} / ${total}`;
}

function renderGrid(id, gridData, isOpponent, state) {
  const el = document.getElementById(id);
  el.innerHTML = '';

  // Build ship cell map
  const shipMap = Array(10).fill(null).map(() => Array(10).fill(null));
  (gridData.ships || []).forEach(ship => {
    ship.cells.forEach(([r,c]) => shipMap[r][c] = ship.sunk ? 'sunk' : 'ship');
  });

  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) {
      const cell = document.createElement('div');
      cell.className = 'bs-cell';

      const isHit = (gridData.hits || []).some(([hr,hc]) => hr===r && hc===c);
      const isMiss = (gridData.misses || []).some(([mr,mc]) => mr===r && mc===c);

      if (isHit) {
        cell.classList.add(shipMap[r][c] === 'sunk' ? 'sunk' : 'hit');
      } else if (isMiss) {
        cell.classList.add('miss');
      } else if (!isOpponent && shipMap[r][c]) {
        cell.classList.add(shipMap[r][c]);
      } else if (isOpponent && myTurn && state.winner === null) {
        cell.classList.add('clickable');
        cell.addEventListener('click', () => fireAt(r, c));
      }

      el.appendChild(cell);
    }
  }
}

function fireAt(row, col) {
  if (!myTurn) return;
  socket.emit('make-move', { move: { row, col } });
}

// ── Game Over ──────────────────────────────────────────────────────────────────

function showGameOver(winner, scores) {
  const emoji = winner === playerIndex ? '🏆' : '😢';
  const title = winner === playerIndex ? 'Your Fleet Wins!' : 'Fleet Sunk!';
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

// ── Helpers ────────────────────────────────────────────────────────────────────

function updateScores(scores) {
  if (!scores || playerIndex === null) return;
  document.getElementById('scoreYou').textContent = scores[playerIndex] ?? 0;
  document.getElementById('scoreOpp').textContent = scores[1 - playerIndex] ?? 0;
}

function copyLink() {
  const url = `${location.origin}/games/battleship/?room=${roomCode}`;
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.getElementById('copyBtn');
    btn.textContent = '✅ Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = '📋 Copy Invite Link'; btn.classList.remove('copied'); }, 2000);
  });
}

function show(name) {
  ['waiting','placement','battle'].forEach(s =>
    document.getElementById(`screen-${s}`).style.display = 'none'
  );
  if (['waiting','placement','battle'].includes(name))
    document.getElementById(`screen-${name}`).style.display = '';
  if (name === 'gameover')
    document.getElementById('screen-gameover').style.display = 'flex';
}
function hide(name) {
  if (name === 'gameover') document.getElementById('screen-gameover').style.display = 'none';
}
