/* ═══════════════════════════════════════════════════════════════════════════════
   8-BALL POOL  –  Client-side physics, rendering & multiplayer
   ═══════════════════════════════════════════════════════════════════════════════ */

// ── Constants ─────────────────────────────────────────────────────────────────

const CUSHION   = 50;          // border/cushion width (canvas px)
const TABLE_W   = 800;         // playing surface width
const TABLE_H   = 400;         // playing surface height
const BALL_R    = 11;
const POCKET_R  = 20;
const FRICTION  = 0.984;
const MIN_VEL   = 0.12;
const MAX_POWER = 22;
const WALL_E    = 0.75;        // wall restitution
const SUBSTEPS  = 3;           // physics sub-steps per frame

const POCKETS = [
  { x: 4,           y: 4           },
  { x: TABLE_W / 2, y: -2          },
  { x: TABLE_W - 4, y: 4           },
  { x: 4,           y: TABLE_H - 4 },
  { x: TABLE_W / 2, y: TABLE_H + 2 },
  { x: TABLE_W - 4, y: TABLE_H - 4 },
];

const COLORS = {
  0:'#f0ece4', 1:'#f5c518', 2:'#1d4ed8', 3:'#dc2626', 4:'#6b21a8',
  5:'#ea580c', 6:'#16a34a', 7:'#7c2d12', 8:'#111',
  9:'#f5c518', 10:'#1d4ed8', 11:'#dc2626', 12:'#6b21a8',
  13:'#ea580c', 14:'#16a34a', 15:'#7c2d12',
};

// ── Socket / params ───────────────────────────────────────────────────────────

const socket   = io();
const params   = new URLSearchParams(location.search);
const roomCode = (params.get('room') || '').toUpperCase();
if (!roomCode) window.location.href = '/';

// ── State ─────────────────────────────────────────────────────────────────────

let playerIndex   = null;
let gameState     = null;
let balls         = [];
let isMyTurn      = false;
let shotInProgress = false;
let ballInHand    = false;
let loopStarted   = false;

// Aiming
let charging      = false;
let chargeStart   = 0;
let power         = 0;
let mouseX        = 450;
let mouseY        = 250;

// Shot tracking
let pocketedThisShot = [];
let firstHitBall     = null;
let cueBallPocketed  = false;
let trackedFirstHit  = false;

// Pocket animation
let pocketAnimations = [];   // { ball, x, y, scale, alpha, frame }

// Canvas
const canvas = document.getElementById('poolCanvas');
const ctx    = canvas.getContext('2d');

// ── Ball setup from server positions ──────────────────────────────────────────

function loadBalls(initialBalls) {
  balls = initialBalls.map(b => ({
    id: b.id, x: b.x, y: b.y, vx: 0, vy: 0, pocketed: false,
  }));
}

// ── Physics engine ────────────────────────────────────────────────────────────

function simulate() {
  let anyMoving = false;
  for (let step = 0; step < SUBSTEPS; step++) {
    for (const b of balls) {
      if (b.pocketed) continue;
      b.x += b.vx / SUBSTEPS;
      b.y += b.vy / SUBSTEPS;
    }

    // Ball-ball collisions
    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        if (balls[i].pocketed || balls[j].pocketed) continue;
        collide(balls[i], balls[j]);
      }
    }

    // Wall bounces
    for (const b of balls) {
      if (b.pocketed) continue;
      wallBounce(b);
    }

    // Pocket detection
    for (const b of balls) {
      if (b.pocketed) continue;
      for (const p of POCKETS) {
        const dx = b.x - p.x, dy = b.y - p.y;
        if (Math.sqrt(dx*dx + dy*dy) < POCKET_R) {
          b.pocketed = true;
          // Start pocket animation
          pocketAnimations.push({
            ball: { ...b }, x: p.x + CUSHION, y: p.y + CUSHION,
            scale: 1, alpha: 1, frame: 0,
          });
          b.vx = 0; b.vy = 0;
          if (b.id === 0) cueBallPocketed = true;
          else pocketedThisShot.push(b.id);
          break;
        }
      }
    }
  }

  // Apply friction (once per frame)
  for (const b of balls) {
    if (b.pocketed) continue;
    b.vx *= FRICTION;
    b.vy *= FRICTION;
    if (Math.abs(b.vx) < MIN_VEL && Math.abs(b.vy) < MIN_VEL) {
      b.vx = 0; b.vy = 0;
    }
    if (b.vx !== 0 || b.vy !== 0) anyMoving = true;
  }

  return anyMoving;
}

