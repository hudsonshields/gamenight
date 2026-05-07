const WORDS = [
  'apple','beach','cloud','dance','earth','flame','grape','heart','image','juice',
  'knife','lemon','music','night','ocean','piano','queen','river','storm','tiger',
  'brave','crisp','delta','ember','frost','grand','haste','irony','jewel','karma',
  'laser','magic','nerve','orbit','pearl','realm','shift','track','unity','valor',
  'wheat','yield','arena','blend','chart','draft','elite','flint','grove','honor',
  'ivory','light','model','noble','prism','query','ridge','solar','table','world',
  'cactus','dollar','empire','fabric','garden','harbor','island','jungle','knight',
  'marble','needle','orange','palace','rabbit','silver','temple','umbrella','voyage',
  'walrus','xyster','yellow','zombie','anchor','bridge','candle','donkey','falcon',
  'gopher','helmet','insect','jaguar','koala','lantern','muffin','noodle','oyster',
  'pillow','quartz','rocket','salmon','turtle','vortex','wombat','zipper',
];

const ROUNDS = 5;

function scramble(word) {
  let arr = word.split('');
  do {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  } while (arr.join('') === word);
  return arr.join('');
}

function pickWord(used) {
  const pool = WORDS.filter(w => !used.includes(w));
  return pool[Math.floor(Math.random() * pool.length)] || null;
}

function createGame() {
  const used = [];
  const word = pickWord(used);
  used.push(word);
  return {
    round: 1,
    totalRounds: ROUNDS,
    word,
    scrambled: scramble(word),
    scores: [0, 0],
    roundOver: false,
    roundWinner: null,
    used,
    // preloaded next word
    _nextWord: pickWord([...used]),
    _nextUsed: null,
  };
}

function handleMove(state, move, playerIndex) {
  if (state.roundOver) return { valid: false };

  const guess = (move.guess || '').toLowerCase().trim();
  if (guess !== state.word) {
    return { valid: true, state, incorrect: true };
  }

  // Correct!
  const scores = [...state.scores];
  scores[playerIndex]++;

  const isLast = state.round >= state.totalRounds;

  let nextWord = null, nextUsed = null;
  if (!isLast) {
    const used = [...state.used];
    nextWord = state._nextWord || pickWord(used);
    if (nextWord) used.push(nextWord);
    nextUsed = used;
  }

  const gameWinner = isLast
    ? (scores[0] > scores[1] ? 0 : scores[1] > scores[0] ? 1 : 'draw')
    : undefined;

  return {
    valid: true,
    state: {
      ...state,
      scores,
      roundOver: true,
      roundWinner: playerIndex,
      isLast,
      _nextWord: nextWord,
      _nextUsed: nextUsed,
    },
    roundWinner: playerIndex,
    winner: gameWinner,
  };
}

function nextRound(state) {
  if (!state.roundOver || state.isLast) return state;
  const word = state._nextWord;
  const used = state._nextUsed || [...state.used, word];
  const nextNext = pickWord(used);
  return {
    round: state.round + 1,
    totalRounds: state.totalRounds,
    word,
    scrambled: scramble(word),
    scores: state.scores,
    roundOver: false,
    roundWinner: null,
    used,
    isLast: false,
    _nextWord: nextNext,
    _nextUsed: null,
  };
}

module.exports = { createGame, handleMove, nextRound };
