const API_BASE = (window.API_BASE || 'http://localhost:4000') + '/api';

async function fetchBookmarks() {
  const token = localStorage.getItem('cc_token');
  if (!token) return [];
  const res = await fetch(`${API_BASE}/bookmarks`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    // token invalid/expired
    localStorage.removeItem('cc_token');
    localStorage.removeItem('cc_user');
    return [];
  }
  if (!res.ok) return [];
  const data = await res.json();
  return data.bookmarks || [];
}

async function addBookmark(entry) {
  const token = localStorage.getItem('cc_token');
  if (!token) { window.location.href = 'login.html'; return null; }
  const res = await fetch(`${API_BASE}/bookmarks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(entry)
  });
  if (res.status === 401) {
    localStorage.removeItem('cc_token');
    localStorage.removeItem('cc_user');
    throw new Error('Please sign in to save bookmarks');
  }
  if (!res.ok) throw new Error('Failed to add bookmark');
  const data = await res.json();
  return data.bookmarks || [];
}

async function updateBookmark(id, changes) {
  const token = localStorage.getItem('cc_token');
  if (!token) { window.location.href = 'login.html'; return null; }
  const res = await fetch(`${API_BASE}/bookmarks/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(changes)
  });
  if (res.status === 401) { localStorage.removeItem('cc_token'); localStorage.removeItem('cc_user'); throw new Error('Please sign in'); }
  if (!res.ok) throw new Error('Failed to update bookmark');
  const data = await res.json();
  return data.bookmarks || [];
}