function collide(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const dist = Math.sqrt(dx*dx + dy*dy);
  if (dist >= BALL_R * 2 || dist === 0) return;

  // Track first ball the cue ball touches
  if (!trackedFirstHit) {
    if (a.id === 0)      { firstHitBall = b.id; trackedFirstHit = true; }
    else if (b.id === 0) { firstHitBall = a.id; trackedFirstHit = true; }
  }

  const nx = dx / dist, ny = dy / dist;
  const dvn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  if (dvn <= 0) return;

  a.vx -= dvn * nx;  a.vy -= dvn * ny;
  b.vx += dvn * nx;  b.vy += dvn * ny;

  const overlap = BALL_R * 2 - dist;
  a.x -= overlap / 2 * nx;  a.y -= overlap / 2 * ny;
  b.x += overlap / 2 * nx;  b.y += overlap / 2 * ny;
}

function wallBounce(b) {
  // Skip near pockets
  for (const p of POCKETS) {
    const dx = b.x - p.x, dy = b.y - p.y;
    if (Math.sqrt(dx*dx + dy*dy) < POCKET_R + BALL_R) return;
  }
  if (b.x - BALL_R < 0)       { b.x = BALL_R;             b.vx =  Math.abs(b.vx) * WALL_E; }
  if (b.x + BALL_R > TABLE_W) { b.x = TABLE_W - BALL_R;   b.vx = -Math.abs(b.vx) * WALL_E; }
  if (b.y - BALL_R < 0)       { b.y = BALL_R;              b.vy =  Math.abs(b.vy) * WALL_E; }
  if (b.y + BALL_R > TABLE_H) { b.y = TABLE_H - BALL_R;    b.vy = -Math.abs(b.vy) * WALL_E; }
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function render() {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // ── Table ──
  // Outer wood
  ctx.fillStyle = '#4a2512';
  ctx.beginPath(); ctx.roundRect(0, 0, W, H, 14); ctx.fill();
  // Inner border
  ctx.fillStyle = '#6b3a22';
  ctx.beginPath(); ctx.roundRect(6, 6, W-12, H-12, 10); ctx.fill();
  // Diamond inlays on rails
  drawDiamonds();
  // Cushion
  ctx.fillStyle = '#1a7a42';
  ctx.fillRect(CUSHION - 10, CUSHION - 10, TABLE_W + 20, TABLE_H + 20);
  // Felt
  const feltGrad = ctx.createLinearGradient(CUSHION, CUSHION, CUSHION, CUSHION + TABLE_H);
  feltGrad.addColorStop(0, '#28854a');
  feltGrad.addColorStop(1, '#1f7a3f');
  ctx.fillStyle = feltGrad;
  ctx.fillRect(CUSHION, CUSHION, TABLE_W, TABLE_H);
  // Subtle texture lines
  ctx.strokeStyle = 'rgba(0,0,0,.03)';
  ctx.lineWidth = 1;
  for (let i = 0; i < TABLE_W; i += 6) {
    ctx.beginPath();
    ctx.moveTo(CUSHION + i, CUSHION);
    ctx.lineTo(CUSHION + i, CUSHION + TABLE_H);
    ctx.stroke();
  }
  // Head string (dashed line at 1/4)
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = 'rgba(255,255,255,.08)';
  ctx.beginPath();
  ctx.moveTo(CUSHION + TABLE_W * 0.25, CUSHION);
  ctx.lineTo(CUSHION + TABLE_W * 0.25, CUSHION + TABLE_H);
  ctx.stroke();
  ctx.setLineDash([]);
  // Foot spot
  ctx.beginPath();
  ctx.arc(CUSHION + 580, CUSHION + TABLE_H / 2, 3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,.12)';
  ctx.fill();

  // ── Pockets ──
  for (const p of POCKETS) {
    const px = p.x + CUSHION, py = p.y + CUSHION;
    ctx.beginPath();
    ctx.arc(px, py, POCKET_R + 4, 0, Math.PI * 2);
    ctx.fillStyle = '#0f0f0f';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px, py, POCKET_R + 1, 0, Math.PI * 2);
    ctx.strokeStyle = '#3a2210';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px, py, POCKET_R, 0, Math.PI * 2);
    ctx.fillStyle = '#050505';
    ctx.fill();
  }

  // ── Balls ──
  // Sort so higher balls draw on top (visual depth)
  const sortedBalls = balls.filter(b => !b.pocketed).sort((a, b) => a.y - b.y);
  for (const b of sortedBalls) drawBall(b);

  // ── Pocket animations ──
  for (let i = pocketAnimations.length - 1; i >= 0; i--) {
    const a = pocketAnimations[i];
    a.frame++;
    a.scale *= 0.88;
    a.alpha *= 0.9;
    if (a.frame > 15) { pocketAnimations.splice(i, 1); continue; }
    ctx.save();
    ctx.globalAlpha = a.alpha;
    ctx.translate(a.x, a.y);
    ctx.scale(a.scale, a.scale);
    ctx.translate(-a.x, -a.y);
    drawBallAt(a.ball, a.x, a.y);
    ctx.restore();
  }

  // ── Aim / cue stick ──
  if (isMyTurn && !shotInProgress && !ballInHand) drawAim();
  if (ballInHand && isMyTurn && !shotInProgress) drawGhostBall();

  // ── Power bar (when charging) ──
  if (charging && power > 0) drawPowerBar();
}

