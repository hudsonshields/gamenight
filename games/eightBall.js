const BALL_R = 11;
const TABLE_H = 400;
const SOLIDS  = [1,2,3,4,5,6,7];
const STRIPES = [9,10,11,12,13,14,15];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateRack() {
  const solids  = shuffle([...SOLIDS]);
  const stripes = shuffle([...STRIPES]);
  const rack = new Array(15).fill(0);
  rack[4]  = 8;                // 8-ball centre of rack
  rack[10] = solids.pop();     // back-row corner 1: solid
  rack[14] = stripes.pop();    // back-row corner 2: stripe
  const rest = shuffle([...solids, ...stripes]);
  let ri = 0;
  for (let i = 0; i < 15; i++) if (rack[i] === 0) rack[i] = rest[ri++];
  return rack;
}

function createGame() {
  const initialBalls = [];
  initialBalls.push({ id: 0, x: 200, y: TABLE_H / 2 });

  const rackX = 580, rackY = TABLE_H / 2;
  const order = generateRack();
  let idx = 0;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col <= row; col++) {
      const x = rackX + row * (BALL_R * 2 + 0.5);
      const y = rackY + (col - row / 2) * (BALL_R * 2 + 0.5);
      initialBalls.push({ id: order[idx++], x, y });
    }
  }

  return {
    currentPlayer: 0,
    phase: 'break',           // break | play | over
    assignments: [null, null], // 'solids' | 'stripes'
    allPocketed: [],
    winner: null,
    foul: false,
    ballInHand: false,
    message: 'Break shot!',
    initialBalls,
  };
}

function getGroup(id) {
  if (id >= 1 && id <= 7)  return 'solids';
  if (id >= 9 && id <= 15) return 'stripes';
  return null;
}

function processShot(state, result, playerIndex) {
  if (state.currentPlayer !== playerIndex) return { valid: false };

  const { pocketedBalls, cueBallPocketed, firstHitBall } = result;
  const s = JSON.parse(JSON.stringify(state));

  let foul = false;
  let switchTurn = true;
  let msg = '';

  // ── Foul checks ──
  if (cueBallPocketed) foul = true;
  if (firstHitBall === null && !cueBallPocketed) foul = true;

  // Wrong group hit first
  if (!foul && firstHitBall !== null && s.assignments[playerIndex]) {
    const hg = getGroup(firstHitBall);
    if (hg && hg !== s.assignments[playerIndex] && firstHitBall !== 8) foul = true;
  }

  // ── Record pocketed balls ──
  const nonCue = pocketedBalls.filter(id => id !== 0);
  for (const id of nonCue) if (!s.allPocketed.includes(id)) s.allPocketed.push(id);

  const eightSunk = pocketedBalls.includes(8);

  // ── 8-ball logic ──
  if (eightSunk) {
    if (s.phase === 'break') {
      s.winner = playerIndex; s.phase = 'over';
      s.message = '8-ball on the break — you win!';
      return { valid: true, state: s, winner: playerIndex };
    }
    const myGroup = s.assignments[playerIndex];
    const myBalls = myGroup === 'solids' ? SOLIDS : STRIPES;
    const allMineCleared = myGroup && myBalls.every(id =>
      s.allPocketed.includes(id) || pocketedBalls.includes(id));

    if (allMineCleared && !foul) {
      s.winner = playerIndex; s.phase = 'over';
      s.message = 'All balls cleared & 8-ball sunk — you win!';
    } else {
      s.winner = 1 - playerIndex; s.phase = 'over';
      s.message = foul ? 'Foul on the 8-ball — you lose!'
                       : '8-ball sunk too early — you lose!';
    }
    return { valid: true, state: s, winner: s.winner };
  }

  // ── Assign groups ──
  if (!s.assignments[playerIndex] && nonCue.length > 0 && !foul) {
    const first = nonCue.find(id => getGroup(id));
    if (first) {
      const g = getGroup(first);
      s.assignments[playerIndex] = g;
      s.assignments[1 - playerIndex] = g === 'solids' ? 'stripes' : 'solids';
      msg = `You're ${g}!`;
    }
  }
  if (s.phase === 'break') s.phase = 'play';

  // ── Turn logic ──
  if (foul) {
    switchTurn = true;
    s.ballInHand = true;
    msg = cueBallPocketed ? 'Scratch! Ball in hand.' : 'Foul! Ball in hand.';
  } else if (nonCue.length > 0) {
    const my = s.assignments[playerIndex];
    if (!my || nonCue.some(id => getGroup(id) === my)) {
      switchTurn = false;
      msg = msg || 'Nice shot — go again!';
    }
  }

  if (switchTurn) s.currentPlayer = 1 - playerIndex;
  s.foul = foul;
  s.ballInHand = foul;
  s.message = msg || (switchTurn ? "Opponent's turn." : 'Your turn.');

  return { valid: true, state: s, winner: undefined };
}

// Not used — 8-ball has its own socket events
function handleMove() { return { valid: false }; }

module.exports = { createGame, processShot, handleMove };
