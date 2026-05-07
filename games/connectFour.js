function createGame() {
  return {
    board: Array(6).fill(null).map(() => Array(7).fill(null)),
    currentPlayer: 0,
    winner: null,
    lastMove: null,
  };
}

function handleMove(state, move, playerIndex) {
  if (state.currentPlayer !== playerIndex || state.winner !== null) return { valid: false };
  const { col } = move;
  if (col < 0 || col >= 7) return { valid: false };

  // Find lowest empty row in column
  let row = -1;
  for (let r = 5; r >= 0; r--) {
    if (state.board[r][col] === null) { row = r; break; }
  }
  if (row === -1) return { valid: false }; // Column full

  const board = state.board.map(r => [...r]);
  board[row][col] = playerIndex;

  const won = checkWinner(board, row, col, playerIndex);
  const isDraw = !won && board[0].every(c => c !== null);

  const newState = {
    board,
    currentPlayer: won ? playerIndex : 1 - playerIndex,
    winner: won ? playerIndex : (isDraw ? 'draw' : null),
    lastMove: { row, col },
  };

  return {
    valid: true,
    state: newState,
    winner: won ? playerIndex : (isDraw ? 'draw' : undefined),
  };
}

function checkWinner(board, row, col, player) {
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  for (const [dr, dc] of dirs) {
    let count = 1;
    for (let d = 1; d <= 3; d++) {
      const r = row + dr*d, c = col + dc*d;
      if (r >= 0 && r < 6 && c >= 0 && c < 7 && board[r][c] === player) count++;
      else break;
    }
    for (let d = 1; d <= 3; d++) {
      const r = row - dr*d, c = col - dc*d;
      if (r >= 0 && r < 6 && c >= 0 && c < 7 && board[r][c] === player) count++;
      else break;
    }
    if (count >= 4) return true;
  }
  return false;
}

module.exports = { createGame, handleMove };
