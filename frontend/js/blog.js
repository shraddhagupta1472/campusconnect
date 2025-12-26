if (typeof API_BASE === 'undefined') { var API_BASE = (window.API_BASE || 'http://localhost:4000') + '/api'; }

// Demo fallback posts (used when backend is unavailable)
const DEMO_POSTS = [
  {
    id: 'demo1',
    title: 'Welcome to CampusConnect',
    content: 'This is a demo post shown because the backend is not reachable. Start the server to see real posts.',
    authorName: 'Campus Team',
    createdAt: new Date().toISOString(),
    essential: true,
    shareUrl: '/blog.html#demo1'
  },
  {
    id: 'demo2',
    title: 'Getting Started',
    content: 'Write your first blog by clicking the Write button. This demo post helps you preview the layout.',
    authorName: 'Admin',
    createdAt: new Date().toISOString(),
    essential: false,
    shareUrl: '/blog.html#demo2'
  },
  {
    id: 'demo3',
    title: 'Tips & Tricks',
    content: 'Use the search box, filters, and pagination to find posts. This is sample content only.',
    authorName: 'Guide',
    createdAt: new Date().toISOString(),
    essential: false,
    shareUrl: '/blog.html#demo3'
  }
];

// On DOM loaded
document.addEventListener('DOMContentLoaded', () => {
  const hashId = location.hash ? location.hash.replace('#', '') : null;
  if (hashId) showBlogDetail(hashId);
  loadBlogs();

  // pagination controls
  const prev = document.getElementById('prevPage');
  const next = document.getElementById('nextPage');
  const showAllBtn = document.getElementById('showAllBtn');
  if (prev) prev.addEventListener('click', () => {
    let page = Number(sessionStorage.getItem('cc_blog_page') || '1');
    if (page > 1) { sessionStorage.setItem('cc_blog_page', String(page - 1)); loadBlogs(); }
  });
  if (next) next.addEventListener('click', () => {
    let page = Number(sessionStorage.getItem('cc_blog_page') || '1'); page++; sessionStorage.setItem('cc_blog_page', String(page)); loadBlogs();
  });
  if (showAllBtn) showAllBtn.addEventListener('click', () => {
    const showAll = sessionStorage.getItem('cc_blog_show_all') === '1';
    sessionStorage.setItem('cc_blog_show_all', showAll ? '0' : '1'); loadBlogs();
  });

  window.addEventListener('hashchange', () => {
    const id = location.hash ? location.hash.replace('#', '') : null;
    if (id) showBlogDetail(id);
    else {
      document.getElementById('blogDetail').style.display = 'none';
      document.getElementById('blogContainer').style.display = '';
      loadBlogs();
    }
  });

  // socket for real-time updates
  try {
    if (typeof io !== 'undefined') {
      const socket = io();
      socket.on('new_blog', (b) => {
        try { showToast(`New post: ${b.title}`, 'info'); loadBlogs(); } catch (e) { console.error('socket new_blog render error', e); }
      });
    }
  } catch (e) { /* ignore */ }

  // Attach save button handler (ensure element exists after DOM parsed)
  const saveBtn = document.getElementById('saveEditBtn');
  if (saveBtn) saveBtn.addEventListener('click', () => saveEditBlog());
});

// attach save button (fallback for older browsers or when script loaded after modal)
// kept for backward compatibility
// const saveBtn = document.getElementById('saveEditBtn');
// if (saveBtn) saveBtn.addEventListener('click', () => saveEditBlog());