function drawDiamonds() {
  ctx.fillStyle = '#c4a35a';
  const positions = [0.125, 0.25, 0.375, 0.625, 0.75, 0.875];
  for (const p of positions) {
    // Top rail
    drawDiamond(CUSHION + TABLE_W * p, 20);
    // Bottom rail
    drawDiamond(CUSHION + TABLE_W * p, canvas.height - 20);
  }
  const sidePos = [0.25, 0.5, 0.75];
  for (const p of sidePos) {
    // Left rail
    drawDiamond(20, CUSHION + TABLE_H * p);
    // Right rail
    drawDiamond(canvas.width - 20, CUSHION + TABLE_H * p);
  }
}

function drawDiamond(x, y) {
  ctx.beginPath();
  ctx.moveTo(x, y - 4);
  ctx.lineTo(x + 3, y);
  ctx.lineTo(x, y + 4);
  ctx.lineTo(x - 3, y);
  ctx.closePath();
  ctx.fill();
}

function drawBall(ball) {
  drawBallAt(ball, ball.x + CUSHION, ball.y + CUSHION);
}

function drawBallAt(ball, x, y) {
  const r = BALL_R;
  ctx.save();

  // Shadow
  ctx.beginPath();
  ctx.arc(x + 2, y + 2, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  ctx.fill();

  if (ball.id === 0) {
    // Cue ball
    const g = ctx.createRadialGradient(x - r*.3, y - r*.3, 1, x, y, r);
    g.addColorStop(0, '#fff');
    g.addColorStop(1, '#ddd');
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2);
    ctx.fillStyle = g; ctx.fill();
  } else if (ball.id >= 9) {
    // Stripe
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.clip();
    ctx.fillStyle = COLORS[ball.id];
    ctx.fillRect(x - r, y - r*.45, r*2, r*.9);
    ctx.restore();
  } else {
    // Solid
    const g = ctx.createRadialGradient(x - r*.3, y - r*.3, 1, x, y, r);
    g.addColorStop(0, lighten(COLORS[ball.id], 40));
    g.addColorStop(1, COLORS[ball.id]);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2);
    ctx.fillStyle = g; ctx.fill();
  }

  // Number circle
  if (ball.id > 0) {
    ctx.beginPath(); ctx.arc(x, y, r*.36, 0, Math.PI*2);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.fillStyle = '#111';
    ctx.font = `bold ${Math.round(r*.48)}px Arial`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(ball.id, x, y + .5);
  }

  // Shine
  ctx.beginPath(); ctx.arc(x - r*.28, y - r*.28, r*.16, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill();

  // Outline
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2);
  ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = .5; ctx.stroke();

  ctx.restore();
}