async function removeBookmark(id) {
  const token = localStorage.getItem('cc_token');
  if (!token) { window.location.href = 'login.html'; return null; }
  const res = await fetch(`${API_BASE}/bookmarks/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    localStorage.removeItem('cc_token');
    localStorage.removeItem('cc_user');
    throw new Error('Please sign in to remove bookmarks');
  }
  if (!res.ok) throw new Error('Failed to remove');
  const data = await res.json();
  return data.bookmarks || [];
}

// attach to pages
document.addEventListener('DOMContentLoaded', async () => {
  const bookmarkBtns = Array.from(document.querySelectorAll('.bookmark-btn'));
  if (bookmarkBtns.length) {
    // get current bookmarks
    let current = [];
    try { current = await fetchBookmarks(); } catch (e) { current = []; }
    const ids = new Set(current.map(b => b.id));
    // check user preference for bookmarksEnabled
    let bookmarksEnabled = true;
    try {
      const token = localStorage.getItem('cc_token');
      if (token) {
        const res = await fetch((window.API_BASE || 'http://localhost:4000') + '/api/profile', { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const p = await res.json();
          bookmarksEnabled = typeof p.user.bookmarksEnabled === 'boolean' ? p.user.bookmarksEnabled : true;
        }
      }
    } catch (e) { /* ignore */ }
    if (!bookmarksEnabled) {
      bookmarkBtns.forEach(b => b.style.display = 'none');
      // show banner if disabled
      try { window.ccBookmarks && window.ccBookmarks.updateBanner && window.ccBookmarks.updateBanner(false); } catch (e) {}
    }
    bookmarkBtns.forEach(btn => attachBookmark(btn, ids, bookmarksEnabled));
    // listen for dynamically loaded blogs
    document.addEventListener('cc:blogs-loaded', () => {
      const newBtns = Array.from(document.querySelectorAll('.bookmark-btn'));
      newBtns.forEach(btn => attachBookmark(btn, ids, bookmarksEnabled));
    });
  }

  // settings page bookmark list
  const bookmarksList = document.getElementById('bookmarksList');
  if (bookmarksList) {
    try {
      const bms = await fetchBookmarks();
      renderBookmarksList(bms);
    } catch (e) { console.error(e); }
  }

  // profile page small list
  const profileBookmarks = document.getElementById('profileBookmarks');
  if (profileBookmarks) {
    try {
      const bms = await fetchBookmarks();
      const list = document.createElement('div');
      list.className = 'd-flex gap-2 flex-wrap';
      if (!bms.length) {
        profileBookmarks.innerHTML = '<small class="text-muted">No bookmarks yet.</small>';
      } else {
        // show pinned first
        bms.sort((a,b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
        bms.slice(0,6).forEach(b => {
          const a = document.createElement('a');
          a.href = b.href || '#';
          a.className = 'btn btn-sm btn-outline-primary d-flex align-items-center gap-1';
          a.textContent = b.title || b.id;
          a.target = '_blank';
          a.rel = 'noopener';
          if (b.pinned) {
            const pin = document.createElement('i'); pin.className = 'bi bi-pin-angle-fill ms-1'; pin.title = 'Pinned';
            a.appendChild(pin);
          }
          list.appendChild(a);
        });
        profileBookmarks.appendChild(list);
      }
    } catch (e) { console.error(e); }
  }
});

// Banner for disabled bookmarks (session dismissible)
function _createDisabledBanner() {
  if (document.getElementById('bookmarksDisabledBanner')) return null;
  const d = document.createElement('div');
  d.id = 'bookmarksDisabledBanner';
  d.className = 'bookmarks-disabled-banner';
  d.innerHTML = `<div class="inner">Bookmarks are disabled. <button class="btn btn-sm btn-link ms-2 dismiss">Dismiss</button></div>`;
  d.querySelector('.dismiss').addEventListener('click', () => {
    sessionStorage.setItem('bookmarksBannerDismissed', '1');
    d.remove();
  });
  document.body.appendChild(d);
  return d;
}

function attachBookmark(btn, idsSet, bookmarksEnabled) {
  if (btn.dataset.bound) return; // already attached
  const id = btn.dataset.id;
  if (idsSet && idsSet.has && idsSet.has(id)) btn.classList.add('bookmarked');
  if (idsSet && idsSet.has && idsSet.has(id)) {
    const ico = btn.querySelector('.bi'); if (ico) { ico.classList.remove('bi-bookmark'); ico.classList.add('bi-bookmark-fill'); }
  }
  if (!bookmarksEnabled) { btn.style.display = 'none'; }
  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!bookmarksEnabled) { showToast('Bookmarks are disabled', 'warning'); return; }
    const title = btn.dataset.title || btn.closest('.dashboard-card')?.querySelector('h5')?.innerText || 'Untitled';
    const href = btn.dataset.href || '#';
    btn.disabled = true; btn.setAttribute('aria-busy', 'true');
    try {
      if (btn.classList.contains('bookmarked')) {
        await removeBookmark(id);
        btn.classList.remove('bookmarked');
        const ico = btn.querySelector('.bi'); if (ico) { ico.classList.remove('bi-bookmark-fill'); ico.classList.add('bi-bookmark'); }
        showToast('Bookmark removed', 'info');
      } else {
        await addBookmark({ id, title, href });
        btn.classList.add('bookmarked');
        const ico = btn.querySelector('.bi'); if (ico) { ico.classList.remove('bi-bookmark'); ico.classList.add('bi-bookmark-fill'); }
        showToast('Bookmark saved', 'success');
      }
    } catch (err) {
      console.error(err);
      if (err && err.message && err.message.toLowerCase().includes('sign in')) {
        showToast(err.message, 'warning');
        setTimeout(() => window.location.href = 'login.html', 800);
      } else {
        showToast('Could not update bookmark', 'danger');
      }
    } finally {
      btn.disabled = false; btn.removeAttribute('aria-busy');
    }
  });
  btn.dataset.bound = '1';
}

function showDisabledBanner() {
  if (sessionStorage.getItem('bookmarksBannerDismissed')) return;
  _createDisabledBanner();
}

function hideDisabledBanner() {
  const el = document.getElementById('bookmarksDisabledBanner');
  if (el) el.remove();
}

// Expose API to update banner
window.ccBookmarks = window.ccBookmarks || {};
window.ccBookmarks.updateBanner = function(enabled) {
  if (enabled) hideDisabledBanner(); else showDisabledBanner();
};

function renderBookmarksList(bms) {
  const container = document.getElementById('bookmarksList');
  if (!container) return;
  container.innerHTML = '';
  if (!bms.length) {
    container.innerHTML = '<p class="text-muted">No bookmarks saved yet.</p>';
    return;
  }
  const ul = document.createElement('ul');
  ul.className = 'list-group';
  bms.forEach(b => {
    const li = document.createElement('li');
    li.className = 'list-group-item d-flex justify-content-between align-items-center';
    const left = document.createElement('div');
    left.className = 'd-flex align-items-center gap-2';
    const pinBadge = document.createElement('span');
    pinBadge.className = 'badge bg-warning text-dark';
    pinBadge.textContent = 'Pinned';
    pinBadge.style.display = b.pinned ? '' : 'none';
    const a = document.createElement('a');
    a.href = b.href || '#';
    a.textContent = b.title || b.id;
    a.target = '_blank';
    a.rel = 'noopener';
    left.appendChild(pinBadge);
    left.appendChild(a);
    const right = document.createElement('div');
    const pinBtn = document.createElement('button');
    pinBtn.className = 'btn btn-sm btn-outline-secondary me-2';
    pinBtn.textContent = b.pinned ? 'Unpin' : 'Pin';
    pinBtn.addEventListener('click', async () => {
      try {
        await updateBookmark(b.id, { pinned: !b.pinned });
        const bms2 = await fetchBookmarks();
        renderBookmarksList(bms2);
        showToast(b.pinned ? 'Bookmark unpinned' : 'Bookmark pinned', 'success');
      } catch (e) { console.error(e); showToast('Could not update bookmark', 'danger'); }
    });
    const btn = document.createElement('button');
    btn.className = 'btn btn-sm btn-outline-danger';
    btn.textContent = 'Remove';
    btn.addEventListener('click', async () => {
      try {
        await removeBookmark(b.id);
        // refresh list
        const bms2 = await fetchBookmarks();
        renderBookmarksList(bms2);
        showToast('Bookmark removed', 'info');
      } catch (e) { console.error(e); showToast('Could not remove bookmark', 'danger'); }
    });
    right.appendChild(pinBtn);
    right.appendChild(btn);
    li.appendChild(left);
    li.appendChild(right);
    ul.appendChild(li);
  });
  container.appendChild(ul);
}

// Simple toast helper
function showToast(msg, type = 'info') {
  try {
    let container = document.getElementById('cc_toast_container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'cc_toast_container';
      container.style.position = 'fixed';
      container.style.right = '16px';
      container.style.top = '16px';
      container.style.zIndex = '99999';
      document.body.appendChild(container);
    }
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.style.minWidth = '160px';
    el.style.marginBottom = '8px';
    el.style.padding = '8px 12px';
    el.style.borderRadius = '8px';
    el.style.boxShadow = '0 6px 16px rgba(0,0,0,0.12)';
    el.style.background = type === 'danger' ? '#ff4d4f' : type === 'warning' ? '#ffec3d' : type === 'success' ? 'linear-gradient(135deg,#4caf50,#2e7d32)' : '#333';
    el.style.color = type === 'warning' ? '#111' : '#fff';
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(-6px)'; }, 2600);
    setTimeout(() => el.remove(), 3200);
  } catch (e) { console.log(msg); }
}
