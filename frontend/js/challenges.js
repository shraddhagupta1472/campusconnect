// challenges.js
const API_BASE = (window.API_BASE || 'http://localhost:4000') + '/api';

// small toast helper
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

document.addEventListener("DOMContentLoaded", () => {
    loadChallenges();

    // socket real-time updates
    try {
      if (typeof io !== 'undefined') {
        const socket = io();
        socket.on('challenge_created', (c) => {
          try { showToast(`New challenge: ${c.title}`, 'info'); loadChallenges(); } catch (e) { console.error('socket challenge_created', e); }
        });
        socket.on('challenge_joined', (d) => {
          try {
            const countEl = document.getElementById(`participants-${d.id}`);
            if (countEl) countEl.textContent = `${d.participants} participants`;
            showToast(`A user joined a challenge`, 'info');
          } catch (e) { console.error('socket challenge_joined', e); }
        });
      }
    } catch (e) { /* ignore */ }
});

async function loadChallenges() {
    const token = localStorage.getItem("cc_token");

    let challenges = [];
    try {
        const res = await fetch(`${API_BASE}/challenges`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (res.ok) challenges = await res.json();
    } catch (err) {
        console.warn('Failed to fetch challenges, using defaults', err);
    }

    // Fallback defaults if API not available or returned nothing
    if (!challenges || challenges.length === 0) {
        challenges = [
            { id: 'c1', title: 'Web Development Challenge', description: 'Build a responsive website for a campus event using HTML, CSS and JS.', authorName: 'Campus Team', participants: [], createdAt: new Date().toISOString() },
            { id: 'c2', title: 'Cybersecurity Challenge', description: 'Complete tasks related to ethical hacking and web security scenarios.', authorName: 'Security Club', participants: [], createdAt: new Date().toISOString() },
            { id: 'c3', title: 'AI & Robotics Challenge', description: 'Create a small AI or robotics project and showcase it.', authorName: 'Robotics Club', participants: [], createdAt: new Date().toISOString() }
        ];
    }

    const container = document.getElementById("challengeContainer");
    container.innerHTML = "";

    // search / sort
    const searchBox = document.getElementById('challengeSearch');
    const sortSel = document.getElementById('challengeSort');
    let query = searchBox ? searchBox.value.trim().toLowerCase() : '';
    const sortMode = sortSel ? sortSel.value : 'new';

    // filter by search
    let list = challenges.filter(c => {
      if (!query) return true;
      return (c.title || '').toLowerCase().includes(query) || (c.description || '').toLowerCase().includes(query) || (c.authorName || '').toLowerCase().includes(query) || (c.tags || []).join(' ').toLowerCase().includes(query);
    });

    // sort
    if (sortMode === 'popular') {
      list.sort((a,b) => (b.participants || []).length - (a.participants || []).length);
    } else if (sortMode === 'alpha') {
      list.sort((a,b) => (a.title||'').localeCompare(b.title||''));
    } else {
      list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

        const currentUser = JSON.parse(localStorage.getItem('cc_user') || 'null');
        const currentUserId = currentUser && currentUser.id;

        list.forEach(ch => {
                const id = ch.id || ch._id || '';
                const participants = (ch.participants || []).map(p => String(p));
                const joined = currentUserId && participants.includes(currentUserId);
                const created = ch.createdAt ? new Date(ch.createdAt) : null;
                const timeStr = created ? created.toLocaleDateString() : '';
                const difficultyBadge = ch.difficulty ? `<span class="badge bg-secondary me-2">${escapeHtml(ch.difficulty)}</span>` : '';
                const tags = (ch.tags || []).slice(0,3).map(t => `<span class="badge bg-light text-dark me-1 small">${escapeHtml(t)}</span>`).join(' ');
                container.innerHTML += `
                        <div class="col-md-4 d-flex">
                            <div class="dashboard-card w-100 text-start p-3">
                                <div class="d-flex justify-content-between">
                                  <div class="">
                                    ${difficultyBadge}
                                  </div>
                                  <div>
                                    <button class="btn btn-sm bookmark-btn" data-id="${id}" data-title="${escapeHtml(ch.title)}" data-href="challenges.html#${id}" title="Save bookmark"><i class="bi bi-bookmark"></i></button>
                                  </div>
                                </div>
                                <h5 class="mt-2">${escapeHtml(ch.title)}</h5>
                                <div class="small text-muted mb-2">by ${escapeHtml(ch.authorName || 'Unknown')} • ${timeStr}</div>
                                <p class="mb-3">${escapeHtml(ch.description)}</p>
                                <div class="d-flex justify-content-between align-items-center mt-3">
                                    <div>
                                      ${tags}
                                    </div>
                                    <div>
                                      <button id="join-btn-${id}" class="btn ${joined ? 'btn-secondary' : 'btn-primary'} btn-sm" ${joined ? 'disabled' : ''} onclick="joinChallenge('${id}')">${joined ? 'Joined' : 'Participate'}</button>
                                      <small id="participants-${id}" class="text-muted ms-2">${participants.length} participants</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                `;
        });

    // attach handlers for search/sort to reload list
    if (searchBox) searchBox.oninput = () => loadChallenges();
    if (sortSel) sortSel.onchange = () => loadChallenges();
}

async function joinChallenge(id) {
    if (!id) { showToast('Invalid challenge', 'danger'); return; }
    const token = localStorage.getItem('cc_token');
    if (!token) { showToast('Please sign in to join challenges', 'danger'); return; }
    try {
        const res = await fetch(`${API_BASE}/challenges/${id}/join`, {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to join');
        if (data.joined) {
            const btn = document.getElementById(`join-btn-${id}`);
            if (btn) { btn.textContent = 'Joined'; btn.className = 'btn btn-secondary btn-sm'; btn.disabled = true; }
            const pEl = document.getElementById(`participants-${id}`);
            if (pEl) pEl.textContent = `${data.participants} participants`;
            showToast('You joined the challenge!', 'success');
        } else {
            showToast(data.message || 'Already joined', 'info');
        }
    } catch (err) {
        console.error(err);
        showToast(err.message || 'Failed to join challenge', 'danger');
    }
}

// Small helper to avoid injecting raw HTML
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Create challenge modal handlers
function showCreateModal() {
    const modalEl = document.getElementById('createChallengeModal');
    if (!modalEl) return;
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
}

document.addEventListener('DOMContentLoaded', () => {
    const submit = document.getElementById('createSubmit');
    if (submit) submit.addEventListener('click', async () => {
        const title = document.getElementById('createTitle').value.trim();
        const description = document.getElementById('createDescription').value.trim();
        const errEl = document.getElementById('createError');
        errEl.style.display = 'none';
        if (!title || !description) { errEl.textContent = 'Title and description required'; errEl.style.display = 'block'; return; }
        const token = localStorage.getItem('cc_token');
        if (!token) { showToast('Please sign in to create a challenge', 'danger'); return; }
        try {
            const res = await fetch(`${API_BASE}/challenges`, {
                method: 'POST',
                headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: `Bearer ${token}` } : {}),
                body: JSON.stringify({ title, description })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to create');
            // close modal and reload list
            const modalEl = document.getElementById('createChallengeModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
            showToast('Challenge created', 'success');
            loadChallenges();
        } catch (err) {
            errEl.textContent = err.message || 'Failed to create challenge';
            errEl.style.display = 'block';
        }
    });
});