function lighten(hex, amt) {
  const n = parseInt(hex.replace('#',''), 16);
  const r = Math.min(255, (n >> 16) + amt);
  const g = Math.min(255, ((n >> 8) & 0xFF) + amt);
  const b = Math.min(255, (n & 0xFF) + amt);
  return `rgb(${r},${g},${b})`;
}

function drawAim() {
  const cue = balls.find(b => b.id === 0);
  if (!cue || cue.pocketed) return;
  const cx = cue.x + CUSHION, cy = cue.y + CUSHION;
  const dx = mouseX - cx, dy = mouseY - cy;
  const angle = Math.atan2(dy, dx);

  // ── Ghost ball: show first collision target ──
  const hit = findFirstHit(cue.x, cue.y, angle);
  const lineEnd = hit
    ? { x: hit.contactX + CUSHION, y: hit.contactY + CUSHION }
    : { x: cx + Math.cos(angle) * 600, y: cy + Math.sin(angle) * 600 };

  // Dotted aim line
  ctx.save();
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = 'rgba(255,255,255,.22)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(lineEnd.x, lineEnd.y); ctx.stroke();
  ctx.setLineDash([]);

  // Ghost ball at contact
  if (hit) {
    ctx.beginPath();
    ctx.arc(hit.contactX + CUSHION, hit.contactY + CUSHION, BALL_R, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.lineWidth = 1; ctx.stroke();
  }
  ctx.restore();

  // ── Cue stick ──
  if (charging) {
    const pullBack = power * 2.5;
    const stickLen = 240;
    const startDist = BALL_R + 5 + pullBack;
    const sx = cx - Math.cos(angle) * startDist;
    const sy = cy - Math.sin(angle) * startDist;
    const ex = cx - Math.cos(angle) * (startDist + stickLen);
    const ey = cy - Math.sin(angle) * (startDist + stickLen);

    ctx.save();
    // Shadow
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 10; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sx+1, sy+1); ctx.lineTo(ex+1, ey+1); ctx.stroke();
    // Body
    const sg = ctx.createLinearGradient(sx, sy, ex, ey);
    sg.addColorStop(0, '#edc878'); sg.addColorStop(0.02, '#fff');
    sg.addColorStop(0.04, '#deb887'); sg.addColorStop(.6, '#b8860b');
    sg.addColorStop(1, '#2e1503');
    ctx.strokeStyle = sg; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
    // Ferrule
    const fx = cx - Math.cos(angle) * (BALL_R + 5 + pullBack);
    const fy = cy - Math.sin(angle) * (BALL_R + 5 + pullBack);
    const fx2 = cx - Math.cos(angle) * (BALL_R + 5 + pullBack + 6);
    const fy2 = cy - Math.sin(angle) * (BALL_R + 5 + pullBack + 6);
    ctx.strokeStyle = '#ccc'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx2, fy2); ctx.stroke();
    // Tip
    ctx.strokeStyle = '#4682b4'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(fx, fy);
    ctx.lineTo(cx - Math.cos(angle) * (BALL_R + 4 + pullBack), cy - Math.sin(angle) * (BALL_R + 4 + pullBack));
    ctx.stroke();
    ctx.restore();
  }
}