// Show single blog detail
async function showBlogDetail(id) {
  const container = document.getElementById('blogDetail');
  const list = document.getElementById('blogContainer');
  if (!container) return;

  try {
    container.innerHTML = '<div class="blog-detail"><p class="text-muted">Loading...</p></div>';
    container.style.display = '';
    list.style.display = 'none';

    const res = await fetch(`${API_BASE}/blogs/${encodeURIComponent(id)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      container.innerHTML = `<div class="blog-detail">
        <p class="text-danger">${escapeHtml(err.error || 'Blog not found')}</p>
        <a href="blog.html" class="btn btn-sm btn-outline-primary mt-2">Back to list</a>
      </div>`;
      return;
    }

    const b = await res.json();
    const title = escapeHtml(b.title || 'Untitled');
    const author = escapeHtml(b.authorName || b.authorId || 'Unknown');
    const date = b.createdAt ? new Date(b.createdAt).toLocaleString() : '';
    const content = escapeHtml(b.content || '');

    container.innerHTML = `
      <div class="blog-detail">
        <div class="d-flex align-items-center justify-content-between">
          <h2>${title}</h2>
          ${b.essential ? '<div><span class="essential-badge">Essential</span></div>' : ''}
        </div>
        <div class="meta">By ${author} · ${date}</div>
        <div class="content">${content}</div>
        <div class="mt-3"><a href="blog.html" class="btn btn-sm btn-outline-primary">Back to list</a></div>
      </div>`;
  } catch (err) {
    container.innerHTML = `<div class="blog-detail">
      <p class="text-danger">Could not load blog</p>
      <a href="blog.html" class="btn btn-sm btn-outline-primary mt-2">Back to list</a>
    </div>`;
  }
}

// Load list of blogs
async function loadBlogs() {
  const container = document.getElementById('blogContainer');
  if (!container) return;

  container.innerHTML = '';
  let blogs = [];

  try {
    const res = await fetch(`${API_BASE}/blogs`);
    if (res.ok) {
      blogs = await res.json();
      const demoBanner = document.getElementById('demoBanner');
      if (demoBanner) demoBanner.remove();
    } else throw new Error('Failed');
  } catch (err) {
    console.warn('Could not fetch blogs from API, falling back to demo posts.', err);
    blogs = DEMO_POSTS.slice();
    showDemoBanner();
  }

  const PAGE_SIZE = 12;
  let page = Number(sessionStorage.getItem('cc_blog_page') || '1');
  let showAll = sessionStorage.getItem('cc_blog_show_all') === '1';
  const total = blogs.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > totalPages) page = totalPages;

  const currentUser = JSON.parse(localStorage.getItem('cc_user') || 'null');
  const uid = currentUser && currentUser.id;

  // Sort
  const sort = document.getElementById('sortSelect') ? document.getElementById('sortSelect').value : 'newest';
  if (sort === 'oldest') blogs.reverse();

  // Essential-only filter
  const essentialOnly = document.getElementById('essentialOnly') ? document.getElementById('essentialOnly').checked : false;
  let filtered = essentialOnly ? blogs.filter(b => b.essential) : blogs;

  // Render essential section
  const essentialContainer = document.getElementById('essentialList');
  if (essentialContainer) {
    const essentials = blogs.filter(b => b.essential).slice(0, 6);
    if (essentials.length) {
      essentialContainer.innerHTML = '<h5>Essential</h5><div class="d-flex gap-2 flex-wrap" id="essentialInner"></div>';
      const inner = document.getElementById('essentialInner');
      inner.innerHTML = '';
      essentials.forEach(e => {
        const a = document.createElement('a');
        a.className = 'btn btn-sm btn-outline-danger';
        a.href = `blog.html#${e.id || e._id}`;
        a.textContent = e.title.slice(0, 40) + (e.title.length > 40 ? '…' : '');
        inner.appendChild(a);
      });
    } else essentialContainer.innerHTML = '';
  }

  // Pagination
  let startIdx = 0;
  let pageBlogs = filtered;
  if (!showAll) {
    startIdx = (page - 1) * PAGE_SIZE;
    pageBlogs = filtered.slice(startIdx, startIdx + PAGE_SIZE);
  }

  pageBlogs.forEach(b => {
    const id = b.id || b._id || '';
    const title = escapeHtml(b.title || '');
    const content = escapeHtml((b.content || '').slice(0, 220)) + (b.content && b.content.length > 220 ? '…' : '');
    const authorId = b.authorId || b.author || '';
    const canEdit = uid && authorId && uid === authorId;
    const img = b.image || b.imageUrl || 'images/blog1.png';

    const item = document.createElement('div');
    item.className = 'list-group-item blog-item';
    item.dataset.title = (b.title || '').toLowerCase();
    item.innerHTML = `
      <img src="${img}" class="blog-thumb" alt="">
      <div class="blog-body">
        <div style="position:relative">
          <div style="position:absolute;right:0;top:0">
            <button class="btn btn-sm action-btn bookmark-btn" data-id="${id}" data-title="${escapeHtml(b.title || '')}" title="Save bookmark">
              <i class="bi bi-bookmark"></i>
            </button>
            <button class="btn btn-sm action-btn btn-outline-secondary share-btn" data-id="${id}" data-url="${b.shareUrl || '/blog.html#' + id}" title="Share">
              <i class="bi bi-share-fill"></i>
            </button>
            ${canEdit ? `<button class="btn btn-sm action-btn btn-outline-primary edit-btn" data-id="${id}">Edit</button>` : ''}
          </div>
        </div>
        <div class="d-flex align-items-center justify-content-between">
          <div class="blog-title">${title}</div>
          <div>
            ${b.mood ? `<span class="tag-pill">${escapeHtml(b.mood)}</span>` : ''}
            ${b.essential ? '<span class="essential-badge" style="margin-left:8px">Essential</span>' : ''}
          </div>
        </div>
        <div class="blog-meta">By ${escapeHtml(b.authorName || authorId || 'Unknown')} · ${new Date(b.createdAt || Date.now()).toLocaleDateString()}</div>
        <p>${content}</p>
        <div class="blog-actions">
          <button class="btn btn-primary btn-sm read-btn" data-id="${id}">Read</button>
        </div>
      </div>
    `;
    container.appendChild(item);
  });

  // Pagination buttons
  const info = document.getElementById('paginationInfo');
  const prev = document.getElementById('prevPage');
  const next = document.getElementById('nextPage');
  if (info) info.textContent = showAll ? `Showing all ${total}` : `Showing ${Math.min(total, startIdx + 1)}-${Math.min(total, startIdx + PAGE_SIZE)} of ${total}`;
  if (prev) prev.disabled = showAll || page <= 1;
  if (next) next.disabled = showAll || page >= totalPages;

  const showAllBtn = document.getElementById('showAllBtn');
  if (showAllBtn) {
    showAllBtn.textContent = showAll ? 'Paginate' : 'Show all';
    showAllBtn.classList.toggle('active', showAll);
  }

  // Attach event handlers
  document.querySelectorAll('.read-btn').forEach(btn => btn.addEventListener('click', () => window.location.href = `blog.html#${btn.dataset.id}`));
  document.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', () => openEditModal(btn.dataset.id)));
  document.querySelectorAll('.bookmark-btn').forEach(btn => btn.addEventListener('click', async (e) => {
    const id = btn.dataset.id;
    const title = btn.dataset.title || '';
    const url = btn.dataset.url || `/blog.html#${id}`;
    try {
      await bookmarkBlog(id, title, url);
      btn.classList.add('bookmarked');
    } catch (err) {
      if (err && err.message === 'Unauthorized') showToast('Please sign in to bookmark', 'danger');
      else showToast('Could not save bookmark', 'danger');
    }
  }));
  document.querySelectorAll('.share-btn').forEach(btn => btn.addEventListener('click', async (e) => {
    const url = btn.dataset.url;
    try {
      if (navigator.share) await navigator.share({ title: document.title, text: 'Check out this blog', url: location.origin + url });
      else { await navigator.clipboard.writeText(location.origin + url); showToast('Link copied to clipboard', 'success'); }
    } catch { showToast('Could not share', 'danger'); }
  }));

  // Reload on sort/filter change
  const sortSelect = document.getElementById('sortSelect');
  if (sortSelect) sortSelect.addEventListener('change', loadBlogs);
  const essentialCheckbox = document.getElementById('essentialOnly');
  if (essentialCheckbox) essentialCheckbox.addEventListener('change', loadBlogs);

  document.dispatchEvent(new Event('cc:blogs-loaded'));
}

