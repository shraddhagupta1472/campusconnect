const RES_API = (window.API_BASE || 'http://localhost:4000') + '/api/resources';

// Demo resources to use when API is unavailable
const DEMO_RESOURCES = [
  { id: 'r1', title: 'HTML & CSS Basics', url: 'https://developer.mozilla.org/', description: 'A short guide to responsive HTML and CSS for beginners.', tags: ['html','css'], author: 'MDN', createdAt: new Date().toISOString() },
  { id: 'r2', title: 'JavaScript Guide', url: 'https://javascript.info/', description: 'Modern JS features explained with examples.', tags: ['javascript'], author: 'JS Guide', createdAt: new Date().toISOString() },
  { id: 'r3', title: 'Accessibility Checklist', url: 'https://webaim.org/', description: 'Make your web content accessible to everyone.', tags: ['accessibility'], author: 'WebAIM', createdAt: new Date().toISOString() },
  { id: 'r4', title: 'FreeCodeCamp Tutorials', url: 'https://www.freecodecamp.org/', description: 'Hands-on coding tutorials and projects.', tags: ['tutorials','projects'], author: 'freeCodeCamp', createdAt: new Date().toISOString() }
];

// small toast helper (used by this file)
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

document.addEventListener('DOMContentLoaded', () => {
  loadResources();
  document.getElementById('resSearch').addEventListener('input', () => filterResources());
  document.getElementById('resSort').addEventListener('change', () => loadResources());

  // open Add Resource modal
  const addBtn = document.getElementById('addResourceBtn');
  if (addBtn) addBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const modal = new bootstrap.Modal(document.getElementById('addResourceModal'));
    modal.show();
  });

  // submit handler for Add Resource modal
  const submit = document.getElementById('addResSubmit');
  if (submit) submit.addEventListener('click', async () => {
    const title = (document.getElementById('addResTitle').value || '').trim();
    const url = (document.getElementById('addResUrl').value || '').trim();
    const desc = (document.getElementById('addResDesc').value || '').trim();
    const tags = (document.getElementById('addResTags').value || '').split(',').map(t => t.trim()).filter(Boolean);
    const errEl = document.getElementById('addResError');
    errEl.style.display = 'none';
    if (!title || !url) { errEl.textContent = 'Title and URL are required.'; errEl.style.display = 'block'; return; }

    const token = localStorage.getItem('cc_token');
    const payload = { title, url, description: desc, tags };
    try {
      if (token) {
        const res = await fetch(RES_API, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: `Bearer ${token}` } : {}), body: JSON.stringify(payload) });
        if (!res.ok) { const d = await res.json().catch(()=>({})); throw new Error(d.error || 'Failed to add resource'); }
        const created = await res.json();
        allResources.unshift(created);
        showToast('Resource added', 'success');
      } else {
        // local demo add
        const created = Object.assign({ id: 'local-' + Date.now(), author: 'You', createdAt: new Date().toISOString() }, payload);
        allResources.unshift(created);
        showToast('Resource added locally (sign in to save)', 'info');
      }
      // close modal and refresh
      const modalEl = document.getElementById('addResourceModal');
      const modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();
      // clear inputs
      document.getElementById('addResTitle').value = '';
      document.getElementById('addResUrl').value = '';
      document.getElementById('addResDesc').value = '';
      document.getElementById('addResTags').value = '';
      renderResources(allResources);
      renderTagFilters(allResources);
    } catch (err) {
      console.error(err);
      errEl.textContent = err.message || 'Failed to add resource';
      errEl.style.display = 'block';
    }
  });
});


let allResources = [];

async function loadResources() {
  const container = document.getElementById('resourcesList');
  container.innerHTML = '';
  try {
    const res = await fetch(RES_API);
    if (res.ok) allResources = await res.json();
    else throw new Error('API error');
    if (!allResources || !allResources.length) throw new Error('No resources');
  } catch (e) {
    console.warn('Resources API unavailable, falling back to demo resources.', e);
    allResources = DEMO_RESOURCES.slice();
    // show small demo banner
    showDemoBanner('Using sample resources because the Resources API is unavailable.');
  }
  renderResources(allResources);
  renderTagFilters(allResources);

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

function renderResources(list) {
  const container = document.getElementById('resourcesList');
  container.innerHTML = '';
  if (!list.length) { container.innerHTML = '<p class="text-muted">No resources found.</p>'; return; }
  // switch container to grid layout
  container.classList.add('resources-grid');
  list.forEach(r => {
    const el = document.createElement('a');
    el.className = 'resource-card list-group-item list-group-item-action';
    el.href = r.url || '#';
    el.target = '_blank';
    el.innerHTML = `
      ${r.image ? `<img src="${r.image}" alt="" class="blog-thumb"/>` : ''}
      <div class="body">
        <h5>${escapeHtml(r.title)}</h5>
        <p class="mb-1">${escapeHtml(r.description)}</p>
        <div>${(r.tags||[]).map(t=>`<span class="tag-pill">${escapeHtml(t)}</span>`).join('')}</div>
      </div>
      <div class="meta">By ${escapeHtml(r.author || 'Unknown')} <small>${new Date(r.createdAt).toLocaleDateString()}</small></div>
    `;
    container.appendChild(el);
  });
}

function renderTagFilters(list) {
  const tags = Array.from(new Set(list.flatMap(r => r.tags || [])));
  const container = document.getElementById('tagFilters');
  container.innerHTML = '';
  tags.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-outline-secondary btn-sm';
    btn.textContent = t;
    btn.onclick = () => {
      const filtered = allResources.filter(r => (r.tags || []).includes(t));
      renderResources(filtered);
    };
    container.appendChild(btn);
  });
}

function filterResources() {
  const q = (document.getElementById('resSearch').value || '').toLowerCase();
  const sort = document.getElementById('resSort').value;
  let list = allResources.filter(r => (r.title + ' ' + r.description + ' ' + (r.tags||[]).join(' ')).toLowerCase().includes(q));
  if (sort === 'oldest') list = list.slice().reverse();
  renderResources(list);
}

function escapeHtml(s){ if(!s) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