function findFirstHit(cx, cy, angle) {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  let closestT = Infinity, hitBall = null;

  for (const b of balls) {
    if (b.pocketed || b.id === 0) continue;
    const ox = b.x - cx, oy = b.y - cy;
    const proj = ox * dx + oy * dy;
    if (proj < BALL_R) continue;
    const perpX = cx + dx * proj - b.x;
    const perpY = cy + dy * proj - b.y;
    const perp = Math.sqrt(perpX*perpX + perpY*perpY);
    if (perp < BALL_R * 2 && proj < closestT) {
      closestT = proj;
      hitBall = b;
    }
  }
  if (!hitBall) return null;
  // Contact point: where cue ball centre would be when touching
  const backoff = Math.sqrt(Math.max(0, (BALL_R*2)**2 - ((hitBall.x - (cx + dx*closestT))**2 + (hitBall.y - (cy + dy*closestT))**2)));
  const contactT = closestT - backoff;
  return { ball: hitBall, contactX: cx + dx * contactT, contactY: cy + dy * contactT };
}

function drawGhostBall() {
  const mx = clamp(mouseX, CUSHION + BALL_R, CUSHION + TABLE_W - BALL_R);
  const my = clamp(mouseY, CUSHION + BALL_R, CUSHION + TABLE_H - BALL_R);
  ctx.save();
  ctx.globalAlpha = .45;
  ctx.beginPath(); ctx.arc(mx, my, BALL_R, 0, Math.PI*2);
  ctx.fillStyle = '#fff'; ctx.fill();
  ctx.strokeStyle = '#aaa'; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
  // "Click to place" text
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center';
  ctx.fillText('click to place', mx, my + BALL_R + 16);
}

function drawPowerBar() {
  const bx = canvas.width - 28, by = CUSHION + 20;
  const bw = 14, bh = TABLE_H - 40;
  const fill = (power / MAX_POWER) * bh;
  // BG
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 7); ctx.fill();
  // Fill
  const g = ctx.createLinearGradient(0, by + bh, 0, by);
  g.addColorStop(0, '#22c55e'); g.addColorStop(.5, '#eab308'); g.addColorStop(1, '#ef4444');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.roundRect(bx, by + bh - fill, bw, fill, 7); ctx.fill();
  // Label
  ctx.fillStyle = '#fff'; ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center';
  ctx.fillText(Math.round(power / MAX_POWER * 100) + '%', bx + bw/2, by - 8);
}

// ── Input ─────────────────────────────────────────────────────────────────────

canvas.addEventListener('mousemove', (e) => {
  const r = canvas.getBoundingClientRect();
  mouseX = (e.clientX - r.left) * (canvas.width / r.width);
  mouseY = (e.clientY - r.top) * (canvas.height / r.height);
});

canvas.addEventListener('mousedown', (e) => {
  if (shotInProgress) return;
  if (!isMyTurn) return;

  const r = canvas.getBoundingClientRect();
  mouseX = (e.clientX - r.left) * (canvas.width / r.width);
  mouseY = (e.clientY - r.top) * (canvas.height / r.height);

  if (ballInHand) { placeCueBall(); return; }

  charging = true;
  chargeStart = performance.now();
  power = 0;
});

canvas.addEventListener('mouseup', () => {
  if (!charging) return;
  charging = false;
  if (power > .8) takeShot();
  power = 0;
});

// Touch support for mobile
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const t = e.touches[0], r = canvas.getBoundingClientRect();
  mouseX = (t.clientX - r.left) * (canvas.width / r.width);
  mouseY = (t.clientY - r.top) * (canvas.height / r.height);
  if (shotInProgress || !isMyTurn) return;
  if (ballInHand) { placeCueBall(); return; }
  charging = true; chargeStart = performance.now(); power = 0;
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const t = e.touches[0], r = canvas.getBoundingClientRect();
  mouseX = (t.clientX - r.left) * (canvas.width / r.width);
  mouseY = (t.clientY - r.top) * (canvas.height / r.height);
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  if (!charging) return;
  charging = false;
  if (power > .8) takeShot();
  power = 0;
}, { passive: false });

