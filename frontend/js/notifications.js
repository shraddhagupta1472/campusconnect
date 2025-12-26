if (typeof API_BASE === 'undefined') { var API_BASE = (window.API_BASE || 'http://localhost:4000') + '/api'; }

const DEMO_NOTIFICATIONS = [
  { id: 'n1', message: 'Welcome to CampusConnect! Create your first post to earn a badge.', url: '#', createdAt: new Date().toISOString() },
  { id: 'n2', message: 'Your challenge submission received 5 upvotes!', url: '#', createdAt: new Date().toISOString() },
  { id: 'n3', message: 'New event: HackFest on Friday. Register now!', url: '#', createdAt: new Date().toISOString() }
];

document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('cc_token');
  const list = document.getElementById('notificationsList');
  if (!list) return;

  // If not signed in, show demo notifications and prompt to sign in
  if (!token) {
    list.innerHTML = '<div class="alert alert-info">Sign in to view your real notifications. Below are sample notifications.</div>';
    renderNotifications(DEMO_NOTIFICATIONS);
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/notifications`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error('Failed to load notifications');
    const data = await res.json();
    if (!data.notifications || !data.notifications.length) {
      list.innerHTML = '<p class="text-muted">No notifications.</p>';
      return;
    }
    renderNotifications(data.notifications);
  } catch (err) {
    console.warn('Notifications API failed, showing sample notifications.', err);
    list.innerHTML = '<div class="alert alert-warning">Notifications are unavailable. Showing sample items.</div>';
    renderNotifications(DEMO_NOTIFICATIONS);
  }
});

function renderNotifications(arr) {
  const list = document.getElementById('notificationsList');
  if (!list) return;
  const ul = document.createElement('ul');
  ul.className = 'list-group';
  arr.forEach(n => {
    const li = document.createElement('li');
    li.className = 'list-group-item d-flex justify-content-between align-items-start';
    const left = document.createElement('div');
    left.innerHTML = `<div><strong>${escapeHtml(n.message)}</strong><div class="small text-muted">${new Date(n.createdAt).toLocaleString()}</div></div>`;
    const right = document.createElement('div');
    const view = document.createElement('a');
    view.href = n.url || '#';
    view.textContent = 'View';
    view.className = 'btn btn-sm btn-primary me-2';
    const del = document.createElement('button');
    del.className = 'btn btn-sm btn-outline-danger';
    del.textContent = 'Dismiss';
    del.addEventListener('click', () => li.remove());
    right.appendChild(view);
    right.appendChild(del);
    li.appendChild(left);
    li.appendChild(right);
    ul.appendChild(li);
  });
  // clear previous list contents (but keep banner if present)
  const banner = document.querySelector('#notificationsList .alert');
  list.innerHTML = '';
  if (banner) list.appendChild(banner);
  list.appendChild(ul);
}

// real-time notification listener: prepend incoming notifications when they arrive
try {
  if (typeof io !== 'undefined') {
    const socket = io();
    socket.on('notification', (data) => {
      try {
        const current = JSON.parse(localStorage.getItem('cc_user') || 'null');
        if (!current) return;
        if (data && data.recipientId && String(data.recipientId) === String(current.id)) {
          const n = data.notification;
          const list = document.getElementById('notificationsList');
          if (!list) return;
          const ul = list.querySelector('ul') || document.createElement('ul');
          ul.className = 'list-group';
          const li = document.createElement('li');
          li.className = 'list-group-item d-flex justify-content-between align-items-start';
          const left = document.createElement('div');
          left.innerHTML = `<div><strong>${escapeHtml(n.message)}</strong><div class="small text-muted">${new Date(n.createdAt).toLocaleString()}</div></div>`;
          const right = document.createElement('div');
          const view = document.createElement('a'); view.href = n.url || '#'; view.textContent = 'View'; view.className = 'btn btn-sm btn-primary me-2';
          const del = document.createElement('button'); del.className = 'btn btn-sm btn-outline-danger'; del.textContent = 'Dismiss';
          del.addEventListener('click', () => li.remove());
          right.appendChild(view); right.appendChild(del);
          li.appendChild(left); li.appendChild(right);
          // insert at top
          if (!list.querySelector('ul')) { list.innerHTML = ''; list.appendChild(ul); }
          ul.insertBefore(li, ul.firstChild);
          if (window.CCShowToast) window.CCShowToast(n.message || 'New notification', 'info');
          // update small notif count in navbar if present
          try { const badge = document.getElementById('notifCount'); if (badge) { badge.style.display='inline-block'; badge.textContent = String(Number(badge.textContent||'0')+1); } } catch(e){}
        }
      } catch (e) { /* ignore */ }
    });
  }
} catch (e) { /* ignore */ }

function escapeHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

