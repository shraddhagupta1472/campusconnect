const API_URL = "/api/leaderboard";

// Demo fallback leaderboard (used when API is unreachable)
const DEMO_LEADERBOARD = [
  { id: 'u1', name: 'Ritu Yadav', blogs: 12, originality: 92 },
  { id: 'u2', name: 'Sanjana Chouhan', blogs: 9, originality: 88 },
  { id: 'u3', name: 'Shraddha Gupta', blogs: 7, originality: 85 },
  { id: 'u4', name: 'Vaishnavi Kushwah', blogs: 5, originality: 80 }
];

let cachedUsers = [];

function renderLeaderboard(users) {
  users = (users || []);
  users.sort((a, b) => b.originality - a.originality || b.blogs - a.blogs);

  const leaderboard = document.getElementById("leaderboard");
  leaderboard.innerHTML = "";

  if (!users.length) {
    leaderboard.innerHTML = `<tr><td colspan="4" class="text-muted text-center">No leaderboard data available.</td></tr>`;
    const last = document.getElementById('lastUpdated'); if (last) last.textContent = 'Last updated: —';
    return;
  }

  users.forEach((user, index) => {
    let medal =
      index === 0 ? "gold" :
      index === 1 ? "silver" :
      index === 2 ? "bronze" : "";

    const rowId = `lb-row-${user.id || user.name.replace(/\s+/g,'-').toLowerCase()}-${index}`;

    leaderboard.innerHTML += `
      <tr id="${rowId}" class="lb-row">
        <td class="rank ${medal}">#${index + 1}</td>
        <td>
          <strong>${user.name}</strong><br>
          <span class="ethical-tag">Self-written</span>
        </td>
        <td>${user.blogs}</td>
        <td>
          <div class="progress">
            <div class="progress-bar" style="width:${user.originality}%"></div>
          </div>
          <small>${user.originality}% Original</small>
        </td>
      </tr>
    `;
  });

  // small animation: briefly highlight top 3 rows
  const rows = document.querySelectorAll('.lb-row');
  rows.forEach((r, i) => {
    if (i < 3) {
      r.classList.add('highlight');
      setTimeout(() => r.classList.remove('highlight'), 1200);
    }
  });

  // update last updated timestamp
  const last = document.getElementById('lastUpdated');
  if (last) last.textContent = 'Last updated: ' + new Date().toLocaleTimeString();
}

async function loadLeaderboard() {
  let users = [];
  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error('Non-OK response');
    users = await res.json();
    // if API returned empty, fall back to demo
    if (!users || !users.length) throw new Error('Empty leaderboard');
  } catch (err) {
    console.warn('Failed to fetch leaderboard, using demo data.', err);
    users = DEMO_LEADERBOARD.slice();
    showDemoBanner('Leaderboard is using demo data because the API is unavailable.');
  }

  cachedUsers = users;
  renderLeaderboard(cachedUsers);

// small demo banner helper
function showDemoBanner(msg) {
  if (document.getElementById('cc_demo_banner')) return;
  const c = document.createElement('div');
  c.id = 'cc_demo_banner';
  c.className = 'alert alert-warning';
  c.style.margin = '12px 0';
  c.innerHTML = msg || 'Showing demo content.';
  const container = document.querySelector('.container');
  if (container) container.insertBefore(c, container.firstChild);
}
}



document.addEventListener("DOMContentLoaded", () => {
  loadLeaderboard();

  // connect to socket.io for real-time updates; fallback to polling if sockets unavailable
  let socketConnected = false;
  try {
    if (typeof io !== 'undefined') {
      const socket = io();
      socket.on('connect', () => {
        socketConnected = true;
        console.log('socket connected for leaderboard:', socket.id);
      });
      socket.on('leaderboard', (data) => {
        try { cachedUsers = data; renderLeaderboard(cachedUsers); } catch (e) { console.error('render error', e); }
      });
      socket.on('disconnect', () => {
        socketConnected = false;
        console.warn('socket disconnected from leaderboard');
      });
    }
  } catch (e) { console.warn('Socket.io not available, will rely on polling fallback'); }

  // search box: filter cached results
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const q = (e.target.value || '').toLowerCase().trim();
      if (!q) return renderLeaderboard(cachedUsers);
      const filtered = cachedUsers.filter(u => ((u.name || '') + ' ' + (u.blogs||'') + ' ' + (u.originality||'')).toLowerCase().includes(q));
      renderLeaderboard(filtered);
    });
  }

  // polling fallback: fetch every 30s if no socket connection
  setInterval(async () => {
    if (socketConnected) return; // socket active - no polling
    try {
      await loadLeaderboard();
    } catch (e) { /* ignore */ }
  }, 30 * 1000);
});
