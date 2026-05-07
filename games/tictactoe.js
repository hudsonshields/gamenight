function createGame() {
  return { board: Array(9).fill(null), currentPlayer: 0, winner: null, winLine: null };
}

function handleMove(state, move, playerIndex) {
  if (state.currentPlayer !== playerIndex || state.winner !== null) return { valid: false };
  const { index } = move;
  if (index < 0 || index > 8 || state.board[index] !== null) return { valid: false };

  const board = [...state.board];
  board[index] = playerIndex;

  const { winner, line } = checkWinner(board);
  const isDraw = winner === null && board.every(c => c !== null);

  const newState = {
    board,
    currentPlayer: 1 - playerIndex,
    winner: winner !== null ? winner : (isDraw ? 'draw' : null),
    winLine: line,
  };

  return {
    valid: true,
    state: newState,
    winner: winner !== null ? winner : (isDraw ? 'draw' : undefined),
  };
}

function checkWinner(board) {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6],
  ];
  for (const line of lines) {
    const [a,b,c] = line;
    if (board[a] !== null && board[a] === board[b] && board[b] === board[c]) {
      return { winner: board[a], line };
    }
  }
  return { winner: null, line: null };
}

module.exports = { createGame, handleMove };