function placeCueBall() {
  const x = clamp(mouseX - CUSHION, BALL_R, TABLE_W - BALL_R);
  const y = clamp(mouseY - CUSHION, BALL_R, TABLE_H - BALL_R);
  // Reject if overlapping another ball
  if (balls.some(b => !b.pocketed && b.id !== 0 &&
      Math.sqrt((b.x - x)**2 + (b.y - y)**2) < BALL_R * 2.5)) return;

  const cue = balls.find(b => b.id === 0);
  cue.x = x; cue.y = y; cue.pocketed = false; cue.vx = 0; cue.vy = 0;
  ballInHand = false;
  socket.emit('place-cue-ball', { x, y });
}

function takeShot() {
  const cue = balls.find(b => b.id === 0);
  if (!cue || cue.pocketed) return;
  const cx = cue.x + CUSHION, cy = cue.y + CUSHION;
  const angle = Math.atan2(mouseY - cy, mouseX - cx);
  socket.emit('take-shot', { angle, power });
}

function executeShot(angle, shotPower) {
  const cue = balls.find(b => b.id === 0);
  if (!cue) return;
  cue.vx = Math.cos(angle) * shotPower * .9;
  cue.vy = Math.sin(angle) * shotPower * .9;
  shotInProgress  = true;
  pocketedThisShot = [];
  firstHitBall    = null;
  cueBallPocketed = false;
  trackedFirstHit = false;
}

function onShotComplete() {
  shotInProgress = false;
  if (isMyTurn) {
    socket.emit('shot-complete', {
      pocketedBalls: pocketedThisShot,
      cueBallPocketed,
      firstHitBall,
      ballPositions: balls.map(b => ({ id: b.id, x: b.x, y: b.y, pocketed: b.pocketed })),
    });
  }
}

// ── Game loop ─────────────────────────────────────────────────────────────────

function gameLoop() {
  // Update power while charging
  if (charging && isMyTurn && !shotInProgress) {
    const elapsed = (performance.now() - chargeStart) / 1000;
    power = Math.min(elapsed / 1.6 * MAX_POWER, MAX_POWER);
  }

  if (shotInProgress) {
    const moving = simulate();
    if (!moving) onShotComplete();
  }

  render();
  requestAnimationFrame(gameLoop);
}

// ── Socket events ─────────────────────────────────────────────────────────────

socket.on('connect', () => socket.emit('join-room', { code: roomCode }));
socket.on('room-error', ({ message }) => alert(message));

socket.on('waiting', ({ code }) => {
  document.getElementById('displayCode').textContent = code;
  showScreen('waiting');
});

socket.on('game-start', ({ playerIndex: pi, state, scores }) => {
  playerIndex = pi;
  gameState = state;
  isMyTurn = state.currentPlayer === playerIndex;
  loadBalls(state.initialBalls);
  updateUI(state, scores);
  showScreen('game');
  if (!loopStarted) { loopStarted = true; gameLoop(); }
});

socket.on('shot-fired', ({ angle, power: p }) => {
  executeShot(angle, p);
});

socket.on('turn-update', ({ state, ballPositions, scores }) => {
  gameState = state;
  isMyTurn = state.currentPlayer === playerIndex;
  ballInHand = state.ballInHand && isMyTurn;

  if (ballPositions) {
    for (const bp of ballPositions) {
      const b = balls.find(bl => bl.id === bp.id);
      if (b) { b.x = bp.x; b.y = bp.y; b.pocketed = bp.pocketed; b.vx = 0; b.vy = 0; }
    }
  }

  // Respawn cue ball for ball-in-hand
  if (state.ballInHand) {
    const cue = balls.find(b => b.id === 0);
    if (cue) { cue.pocketed = false; cue.x = 200; cue.y = TABLE_H/2; cue.vx = 0; cue.vy = 0; }
    if (isMyTurn) ballInHand = true;
  }

  updateUI(state, scores);
});

socket.on('cue-ball-placed', ({ x, y }) => {
  const cue = balls.find(b => b.id === 0);
  if (cue) { cue.x = x; cue.y = y; cue.pocketed = false; cue.vx = 0; cue.vy = 0; }
  ballInHand = false;
});

