// home2.js — updated to use CampusConnect frontend auth keys and API
const API_BASE = (window.API_BASE || 'http://localhost:4000') + '/api';

document.addEventListener('DOMContentLoaded', () => {
    // allow anonymous access but load user info if logged in
    const token = localStorage.getItem('cc_token');
    if (token) loadUserInfo();
    loadRecentBlogs();

    // connect socket.io for real-time new blogs
    try {
      if (typeof io !== 'undefined') {
        const socket = io();
        socket.on('new_blog', (b) => {
          try { prependBlogCard(b); } catch (e) { console.error('render new_blog error', e); }
        });
      }
    } catch (e) { /* ignore */ }
});

async function loadUserInfo() {
    const token = localStorage.getItem('cc_token');
    if (!token) return;
    try {
        const res = await fetch(`${API_BASE}/profile`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error('Unauthorized');
        const data = await res.json();
        const user = data.user || data;
        const welcomeEl = document.getElementById('welcomeName');
        if (welcomeEl && user && user.name) welcomeEl.textContent = user.name;
        const pointsEl = document.getElementById('userPoints');
        if (pointsEl && user.points !== undefined) pointsEl.textContent = user.points;
        const streakEl = document.getElementById('userStreak');
        if (streakEl && user.streak !== undefined) streakEl.textContent = user.streak + 'd';
    } catch (err) {
        console.error('Failed to load user info:', err);
        // invalid token — clear stored auth info (don't force redirect for public home page)
        localStorage.removeItem('cc_token');
        localStorage.removeItem('cc_user');
    }
} 

// Recent blogs
async function loadRecentBlogs() {
  try {
    const res = await fetch((window.API_BASE || '') + '/api/blogs');
    if (!res.ok) throw new Error('Failed to fetch blogs');
    const blogs = await res.json();
    renderBlogList(blogs);
  } catch (err) {
    console.error('Failed to load blogs:', err);
    // fallback to sample content
    const sample = [
      { id: '1', title: 'Welcome to CampusConnect', content: 'This is your hub for campus updates and blogs', authorName: 'Admin', createdAt: new Date().toISOString(), shareUrl: '#' }
    ];
    renderBlogList(sample);
  }
}

function renderBlogList(blogs) {
  const container = document.getElementById('recentList');
  if (!container) return;
  container.innerHTML = '';
  blogs.slice(0,6).forEach(b => {
    const el = document.createElement('div');
    el.className = 'col-md-4';
    el.innerHTML = `
      <div class="recent-card">
        <img src="images/chome1.jpg" class="recent-img" alt="${escapeHtml(b.title)}">
        <h5 class="mt-3">${escapeHtml(b.title)}</h5>
        <p>${escapeHtml((b.content || '').slice(0,120))}</p>
        <a href="${b.shareUrl || '#'}" class="read-more">Read More →</a>
      </div>
    `;
    container.appendChild(el);
  });
}

function prependBlogCard(b) {
  const container = document.getElementById('recentList');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'col-md-4';
  el.innerHTML = `
    <div class="recent-card">
      <img src="images/chome1.jpg" class="recent-img" alt="${escapeHtml(b.title)}">
      <h5 class="mt-3">${escapeHtml(b.title)}</h5>
      <p>${escapeHtml((b.content || '').slice(0,120))}</p>
      <a href="${b.shareUrl || '#'}" class="read-more">Read More →</a>
    </div>
  `;
  container.insertBefore(el, container.firstChild);
}

function escapeHtml(s) { return (s||'').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":"&#39;",'"':'&quot;'}[c])); }
