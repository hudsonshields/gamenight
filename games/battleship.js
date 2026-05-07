const SIZES = [5, 4, 3, 3, 2];

function createGame() {
  return {
    phase: 'placement',
    grids: [emptyGrid(), emptyGrid()],
    ready: [false, false],
    currentPlayer: 0,
    winner: null,
  };
}

function emptyGrid() {
  return { ships: [], hits: [], misses: [] };
}

function placeShips(state, ships, playerIndex) {
  if (ships.length !== SIZES.length) return { valid: false };

  const occupied = Array(10).fill(null).map(() => Array(10).fill(false));
  const validated = [];

  for (let i = 0; i < ships.length; i++) {
    const { row, col, horizontal } = ships[i];
    const size = SIZES[i];
    const cells = [];

    for (let j = 0; j < size; j++) {
      const r = horizontal ? row : row + j;
      const c = horizontal ? col + j : col;
      if (r < 0 || r >= 10 || c < 0 || c >= 10 || occupied[r][c]) return { valid: false };
      cells.push([r, c]);
    }
    cells.forEach(([r, c]) => occupied[r][c] = true);
    validated.push({ cells, sunk: false });
  }

  const grids = state.grids.map((g, i) =>
    i === playerIndex ? { ships: validated, hits: [], misses: [] } : { ...g, ships: [...g.ships] }
  );
  const ready = state.ready.map((r, i) => i === playerIndex ? true : r);

  return {
    valid: true,
    state: { ...state, grids, ready, phase: ready.every(Boolean) ? 'battle' : 'placement' },
  };
}

function bothReady(state) {
  return state.ready.every(Boolean);
}

function handleMove(state, move, playerIndex) {
  if (state.phase !== 'battle' || state.currentPlayer !== playerIndex) return { valid: false };
  const { row, col } = move;
  const opp = 1 - playerIndex;
  const tg = state.grids[opp];

  if (tg.hits.some(([r,c]) => r===row&&c===col) || tg.misses.some(([r,c]) => r===row&&c===col))
    return { valid: false };

  let shipIdx = tg.ships.findIndex(s => s.cells.some(([r,c]) => r===row&&c===col));

  const grids = state.grids.map(g => ({
    ships: g.ships.map(s => ({ ...s, cells: s.cells.map(c=>[...c]) })),
    hits: [...g.hits],
    misses: [...g.misses],
  }));

  const tgNew = grids[opp];

  if (shipIdx >= 0) {
    tgNew.hits.push([row, col]);
    const ship = tgNew.ships[shipIdx];
    if (ship.cells.every(([r,c]) => tgNew.hits.some(([hr,hc])=>hr===r&&hc===c))) {
      tgNew.ships[shipIdx] = { ...ship, sunk: true };
    }
  } else {
    tgNew.misses.push([row, col]);
  }

  const allSunk = tgNew.ships.every(s => s.sunk);
  // Hit = same player goes again (classic rules)
  const next = (shipIdx >= 0 && !allSunk) ? playerIndex : opp;

  return {
    valid: true,
    state: {
      ...state,
      grids,
      currentPlayer: allSunk ? playerIndex : next,
      winner: allSunk ? playerIndex : null,
    },
    winner: allSunk ? playerIndex : undefined,
  };
}

/** Strip opponent ship locations (show only sunk ships) */
function publicState(state, playerIndex) {
  const opp = 1 - playerIndex;
  return {
    phase: state.phase,
    ready: state.ready,
    currentPlayer: state.currentPlayer,
    winner: state.winner,
    myGrid: state.grids[playerIndex],
    oppGrid: {
      ships: state.grids[opp].ships.filter(s => s.sunk),
      hits: state.grids[opp].hits,
      misses: state.grids[opp].misses,
      totalShips: state.grids[opp].ships.length,
      shipsSunk: state.grids[opp].ships.filter(s => s.sunk).length,
    },
  };
}

module.exports = { createGame, placeShips, handleMove, bothReady, publicState, SIZES };