socket.on('game-over', ({ winner, scores }) => {
  updateScores(scores);
  setTimeout(() => showGameOver(winner, scores), 600);
});

socket.on('rematch-start', ({ state, scores, playerIndex: pi }) => {
  if (pi !== undefined) playerIndex = pi;
  gameState = state;
  isMyTurn = state.currentPlayer === playerIndex;
  ballInHand = false; shotInProgress = false;
  pocketAnimations = [];
  loadBalls(state.initialBalls);
  updateUI(state, scores);
  hideGameOver();
  showScreen('game');
});

socket.on('rematch-requested', () => {
  document.getElementById('goSub').textContent = 'Opponent wants a rematch!';
});

socket.on('opponent-left', () => {
  alert('Your opponent disconnected.');
  window.location.href = '/';
});

// ── UI helpers ────────────────────────────────────────────────────────────────

function updateUI(state, scores) {
  const sb = document.getElementById('statusBanner');
  sb.className = 'status-banner';
  if (isMyTurn) {
    sb.textContent = ballInHand
      ? '🎱 Click to place the cue ball'
      : (state.message || '🎯 Hold mouse to charge, release to shoot!');
    sb.classList.add('your-turn');
  } else {
    sb.textContent = state.message || '⏳ Opponent is shooting…';
    sb.classList.add('their-turn');
  }

  const ai = document.getElementById('assignmentInfo');
  if (state.assignments && state.assignments[playerIndex]) {
    const g = state.assignments[playerIndex];
    ai.textContent = `You: ${g === 'solids' ? '● Solids (1-7)' : '◐ Stripes (9-15)'}`;
  } else {
    ai.textContent = 'Pocket a ball to get assigned!';
  }

  updatePocketedDisplay();
  updateScores(scores);
}

function updatePocketedDisplay() {
  const el = document.getElementById('pocketedBalls');
  el.innerHTML = '';
  for (const b of balls.filter(b => b.pocketed && b.id > 0).sort((a,b) => a.id - b.id)) {
    const d = document.createElement('div');
    d.className = 'pocketed-ball' + (b.id >= 9 ? ' stripe' : '');
    d.style.setProperty('--ball-color', COLORS[b.id]);
    d.textContent = b.id;
    el.appendChild(d);
  }
}

function updateScores(scores) {
  if (!scores || playerIndex === null) return;
  document.getElementById('scoreYou').textContent = scores[playerIndex] ?? 0;
  document.getElementById('scoreOpp').textContent = scores[1 - playerIndex] ?? 0;
}

function showGameOver(winner, scores) {
  document.getElementById('goEmoji').textContent = winner === playerIndex ? '🏆' : '😢';
  document.getElementById('goTitle').textContent = winner === playerIndex ? 'You Win!' : 'They Win!';
  document.getElementById('goScoreYou').textContent = scores[playerIndex] ?? 0;
  document.getElementById('goScoreOpp').textContent = scores[1 - playerIndex] ?? 0;
  document.getElementById('screen-gameover').style.display = 'flex';
}

function hideGameOver() {
  document.getElementById('screen-gameover').style.display = 'none';
}

function sendRematch() {
  document.getElementById('goSub').textContent = 'Waiting for opponent…';
  socket.emit('rematch');
}

function copyLink() {
  navigator.clipboard.writeText(`${location.origin}/games/8ball/?room=${roomCode}`).then(() => {
    const btn = document.getElementById('copyBtn');
    btn.textContent = '✅ Copied!'; btn.classList.add('copied');
    setTimeout(() => { btn.textContent = '📋 Copy Invite Link'; btn.classList.remove('copied'); }, 2000);
  });
}

function showScreen(name) {
  document.getElementById('screen-waiting').style.display = 'none';
  document.getElementById('screen-game').style.display = 'none';
  if (name === 'waiting') document.getElementById('screen-waiting').style.display = '';
  if (name === 'game')    document.getElementById('screen-game').style.display = '';
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