// Escape HTML
function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Helper to fetch with Authorization header
async function fetchWithAuth(url, opts = {}) {
  opts.headers = opts.headers || {};
  const token = localStorage.getItem('cc_token');
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, opts).then(res => {
    if (res.status === 401) { throw new Error('Unauthorized'); }
    return res;
  });
}

// Bookmark a blog
async function bookmarkBlog(id, title, href) {
  if (!id || !title) throw new Error('Missing');
  const res = await fetchWithAuth(`${API_BASE}/bookmarks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, title, href }) });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Failed'); }
  showToast('Saved to bookmarks', 'success');
}

// Edit modal handling
let currentEditId = null;
async function openEditModal(id) {
  try {
    const res = await fetch(`${API_BASE}/blogs/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error('Not found');
    const b = await res.json();
    document.getElementById('editTitle').value = b.title || '';
    document.getElementById('editContent').value = b.content || '';
    document.getElementById('editEssential').checked = !!b.essential;
    document.getElementById('editMood').value = b.mood || '';
    currentEditId = id;
    const modal = new bootstrap.Modal(document.getElementById('editBlogModal'));
    modal.show();
  } catch (e) {
    showToast('Could not load blog to edit', 'danger');
  }
}

async function saveEditBlog() {
  if (!currentEditId) return;
  const title = document.getElementById('editTitle').value;
  const content = document.getElementById('editContent').value;
  const essential = document.getElementById('editEssential').checked;
  const mood = document.getElementById('editMood').value || '';
  try {
    const res = await fetchWithAuth(`${API_BASE}/blogs/${encodeURIComponent(currentEditId)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, content, essential, mood }) });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Failed'); }
    showToast('Blog updated', 'success');
    const modalEl = document.getElementById('editBlogModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
    // refresh list/detail
    if (location.hash.replace('#','') === currentEditId) showBlogDetail(currentEditId);
    loadBlogs();
  } catch (e) {
    if (e.message === 'Unauthorized') showToast('Please sign in to edit', 'danger');
    else showToast('Could not update blog', 'danger');
  }
}

// attach save button
const saveBtn = document.getElementById('saveEditBtn');
if (saveBtn) saveBtn.addEventListener('click', () => saveEditBlog());

// Demo Banner
function showDemoBanner() {
  if (document.getElementById('demoBanner')) return;
  const c = document.createElement('div');
  c.id = 'demoBanner';
  c.className = 'alert alert-warning';
  c.style.margin = '12px 0';
  c.innerHTML = 'Showing demo posts because the backend is not reachable. Start the server to view live posts.';
  const container = document.querySelector('.container');
  if (container) container.insertBefore(c, container.firstChild);
}

// Toast messages
function showToast(msg, type='info') {
  let c = document.getElementById('cc_toast_container');
  if (!c) {
    c = document.createElement('div');
    c.id = 'cc_toast_container';
    c.style.position = 'fixed';
    c.style.right = '16px';
    c.style.top = '16px';
    c.style.zIndex = '99999';
    document.body.appendChild(c);
  }
  const el = document.createElement('div');
  el.style.padding = '8px 12px';
  el.style.marginBottom = '8px';
  el.style.borderRadius = '8px';
  el.style.background = type === 'success' ? '#2e7d32' : type === 'danger' ? '#ff4d4f' : '#333';
  el.style.color = '#fff';
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(-6px)'; }, 2600);
  setTimeout(() => el.remove(), 3200);
}


//toggle mode (guarded)
const toggleBtn = document.getElementById('themeToggle');
if (toggleBtn) {
  toggleBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('mode', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
  });
}

// Persist user preference
if (localStorage.getItem('mode') === 'dark') {
  document.body.classList.add('dark-mode');
}
