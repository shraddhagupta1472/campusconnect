const NOTIF_API = (window.API_BASE || 'http://localhost:4000') + '/api/notifications';

async function refreshNotifBadge() {
  const btn = document.getElementById('notifBtn');
  const countEl = document.getElementById('notifCount');
  if (!btn || !countEl) return;
  const token = localStorage.getItem('cc_token');
  if (!token) { countEl.style.display = 'none'; return; }
  try {
    const res = await fetch(NOTIF_API, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { countEl.style.display = 'none'; return; }
    const data = await res.json();
    const unread = (data.notifications || []).filter(n => !n.read).length;
    if (unread > 0) { countEl.textContent = String(unread); countEl.style.display = ''; } else countEl.style.display = 'none';
  } catch (e) { countEl.style.display = 'none'; }
}

document.addEventListener('DOMContentLoaded', () => {
  refreshNotifBadge();
  // refresh periodically
  setInterval(refreshNotifBadge, 30_000);
  // click goes to notifications list
  const btn = document.getElementById('notifBtn'); if (btn) btn.addEventListener('click', (e) => { /* allow link navigation */ });
});
