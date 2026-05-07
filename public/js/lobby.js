async function createRoom(gameType) {
  const btn = event.target;
  btn.disabled = true;
  btn.textContent = 'Creating…';

  try {
    const res = await fetch('/api/create-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameType }),
    });
    const { code, error } = await res.json();
    if (error) throw new Error(error);
    window.location.href = `/games/${gameType}/?room=${code}`;
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Create Room';
    showJoinError('Could not create room. Is the server running?');
  }
}

async function joinRoom() {
  const input = document.getElementById('joinInput');
  const code = input.value.trim().toUpperCase();
  if (code.length < 4) return showJoinError('Enter the full room code.');

  try {
    const res = await fetch(`/api/room/${code}`);
    const { gameType, error } = await res.json();
    if (error || !gameType) throw new Error(error || 'Not found');
    window.location.href = `/games/${gameType}/?room=${code}`;
  } catch (e) {
    showJoinError('Room not found. Check the code and try again!');
  }
}

function showJoinError(msg) {
  const el = document.getElementById('joinError');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 4000);
}

// Allow Enter key in join input
document.getElementById('joinInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') joinRoom();
});
