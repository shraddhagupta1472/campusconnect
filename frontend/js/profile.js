const API_BASE = (window.API_BASE || 'http://localhost:4000') + '/api';

function escapeHtml(s) { return (s||'').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":"&#39;",'"':'&quot;'}[c])); }

// Helper to set and synchronize profile image across profile/settings UI and persist preview
function setProfileImageUrl(url) {
  const img = url || 'https://i.ibb.co/5T0QzBk/profile-avatar.png';
  try {
    const avatar = document.getElementById('profileDropdown'); if (avatar) avatar.src = img;
    const others = document.querySelectorAll('.profile-avatar'); others.forEach(o => { try { o.src = img; } catch(e){} });
    const prev = document.getElementById('p_avatarPreview'); if (prev) prev.src = img;
    const sPrev = document.querySelector('#s_avatarPreview img'); if (sPrev) sPrev.src = img;
    const sPrevLg = document.querySelector('#s_avatarPreviewLarge img'); if (sPrevLg) sPrevLg.src = img;
    try { localStorage.setItem('cc_profile_image', img); } catch(e) {}
    try { document.dispatchEvent(new CustomEvent('cc:settings-updated', { detail: { profileImage: img } })); } catch(e) {}
  } catch (e) { /* ignore */ }
}

// Demo profile to show when not signed in
const DEMO_PROFILE = {
  id: 'demo1',
  name: 'Guest User',
  bio: 'This is a demo profile. Sign in to view and manage your real profile, posts and achievements.',
  createdAt: new Date().toISOString(),
  followers: [],
  following: [],
  likes: 0,
  bookmarks: []
};
const DEMO_PROFILE_POSTS = [
  { id: 'p1', title: 'How I built my first project', createdAt: new Date().toISOString() },
  { id: 'p2', title: 'Top 5 study tips for exams', createdAt: new Date(Date.now()-86400000*2).toISOString() }
];

async function getProfile() {
  const loadingEl = document.getElementById('profileLoading');
  const msgEl = document.getElementById('profileMessage');
  const params = new URLSearchParams(window.location.search);
  const viewId = params.get('id') || (window.location.hash ? window.location.hash.replace('#','') : null);

  if (loadingEl) loadingEl.style.display = 'block';
  if (msgEl) { msgEl.style.display = 'none'; msgEl.textContent = ''; }

  // If viewing another user's profile (public), do public fetches
  if (viewId) {
    try {
      const res = await fetch(`${API_BASE}/users/${viewId}`);
      if (!res.ok) throw new Error('User not found');
      const data = await res.json();
      applyUserToProfile(Object.assign({}, data.user));
      // show follower counts (if provided)
      try {
        const followersEl = document.getElementById('followersCount'); if (followersEl && typeof data.user.followersCount !== 'undefined') followersEl.textContent = `${data.user.followersCount} Followers`;
      } catch(e) {}
      // if viewing another user's profile, hide edit controls; if viewing own profile, show them
      try {
        const currentUser = JSON.parse(localStorage.getItem('cc_user') || 'null');
        const uid = currentUser && currentUser.id;
        const isOwn = uid && (String(uid) === String(viewId));
        const editBioBtn = document.getElementById('editBioBtn'); if (editBioBtn) editBioBtn.style.display = isOwn ? 'inline-block' : 'none';
        const editNameBtn = document.getElementById('editNameBtn'); if (editNameBtn) editNameBtn.style.display = isOwn ? '' : 'none';
        const profileImageInputInline = document.getElementById('profileImageInputInline'); if (profileImageInputInline) profileImageInputInline.style.display = isOwn ? '' : 'none';
        // avatar click to upload only if own profile
        const avatar = document.getElementById('profileDropdown'); if (avatar) { if (isOwn) { avatar.style.cursor = 'pointer'; } else { avatar.style.cursor = 'default'; } }
      } catch (e) { /* ignore */ }

      // If signed-in and viewing someone else's profile, render follow/unfollow button and detect current status
      try {
        const currentUser = JSON.parse(localStorage.getItem('cc_user') || 'null');
        const uid = currentUser && currentUser.id;
        if (uid && uid !== viewId) {
          let isFollowing = false;
          // try to get current user's following list from profile API
          try {
            const token = localStorage.getItem('cc_token');
            if (token) {
              const resMe = await fetch((window.API_BASE || 'http://localhost:4000') + '/api/profile', { headers: { Authorization: `Bearer ${token}` } });
              if (resMe.ok) {
                const me = await resMe.json();
                if (me && me.user && Array.isArray(me.user.following)) isFollowing = me.user.following.includes(viewId);
              }
            }
          } catch (e) { console.warn('Could not determine follow status', e); }

          const container = document.querySelector('.profile-logo-card');
          if (container) {
            // avoid duplicating button
            let btn = document.getElementById('followBtn');
            if (!btn) {
              btn = document.createElement('button');
              btn.id = 'followBtn';
              btn.className = 'btn btn-sm ms-2';
              btn.style.marginLeft = '8px';
              btn.addEventListener('click', async (ev) => {
                ev.preventDefault();
                try {
                  const token = localStorage.getItem('cc_token');
                  if (!token) return window.CCShowToast('Please sign in to follow users', 'danger');
                  const url = (window.API_BASE || 'http://localhost:4000') + `/api/users/${encodeURIComponent(viewId)}/${isFollowing ? 'unfollow' : 'follow'}`;
                  const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
                  if (!res.ok) throw new Error('Failed');
                  const d = await res.json();
                  isFollowing = !!d.followed;
                  btn.textContent = isFollowing ? 'Following' : 'Follow';
                  btn.className = isFollowing ? 'btn btn-sm btn-secondary ms-2' : 'btn btn-sm btn-primary ms-2';
                  // update count
                  const followersEl = document.getElementById('followersCount'); if (followersEl && typeof d.followersCount !== 'undefined') followersEl.textContent = `${d.followersCount} Followers`;
                } catch (err) { console.error(err); window.CCShowToast('Could not update follow status', 'danger'); }
              });
              // insert after name
              const nameEl = document.getElementById('profileName'); if (nameEl && nameEl.parentNode) nameEl.parentNode.appendChild(btn);
            }
            btn.textContent = isFollowing ? 'Following' : 'Follow';
            btn.className = isFollowing ? 'btn btn-sm btn-secondary ms-2' : 'btn btn-sm btn-primary ms-2';
          }
        }
      } catch(e) { console.error(e); }

      // fetch public posts
      try {
        const res2 = await fetch(`${API_BASE}/blogs?authorId=${encodeURIComponent(viewId)}`);
        if (res2.ok) {
          const posts = await res2.json();
          renderPosts(posts);
          updateProfileCompletion(data.user, posts);
        }
      } catch(e) { console.error('Could not fetch user posts', e); }
      if (loadingEl) loadingEl.style.display = 'none';
      return;
    } catch (e) {
      console.error('Failed to load public profile:', e);
      if (loadingEl) loadingEl.style.display = 'none';
      if (msgEl) { msgEl.style.display = 'block'; msgEl.textContent = 'User not found or server unavailable.'; }
      return;
    }
  }

  // else load current user's profile (requires token)
  const token = localStorage.getItem('cc_token');
  if (!token) {
    // try local cc_user fallback
    try { const lu = JSON.parse(localStorage.getItem('cc_user') || 'null'); if (lu) { applyUserToProfile(lu); loadMyPosts(); if (loadingEl) loadingEl.style.display = 'none'; return; } } catch(e) {}
    // if no local user, show demo profile to make the page dynamic
    try { applyUserToProfile(DEMO_PROFILE); renderPosts(DEMO_PROFILE_POSTS); updateProfileCompletion(DEMO_PROFILE, DEMO_PROFILE_POSTS); try { renderSavedResources(DEMO_SAVED_RESOURCES.map(r => ({ id: r.id, title: r.title, href: r.href, description: r.description })) ); } catch(e) {} }
    catch(e) { console.error('Could not render demo profile', e); }
    if (loadingEl) loadingEl.style.display = 'none';
    if (msgEl) { msgEl.style.display = 'block'; msgEl.innerHTML = 'Viewing a demo profile — <a href="login.html">Sign in</a> to manage your profile.'; }
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/profile`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error('Unauthorized');
    const data = await res.json();
    const user = data.user;
    if (user) {
      applyUserToProfile(user);
      // ensure edit controls are visible for the signed-in owner
      try {
        const editBioBtn = document.getElementById('editBioBtn'); if (editBioBtn) editBioBtn.style.display = 'inline-block';
        const editNameBtn = document.getElementById('editNameBtn'); if (editNameBtn) editNameBtn.style.display = '';
        const profileImageInputInline = document.getElementById('profileImageInputInline'); if (profileImageInputInline) profileImageInputInline.style.display = '';
        const avatar = document.getElementById('profileDropdown'); if (avatar) avatar.style.cursor = 'pointer';
      } catch (e) { /* ignore */ }

      window.cc_user_profile = user;
      loadMyPosts();
      loadJoinedChallengesCount();
      // load saved/bookmarked resources for the signed-in user
      try { loadSavedResources(); } catch(e) { console.error('Could not load saved resources', e); }
    }
  } catch (err) {
    console.error('Failed to fetch profile:', err);
    if (msgEl) { msgEl.style.display = 'block'; msgEl.textContent = 'Server unreachable or session expired.'; }
    try { const lu = JSON.parse(localStorage.getItem('cc_user') || 'null'); if (lu) { applyUserToProfile(lu); loadMyPosts(); try { renderSavedResources(lu.bookmarks || []); } catch(e) {} } } catch(e) {}
  } finally { if (loadingEl) loadingEl.style.display = 'none'; }
}

function renderPosts(posts) {
  const container = document.getElementById('myPostsList');
  if (!container) return;
  container.innerHTML = '';
  const grid = document.createElement('div'); grid.className = 'posts-grid';
  if (!posts || !posts.length) {
    for (let i=0;i<9;i++){ const ph = document.createElement('div'); ph.className='post-placeholder'; grid.appendChild(ph); }
    container.appendChild(grid); return;
  }
  posts.forEach(b => {
    const a = document.createElement('a'); a.href = b.shareUrl || `blog.html#${b.id || b._id}`; a.className='post-tile'; a.title = b.title || '';
    const tileBg = document.createElement('div'); tileBg.className = 'post-tile-bg'; const initials = ((b.title||'').split(/\s+/).slice(0,2).map(s=>s[0]).join('')||'B').toUpperCase(); tileBg.textContent = initials;
    const overlay = document.createElement('div'); overlay.className='post-overlay'; overlay.innerHTML = `<div class="post-title">${escapeHtml(b.title||'')}</div><div class="post-time small text-muted">${new Date(b.createdAt).toLocaleDateString()}</div>`;
    a.appendChild(tileBg); a.appendChild(overlay); grid.appendChild(a);
  });
  container.appendChild(grid);
}

function applyUserToProfile(user) {
  const localSettings = (window.CCSettings && window.CCSettings.load) ? window.CCSettings.load() : JSON.parse(localStorage.getItem('cc_settings')||'{}');
  const displayName = (localSettings && localSettings.displayName) ? localSettings.displayName : (user.name || user.email || '');
  const el = document.getElementById('profileName');
  if (el) el.textContent = displayName;
  // page title reflect user
  document.title = `${displayName || 'Profile'} - CampusConnect`;
  // set avatar from user or local settings
  const avatar = document.getElementById('profileDropdown');
  if (avatar) {
    // Prefer an explicit preview stored in localStorage (set by Settings preview or Profile uploader)
    try {
      const stored = localStorage.getItem('cc_profile_image');
      if (stored) {
        avatar.src = stored;
      } else if (localSettings && localSettings.profileImage) {
        avatar.src = localSettings.profileImage;
      } else if (user && user.profileImage) {
        avatar.src = user.profileImage;
      }
    } catch (e) { /* ignore */ }
    avatar.alt = `${displayName}'s avatar`;
  }
  // keep settings preview in sync if settings UI is present
  try {
    const prev = document.querySelector('#s_avatarPreview img'); if (prev) prev.src = avatar.src;
    const prevLg = document.querySelector('#s_avatarPreviewLarge img'); if (prevLg) prevLg.src = avatar.src;
  } catch(e) {}
  // member since
  const memberSinceEl = document.getElementById('memberSince');
  if (memberSinceEl && user.createdAt) memberSinceEl.textContent = `Member since ${new Date(user.createdAt).toLocaleDateString()}`;

  // follower/following/likes counts (best-effort)
  try {
    const followersEl = document.getElementById('followersCount'); if (followersEl) followersEl.textContent = `${(user.followers && user.followers.length) || (user.followersCount || 0)} Followers`;
    const followingEl = document.getElementById('followingCount'); if (followingEl) followingEl.textContent = `${(user.following && user.following.length) || (user.followingCount || 0)} Following`;
    const likesEl = document.getElementById('likesCount'); if (likesEl) likesEl.textContent = `${(user.likes || user.reputation || 0)} Likes`;
  } catch(e) {}

  const bioText = document.getElementById('bioText');
  const bioInput = document.getElementById('bioInput');
  if (bioText) bioText.textContent = user.bio || 'You haven\'t added a bio yet.';
  if (bioInput) bioInput.value = user.bio || '';
  updateProfileCompletion(user, []);
}

async function loadMyPosts() {
  const token = localStorage.getItem('cc_token');
  const container = document.getElementById('myPostsList');
  if (container) container.style.display = 'block'; // make posts visible on profile

  // If not signed-in, show placeholder grid so the profile still looks populated
  if (!token) {
    if (!container) return;
    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'posts-grid';
    for (let i = 0; i < 9; i++) {
      const ph = document.createElement('div');
      ph.className = 'post-placeholder';
      grid.appendChild(ph);
    }
    container.appendChild(grid);
    updateProfileCompletion(window.cc_user_profile || null, []);
    updateStreak(0);
    const postsCountEl = document.getElementById('postsCount'); if (postsCountEl) postsCountEl.textContent = `Posts: 0`;
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/myblogs`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const data = await res.json();
    if (!container) return;
    container.innerHTML = '';
    // Render as a grid (Instagram-like). If no posts, show an empty placeholder grid.
    const grid = document.createElement('div');
    grid.className = 'posts-grid';
    if (!data || !data.length) {
      // blank grid: show 9 placeholders so layout looks like an empty profile
      for (let i = 0; i < 9; i++) {
        const ph = document.createElement('div');
        ph.className = 'post-placeholder';
        grid.appendChild(ph);
      }
      container.appendChild(grid);
      updateProfileCompletion(window.cc_user_profile || null, []);
      updateStreak(0);
      const postsCountEl = document.getElementById('postsCount'); if (postsCountEl) postsCountEl.textContent = `Posts: 0`;
      return;
    }

    data.forEach(b => {
      const a = document.createElement('a');
      a.href = `blog.html#${b.id || b._id}`;
      a.className = 'post-tile';
      a.title = b.title || 'Untitled';

      // since blogs may not have images, show a simple colored tile with title initials
      const tileBg = document.createElement('div');
      tileBg.className = 'post-tile-bg';
      const titleText = (b.title || '').trim();
      const initials = titleText.split(/\s+/).slice(0,2).map(s => s[0]).join('').toUpperCase() || 'B';
      tileBg.textContent = initials;

      const overlay = document.createElement('div');
      overlay.className = 'post-overlay';
      overlay.innerHTML = `<div class="post-title">${escapeHtml(b.title || '')}</div><div class="post-time small text-muted">${new Date(b.createdAt).toLocaleDateString()}</div>`;

      a.appendChild(tileBg);
      a.appendChild(overlay);
      grid.appendChild(a);
    });

    container.appendChild(grid);
    // update completion and streak
    updateProfileCompletion(window.cc_user_profile || null, data);
    updateStreak(computeStreak(data));
    const postsCountEl = document.getElementById('postsCount'); if (postsCountEl) postsCountEl.textContent = `Posts: ${data.length}`;
  } catch (e) { console.error(e); }
}

// Publishing posts removed — UI disabled by request. Hidden #myPostsList remains for internal use.

function computeStreak(posts) {
  if (!posts || !posts.length) return 0;
  const dates = new Set(posts.map(p => (new Date(p.createdAt)).toISOString().slice(0,10)));
  let latest = new Date(Math.max(...posts.map(p => new Date(p.createdAt).getTime())));
  let streak = 0;
  while (true) {
    const dstr = latest.toISOString().slice(0,10);
    if (dates.has(dstr)) { streak++; latest.setDate(latest.getDate() - 1); } else break;
  }
  return streak;
}

function updateStreak(n) { const el = document.getElementById('streakDays'); if (el) el.textContent = String(n); }

function updateProfileCompletion(user, posts) {
  const nameOk = !!(user && (user.name || user.displayName) && (user.name || user.displayName).trim().length > 2);
  const bioOk = !!(user && user.bio && user.bio.trim().length >= 20);
  const postOk = !!(posts && posts.length > 0);
  const bookmarkOk = !!(user && user.bookmarks && user.bookmarks.length > 0);
  const total = [nameOk, bioOk, postOk, bookmarkOk].filter(Boolean).length;
  const pct = Math.round((total / 4) * 100);
  const bar = document.getElementById('profileCompletionBar'); if (bar) { bar.style.width = pct + '%'; bar.setAttribute('aria-valuenow', String(pct)); }
  const txt = document.getElementById('profileCompletionText'); if (txt) txt.textContent = `${pct}% complete`;
  const map = { c_name: nameOk, c_bio: bioOk, c_post: postOk, c_bookmarks: bookmarkOk };
  Object.keys(map).forEach(k => { const cb = document.getElementById(k); if (cb) cb.checked = !!map[k]; });

  // update badges based on content
  try {
    const badgesEl = document.getElementById('profileBadges');
    if (!badgesEl) return;
    badgesEl.innerHTML = '';
    if (postOk) {
      const b = document.createElement('span'); b.className = 'badge bg-success me-1'; b.textContent = 'Contributor'; badgesEl.appendChild(b);
    }
    if (posts && posts.length > 0 && computeStreak(posts) >= 3) {
      const b = document.createElement('span'); b.className = 'badge bg-warning text-dark me-1'; b.textContent = 'Active Streak'; badgesEl.appendChild(b);
    }
    const challengesCountEl = document.getElementById('challengesCount');
    const postsCountEl = document.getElementById('postsCount');
    if (postsCountEl) postsCountEl.textContent = `Posts: ${posts ? posts.length : 0}`;
    // challengesCount is updated by loadJoinedChallengesCount
  } catch (e) { /* ignore */ }
}

document.addEventListener('DOMContentLoaded', () => {
  getProfile();
  // load user's posts
  loadMyPosts();
  // hide edit controls if not signed in
  (function(){ const token = localStorage.getItem('cc_token'); const editBtn = document.getElementById('editBioBtn'); if (!token && editBtn) editBtn.style.display = 'none'; })();
  // refresh my posts after blogs change elsewhere
  document.addEventListener('cc:blogs-loaded', loadMyPosts);

  // fetch and render a small leaderboard snapshot for the profile sidebar
  async function loadProfileLeaderboard() {
    const listEl = document.getElementById('profileLeaderboardList');
    if (!listEl) return;
    listEl.innerHTML = '<div class="small text-muted">Loading...</div>';
    try {
      const res = await fetch((window.API_BASE || 'http://localhost:4000') + '/api/leaderboard');
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      renderProfileLeaderboard(data.slice(0,3));
    } catch (e) {
      console.error('Could not load profile leaderboard', e);
      listEl.innerHTML = '<div class="small text-muted">Leaderboard unavailable</div>';
    }
  }

  // Demo saved resources when not signed in
  const DEMO_SAVED_RESOURCES = [
    { id: 'sr1', title: 'HTML & CSS Basics', href: 'https://developer.mozilla.org/', description: 'A short guide to responsive HTML & CSS' },
    { id: 'sr2', title: 'JavaScript Guide', href: 'https://javascript.info/', description: 'Modern JS features explained' },
    { id: 'sr3', title: 'Accessibility Checklist', href: 'https://webaim.org/', description: 'Make your web content accessible' }
  ];

  async function loadSavedResources() {
    const el = document.getElementById('savedResourcesList');
    if (!el) return;
    el.innerHTML = '<div class="small text-muted">Loading...</div>';

    const token = localStorage.getItem('cc_token');
    try {
      if (token) {
        const res = await fetch((window.API_BASE || 'http://localhost:4000') + '/api/bookmarks', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        const items = data.bookmarks || [];
        if (!items.length) { el.innerHTML = '<div class="small text-muted">No saved resources.</div>'; return; }
        renderSavedResources(items);
        return;
      }
    } catch (e) {
      console.warn('Could not load saved resources from API', e);
    }

    // fallback: try local cc_user bookmarks
    try {
      const cu = JSON.parse(localStorage.getItem('cc_user') || 'null');
      if (cu && cu.bookmarks && cu.bookmarks.length) { renderSavedResources(cu.bookmarks); return; }
    } catch(e) {}

    // otherwise show demo saved resources
    renderSavedResources(DEMO_SAVED_RESOURCES.map(r => ({ id: r.id, title: r.title, href: r.href, createdAt: new Date().toISOString(), description: r.description })));
  }

  function renderSavedResources(list) {
    const el = document.getElementById('savedResourcesList'); if (!el) return;
    el.innerHTML = '';
    list.forEach(item => {
      const row = document.createElement('div'); row.className = 'mb-2 d-flex justify-content-between align-items-start';
      row.innerHTML = `<div><strong>${escapeHtml(item.title)}</strong><div class="small text-muted">${escapeHtml(item.description || item.title)}</div></div>`;
      const btnWrap = document.createElement('div');
      const open = document.createElement('a'); open.className = 'btn btn-sm btn-primary'; open.textContent = 'Open'; open.target = '_blank'; open.href = item.href || '#';
      btnWrap.appendChild(open);
      row.appendChild(btnWrap);
      el.appendChild(row);
    });
  }

  // Followers / Following modals handlers
  async function loadFollowersList(userId) {
    const el = document.getElementById('followersList');
    if (!el) return;
    el.innerHTML = '<div class="small text-muted">Loading...</div>';
    try {
      const res = await fetch((window.API_BASE || 'http://localhost:4000') + `/api/users/${encodeURIComponent(userId)}/followers`);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      if (!data.followers || !data.followers.length) { el.innerHTML = '<div class="small text-muted">No followers yet.</div>'; return; }
      el.innerHTML = '';
      data.followers.forEach(u => {
        const row = document.createElement('div'); row.className = 'd-flex align-items-center justify-content-between mb-2';
        row.innerHTML = `<div class="d-flex align-items-center gap-2"><img src="${u.profileImage || 'https://i.ibb.co/5T0QzBk/profile-avatar.png'}" width="36" height="36" class="rounded-circle" /><div><strong>${escapeHtml(u.name)}</strong></div></div>`;
        const btn = document.createElement('button'); btn.className = 'btn btn-sm btn-primary'; btn.textContent = 'View';
        btn.addEventListener('click', () => { window.location.href = `profile.html?id=${u.id}`; });
        row.appendChild(btn);
        el.appendChild(row);
      });
    } catch (e) { console.error(e); el.innerHTML = '<div class="small text-muted">Could not load followers.</div>'; }
  }

  async function loadFollowingList(userId) {
    const el = document.getElementById('followingList');
    if (!el) return;
    el.innerHTML = '<div class="small text-muted">Loading...</div>';
    try {
      const res = await fetch((window.API_BASE || 'http://localhost:4000') + `/api/users/${encodeURIComponent(userId)}/following`);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      if (!data.following || !data.following.length) { el.innerHTML = '<div class="small text-muted">Not following anyone yet.</div>'; return; }
      el.innerHTML = '';
      data.following.forEach(u => {
        const row = document.createElement('div'); row.className = 'd-flex align-items-center justify-content-between mb-2';
        row.innerHTML = `<div class="d-flex align-items-center gap-2"><img src="${u.profileImage || 'https://i.ibb.co/5T0QzBk/profile-avatar.png'}" width="36" height="36" class="rounded-circle" /><div><strong>${escapeHtml(u.name)}</strong></div></div>`;
        const btn = document.createElement('button'); btn.className = 'btn btn-sm btn-primary'; btn.textContent = 'View';
        btn.addEventListener('click', () => { window.location.href = `profile.html?id=${u.id}`; });
        row.appendChild(btn);
        el.appendChild(row);
      });
    } catch (e) { console.error(e); el.innerHTML = '<div class="small text-muted">Could not load following list.</div>'; }
  }

  // wire click handlers for counts (delegated in case elements are updated)
  (function(){
    const followersEl = document.getElementById('followersCount');
    const followingEl = document.getElementById('followingCount');
    if (followersEl) followersEl.addEventListener('click', (e) => {
      const id = (new URLSearchParams(window.location.search).get('id')) || (window.cc_user_profile && window.cc_user_profile.id) || null;
      if (!id) { const link = document.createElement('a'); link.href='login.html'; link.textContent='Sign in'; followersEl.innerHTML = `0 Followers • ${link.outerHTML}`; return; }
      loadFollowersList(id);
      const modal = new bootstrap.Modal(document.getElementById('followersModal'));
      modal.show();
    });
    if (followingEl) followingEl.addEventListener('click', (e) => {
      const id = (new URLSearchParams(window.location.search).get('id')) || (window.cc_user_profile && window.cc_user_profile.id) || null;
      if (!id) { window.location.href = 'login.html'; return; }
      loadFollowingList(id);
      const modal = new bootstrap.Modal(document.getElementById('followingModal'));
      modal.show();
    });
  })();

  // real-time notification listener (socket.io)
  try {
    if (typeof io !== 'undefined') {
      const socket = io();
      socket.on('notification', (data) => {
        try {
          const current = JSON.parse(localStorage.getItem('cc_user') || 'null');
          if (!current) return;
          if (data && data.recipientId && String(data.recipientId) === String(current.id)) {
            // show toast and increment unread (fetch fresh count)
            window.CCShowToast((data.notification && data.notification.message) || 'You have a new notification', 'info');
            // optionally, update unread count in profile dropdown if present
            try { const unreadEl = document.getElementById('notifCount'); if (unreadEl) { unreadEl.style.display='inline-block'; const val = Number(unreadEl.textContent || '0'); unreadEl.textContent = String(val + 1); } } catch(e){}
          }
        } catch (e) { /* ignore parse errors */ }
      });
    }
  } catch (e) { /* ignore socket errors */ }


  function renderProfileLeaderboard(items) {
    const listEl = document.getElementById('profileLeaderboardList'); if (!listEl) return;
    if (!items || !items.length) { listEl.innerHTML = '<div class="small text-muted">No data</div>'; return; }
    listEl.innerHTML = '';
    const ul = document.createElement('div'); ul.className = 'list-group list-group-flush';
    items.forEach((u, i) => {
      const el = document.createElement('div'); el.className = 'd-flex align-items-center justify-content-between list-group-item';
      el.innerHTML = `<div><strong>#${i+1} ${escapeHtml(u.name||'')}</strong><div class="small text-muted">Blogs: ${u.blogs || 0} • ${u.originality}% original</div></div>`;
      ul.appendChild(el);
    });
    listEl.appendChild(ul);
  }

  // Inline name editing handlers
  (function(){
    const editBtn = document.getElementById('editNameBtn');
    const nameEditor = document.getElementById('nameEditor');
    const nameInput = document.getElementById('nameInput');
    const nameSave = document.getElementById('nameSaveBtn');
    const nameCancel = document.getElementById('nameCancelBtn');
    const profileNameEl = document.getElementById('profileName');

    if (!editBtn || !nameEditor || !nameInput || !nameSave || !nameCancel || !profileNameEl) return;
    editBtn.addEventListener('click', () => {
      nameInput.value = profileNameEl.textContent.trim() === 'Profile' ? '' : profileNameEl.textContent.trim();
      nameEditor.style.display = 'block';
      nameInput.focus();
    });
    nameCancel.addEventListener('click', () => { nameEditor.style.display = 'none'; });
    nameSave.addEventListener('click', async () => {
      const newName = (nameInput.value || '').trim();
      if (!newName) { alert('Name cannot be empty'); return; }
      try {
        const token = localStorage.getItem('cc_token');
        if (!token) {
          // save locally if not signed in
          try { const u = JSON.parse(localStorage.getItem('cc_user')||'null') || {}; u.name = newName; localStorage.setItem('cc_user', JSON.stringify(u)); profileNameEl.textContent = newName; nameEditor.style.display = 'none'; return; } catch (e) { console.error(e); }
        }
        const res = await fetch((window.API_BASE || 'http://localhost:4000') + '/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ name: newName }) });
        if (!res.ok) throw new Error('Failed to save');
        const data = await res.json();
        if (data && data.user) {
          profileNameEl.textContent = data.user.name || newName;
          try { const lu = JSON.parse(localStorage.getItem('cc_user')||'null') || {}; localStorage.setItem('cc_user', JSON.stringify(Object.assign({}, lu, data.user))); } catch (e) {}
          // notify other pages that settings were saved on server (e.g., Settings UI)
          try { document.dispatchEvent(new CustomEvent('cc:settings-saved', { detail: { serverSaved: true, user: data.user } })); } catch(e) {}
        }
        nameEditor.style.display = 'none';
      } catch (e) { console.error('Could not save name', e); alert('Could not save.'); }
    });

    // avatar inline upload
    const avatar = document.getElementById('profileDropdown');
    const avatarInput = document.getElementById('profileImageInputInline');
    // lightweight toast helper (global)
    if (!window.CCShowToast) window.CCShowToast = (msg, type='info') => {
      let c = document.getElementById('cc_toast_container');
      if (!c) { c = document.createElement('div'); c.id = 'cc_toast_container'; c.style.position='fixed'; c.style.right='16px'; c.style.top='16px'; c.style.zIndex='99999'; document.body.appendChild(c); }
      const el = document.createElement('div'); el.style.padding='8px 12px'; el.style.marginBottom='8px'; el.style.borderRadius='8px'; el.style.background = type==='success'?'#2e7d32':type==='danger'?'#ff4d4f':'#333'; el.style.color='#fff'; el.textContent = msg; c.appendChild(el); setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translateY(-6px)'; },2600); setTimeout(()=>el.remove(),3200);
    };

    if (avatar && avatarInput) {
      avatar.addEventListener('click', (e) => {
        try { avatarInput.click(); } catch (e) {}
      });
      avatarInput.addEventListener('change', async (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        // enforce size limit (500KB) to match settings page and avoid huge payloads
        const MAX_BYTES = 500 * 1024;
        if (f.size > MAX_BYTES) { alert('Image too large (max 500KB). Please choose a smaller image.'); return; }
        if (!f.type.startsWith('image/')) { alert('Unsupported image type'); return; }
        const reader = new FileReader();
        reader.onload = async () => {
          const dataUrl = String(reader.result);
          // central helper ensures consistent updates and persistence of preview
          setProfileImageUrl(dataUrl);

          // try to persist
          try {
            const token = localStorage.getItem('cc_token');
            if (token) {
              // prefer sending the binary file using multipart/form-data so server stores a file instead of a data URL
              try {
                const form = new FormData();
                form.append('avatar', f);
                const res = await fetch((window.API_BASE||'http://localhost:4000') + '/api/profile', {
                  method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: form
                });
                const d = await res.json().catch(() => ({}));
                if (!res.ok) {
                  const msg = (d && d.error) ? d.error : 'Failed to save image to server';
                  window.CCShowToast(msg, 'danger');
                  throw new Error(msg);
                }
                // use server's canonical image (in case it's processed/stored differently) and bust cache
                if (d && d.user && d.user.profileImage) {
                  const imgUrl = d.user.profileImage + (d.user.profileImage.indexOf('?') === -1 ? `?v=${Date.now()}` : `&v=${Date.now()}`);
                  setProfileImageUrl(imgUrl);
                  try { localStorage.setItem('cc_user', JSON.stringify(d.user)); } catch(e) {}
                }
                // notify other pages that settings were saved on server
                try { document.dispatchEvent(new CustomEvent('cc:settings-saved', { detail: { serverSaved: true, user: d && d.user ? d.user : null } })); } catch(e) {}
                window.CCShowToast('Profile image saved to server', 'success');
              } catch (err) {
                console.error('Failed to save profile image', err);
                window.CCShowToast('Could not save image to server', 'warning');
              }
            } else {
              try { const cu = JSON.parse(localStorage.getItem('cc_user')||'null')||{}; cu.profileImage = dataUrl; localStorage.setItem('cc_user', JSON.stringify(cu)); } catch(e){}
              window.CCShowToast('Profile image updated locally. Sign in to persist to server.', 'info');
            }
          } catch (err) { console.error('Failed to save profile image', err); window.CCShowToast('Could not save image', 'warning'); }
        };
        reader.readAsDataURL(f);
      });
    }
  })();

  // load profile leaderboard on page load
  loadProfileLeaderboard();

  // subscribe to live leaderboard updates via socket.io (if available)
  try { if (typeof io !== 'undefined') { const socket = io(); socket.on('leaderboard', (data) => { try { renderProfileLeaderboard((data || []).slice(0,3)); } catch(e){} }); } } catch(e) { /* ignore */ }

  // also fetch challenge-join counts for this user and update profile stats
  try { loadJoinedChallengesCount(); } catch(e) { /* ignore */ }

  async function loadJoinedChallengesCount() {
    try {
      const res = await fetch(`${API_BASE}/challenges`);
      if (!res.ok) return;
      const data = await res.json();
      const currentUser = JSON.parse(localStorage.getItem('cc_user') || 'null');
      const currentUserId = currentUser && currentUser.id;
      const joined = (data || []).filter(c => {
        const parts = (c.participants || []).map(p => String(p));
        return (parts.includes(currentUserId)) || (String(c.authorId) === String(currentUserId));
      });
      const challengesCountEl = document.getElementById('challengesCount'); if (challengesCountEl) challengesCountEl.textContent = `Challenges: ${joined.length}`;
      // populate recent activity
      const recent = document.getElementById('recentActivity'); if (recent) {
        recent.innerHTML = '';
        if (!joined.length) {
          recent.innerHTML = '<div class="small text-muted">No recent activity.</div>';
        } else {
          const title = document.createElement('div'); title.className = 'fw-bold mb-2'; title.textContent = 'Recent activity'; recent.appendChild(title);
          joined.slice(0,5).forEach(c => {
            const a = document.createElement('a'); a.href = `challenges.html#${c.id || c._id}`; a.className = 'd-block'; a.textContent = (c.title || 'Untitled challenge'); recent.appendChild(a);
          });
        }
      }
      // update badge
      try { const badgesEl = document.getElementById('profileBadges'); if (badgesEl && joined.length) { const b = document.createElement('span'); b.className = 'badge bg-info text-dark me-1'; b.textContent = 'Challenger'; badgesEl.appendChild(b); } } catch(e) {}
    } catch (e) { console.error('Could not load challenges count', e); }
  }

  // Apply locally saved settings immediately so the profile reflects recent changes
  try {
    const localSettings = (window.CCSettings && window.CCSettings.load) ? window.CCSettings.load() : null;
    if (localSettings) {
      if (localSettings.displayName) {
        const el = document.getElementById('profileName'); if (el) el.textContent = localSettings.displayName;
        document.title = `${localSettings.displayName} - CampusConnect`;
      }
      try {
        const stored = localStorage.getItem('cc_profile_image');
        if (stored) { setProfileImageUrl(stored); }
        else if (localSettings.profileImage) { setProfileImageUrl(localSettings.profileImage); }
      } catch(e) { if (localSettings.profileImage) { setProfileImageUrl(localSettings.profileImage); } }
      if (typeof localSettings.showImages !== 'undefined') applyShowImages(!!localSettings.showImages);
    }
  } catch (e) { /* ignore */ }
  const logout = document.getElementById('logoutBtn');
  if (logout) {
    logout.addEventListener('click', (e) => {
      e.preventDefault();
      localStorage.removeItem('cc_token');
      localStorage.removeItem('cc_user');
      window.location.href = 'login.html';
    });
  }
  // also wire the visible logout button in the header
  const logoutVisible = document.getElementById('logoutBtnVisible');
  if (logoutVisible) {
    logoutVisible.addEventListener('click', (e) => {
      e.preventDefault();
      localStorage.removeItem('cc_token');
      localStorage.removeItem('cc_user');
      window.location.href = 'login.html';
    });
  }
  // Bio editing
  const editBtn = document.getElementById('editBioBtn');
  const saveBtn = document.getElementById('saveBioBtn');
  const cancelBtn = document.getElementById('cancelBioBtn');
  const bioEditor = document.getElementById('bioEditor');
  const bioText = document.getElementById('bioText');
  const bioInput = document.getElementById('bioInput');
  const bioStatus = document.getElementById('bioStatus');
  const bioCounter = document.getElementById('bioCounter');
  const togglePreview = document.getElementById('togglePreview');
  const bioPreview = document.getElementById('bioPreview');
  const bioDraftStatus = document.getElementById('bioDraftStatus');
  const MAX_BIO = 500;
  let draftTimer = null;

  // Image toggle and status image
  const showImagesToggle = document.getElementById('showImagesToggle');
  const statusImageInput = document.getElementById('statusImageInput');
  const profileStatusImage = document.getElementById('profileStatusImage');
  const removeStatusImage = document.getElementById('removeStatusImage');

  function applyShowImages(show) {
    const els = document.querySelectorAll('.removable-image');
    els.forEach(e => { e.style.display = show ? '' : 'none'; });
    if (showImagesToggle) showImagesToggle.checked = !!show;
    localStorage.setItem('cc_show_images', show ? '1' : '0');
  }

  // load persisted settings
  try {
    const show = localStorage.getItem('cc_show_images');
    if (typeof show !== 'undefined' && show !== null) {
      applyShowImages(show === '1');
    }
    const imgData = localStorage.getItem('cc_status_image');
    if (imgData && profileStatusImage) {
      profileStatusImage.src = imgData;
      profileStatusImage.style.display = 'inline-block';
    }
  } catch (e) { /* ignore */ }

  if (showImagesToggle) {
    showImagesToggle.addEventListener('change', (e) => {
      applyShowImages(!!e.target.checked);
    });
  }

  if (statusImageInput && profileStatusImage) {
    const statusImageError = document.getElementById('statusImageError');
    const STATUS_MAX_BYTES = 500 * 1024; // 500KB
    const ALLOWED_TYPES = ['image/png','image/jpeg','image/jpg','image/webp','image/avif','image/gif'];
    statusImageInput.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      // validate type
      if (ALLOWED_TYPES.indexOf(f.type) === -1) {
        if (statusImageError) { statusImageError.textContent = 'Unsupported image type.'; statusImageError.style.display = 'block'; }
        e.target.value = '';
        return;
      }
      // validate size
      if (f.size > STATUS_MAX_BYTES) {
        if (statusImageError) { statusImageError.textContent = `Image too large (max ${Math.round(STATUS_MAX_BYTES/1024)}KB).`; statusImageError.style.display = 'block'; }
        e.target.value = '';
        return;
      }
      if (statusImageError) { statusImageError.style.display = 'none'; statusImageError.textContent = ''; }
      const reader = new FileReader();
      reader.onload = () => {
        const data = String(reader.result);
        profileStatusImage.src = data;
        profileStatusImage.style.display = 'inline-block';
        try { localStorage.setItem('cc_status_image', data); } catch (err) {}
      };
      reader.readAsDataURL(f);
    });
  }

  if (removeStatusImage && profileStatusImage) {
    removeStatusImage.addEventListener('click', (e) => {
      e.preventDefault();
      profileStatusImage.src = '';
      profileStatusImage.style.display = 'none';
      try { localStorage.removeItem('cc_status_image'); } catch (err) {}
      if (statusImageInput) statusImageInput.value = '';
      const statusImageError = document.getElementById('statusImageError');
      if (statusImageError) { statusImageError.style.display = 'none'; statusImageError.textContent = ''; }
    });
  }

  if (editBtn && bioEditor) {
    editBtn.addEventListener('click', () => {
      bioEditor.style.display = 'block';
      editBtn.style.display = 'none';
      if (bioInput) bioInput.focus();
      // Load draft if available
      try {
        const user = JSON.parse(localStorage.getItem('cc_user') || 'null');
        const key = `bio_draft_${user && user.id ? user.id : 'anon'}`;
        const draft = localStorage.getItem(key);
        if (draft && bioInput && draft !== bioInput.value) {
          bioInput.value = draft;
          if (bioDraftStatus) {
            bioDraftStatus.style.display = 'inline';
            setTimeout(() => bioDraftStatus.style.display = 'none', 2500);
          }
        }
      } catch (e) { /* ignore */ }
      updateCounter();
    });
  }

  if (cancelBtn && bioEditor && editBtn) {
    cancelBtn.addEventListener('click', () => {
      bioEditor.style.display = 'none';
      editBtn.style.display = 'inline-block';
      if (bioInput) {
        bioInput.value = bioText ? bioText.textContent : '';
        updateCounter();
        // hide preview when cancelling
        if (bioPreview) bioPreview.style.display = 'none';
        if (togglePreview) togglePreview.textContent = 'Preview';
      }
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      if (!bioInput) return;
      const newBio = bioInput.value;
      bioStatus.style.display = 'inline-block';
      try {
        const token = localStorage.getItem('cc_token');
        const payload = { bio: newBio };
        const res = await fetch(`${API_BASE}/profile`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Failed to save');
        const data = await res.json();
        const user = data.user;
        if (user) {
          if (bioText) bioText.textContent = user.bio || 'You haven\'t added a bio yet.';
          bioEditor.style.display = 'none';
          editBtn.style.display = 'inline-block';
          // clear draft on save
          try {
            const userObj = JSON.parse(localStorage.getItem('cc_user') || 'null');
            const key = `bio_draft_${userObj && userObj.id ? userObj.id : 'anon'}`;
            localStorage.removeItem(key);
          } catch(e) {}
          // update local cc_user copy and notify other pages
          try { const cu = JSON.parse(localStorage.getItem('cc_user')||'null')||{}; const merged = Object.assign({}, cu, user); localStorage.setItem('cc_user', JSON.stringify(merged)); } catch(e) {}
          try { document.dispatchEvent(new CustomEvent('cc:settings-saved', { detail: { serverSaved: true, user } })); } catch(e) {}
        }
      } catch (err) {
        console.error(err);
        alert('Could not save bio.');
      } finally {
        bioStatus.style.display = 'none';
      }
    });
  }

  // Bio input events: counter, autosave, preview toggle
  function updateCounter() {
    if (!bioInput || !bioCounter) return;
    let val = bioInput.value || '';
    if (val.length > MAX_BIO) {
      val = val.slice(0, MAX_BIO);
      bioInput.value = val;
    }
    bioCounter.textContent = `${val.length}/${MAX_BIO}`;
  }

  function renderMarkdown(md) {
    if (!md) return '<p class="text-muted">You haven\'t added a bio yet.</p>';
    // Escape HTML
    const esc = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Simple replacements: headings, bold, italic, links, line breaks
    let html = esc
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/gim, '<em>$1</em>')
      .replace(/\[(.*?)\]\((.*?)\)/gim, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\n{2,}/gim, '</p><p>')
      .replace(/\n/gim, '<br/>');
    return `<p>${html}</p>`;
  }

  if (bioInput) {
    bioInput.addEventListener('input', () => {
      updateCounter();
      // autosave draft (debounced)
      try {
        const user = JSON.parse(localStorage.getItem('cc_user') || 'null');
        const key = `bio_draft_${user && user.id ? user.id : 'anon'}`;
        if (draftTimer) clearTimeout(draftTimer);
        draftTimer = setTimeout(() => {
          localStorage.setItem(key, bioInput.value);
        }, 800);
      } catch(e) {}
    });
  }

  if (togglePreview && bioInput && bioPreview) {
    togglePreview.addEventListener('click', () => {
      if (bioPreview.style.display === 'block') {
        // switch to edit
        bioPreview.style.display = 'none';
        bioInput.style.display = 'block';
        togglePreview.textContent = 'Preview';
      } else {
        // render preview
        bioPreview.innerHTML = renderMarkdown(bioInput.value);
        bioPreview.style.display = 'block';
        bioInput.style.display = 'none';
        togglePreview.textContent = 'Edit';
      }
    });
  }

  // initialize counter on load
  updateCounter();

  // populate settings modal from CCSettings or localStorage
  try {
    const s = (window.CCSettings && window.CCSettings.load) ? window.CCSettings.load() : JSON.parse(localStorage.getItem('cc_settings')||'{}');
    const nameEl = document.getElementById('settingsName');
    if (nameEl) nameEl.value = s.displayName || (window.cc_user_profile && window.cc_user_profile.name) || '';
    const bookmarksEl = document.getElementById('settingsBookmarks');
    if (bookmarksEl) bookmarksEl.checked = typeof s.enableBookmarks === 'boolean' ? s.enableBookmarks : !!(window.cc_user_profile && window.cc_user_profile.bookmarksEnabled);
    const disableNotifEl = document.getElementById('settingsDisableNotifications');
    if (disableNotifEl) disableNotifEl.checked = (typeof s.enableNotifications === 'boolean') ? !s.enableNotifications : false;
    const showImagesEl = document.getElementById('settingsShowImages');
    if (showImagesEl) showImagesEl.checked = typeof s.showImages === 'boolean' ? s.showImages : (localStorage.getItem('cc_show_images') === '1');
    const img = s.profileImage || localStorage.getItem('cc_profile_image');
    if (img) {
      try { setProfileImageUrl(img); } catch(e) { const avatar = document.getElementById('profileDropdown'); if (avatar) avatar.src = img; }
    }
  } catch(e) {}

  // Save button on profile modal — delegate to CCSettings.save which also persists to server when possible
  const saveSettingsBtn = document.getElementById('saveSettings');
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const btn = saveSettingsBtn;
      const origText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Saving...';

      const settings = {
        displayName: (document.getElementById('settingsName')||{}).value || undefined,
        enableBookmarks: !!(document.getElementById('settingsBookmarks') && document.getElementById('settingsBookmarks').checked),
        enableNotifications: !(document.getElementById('settingsDisableNotifications') && document.getElementById('settingsDisableNotifications').checked),
        showImages: !!(document.getElementById('settingsShowImages') && document.getElementById('settingsShowImages').checked)
      };
      try {
        let result = null;
        if (window.CCSettings && typeof window.CCSettings.save === 'function') {
          result = await window.CCSettings.save(settings);
        } else {
          localStorage.setItem('cc_settings', JSON.stringify(settings));
          document.dispatchEvent(new CustomEvent('cc:settings-updated', { detail: settings }));
        }
        const st = document.getElementById('settingsStatus');
        if (st) { st.style.display = 'inline'; setTimeout(() => st.style.display='none',1500); }
        // toast feedback
        if (window.CCShowToast) {
          if (localStorage.getItem('cc_token') && result && result.serverSaved === false) {
            window.CCShowToast('Settings saved locally but not to server', 'warning');
          } else {
            window.CCShowToast('Settings saved', 'success');
          }
        }
        // close the modal
        setTimeout(() => {
          const modalEl = document.getElementById('settingsModal');
          const modal = bootstrap.Modal.getInstance(modalEl);
          if (modal) modal.hide();
        }, 200);
      } catch (err) {
        console.error(err);
        if (window.CCShowToast) window.CCShowToast('Could not save settings to server. Saved locally.', 'warning');
      } finally {
        btn.disabled = false;
        btn.textContent = origText;
      }
    });
  }

  // Apply settings when they're updated anywhere
  document.addEventListener('cc:settings-updated', (ev) => {
    const s = ev.detail || {};
    if (typeof s.displayName !== 'undefined') {
      const el = document.getElementById('profileName');
      const displayName = s.displayName || (window.cc_user_profile && window.cc_user_profile.name) || '';
      if (el) el.textContent = displayName;
      document.title = `${displayName || 'Profile'} - CampusConnect`;
    }
    // update bio if present
    if (typeof s.bio !== 'undefined') {
      const bioText = document.getElementById('bioText');
      const bioInput = document.getElementById('bioInput');
      if (bioText) bioText.textContent = s.bio || 'You haven\'t added a bio yet.';
      if (bioInput) bioInput.value = s.bio || '';
      const p_bioEl = document.getElementById('p_bio'); if (p_bioEl) p_bioEl.value = s.bio || '';
    }
    // theme
    if (typeof s.darkMode !== 'undefined') {
      if (s.darkMode) document.body.classList.add('dark-mode'); else document.body.classList.remove('dark-mode');
      const p_dark = document.getElementById('p_darkMode'); if (p_dark) p_dark.checked = !!s.darkMode;
    }
    if (typeof s.showImages !== 'undefined') { applyShowImages(!!s.showImages); const p_si = document.getElementById('p_showImages'); if (p_si) p_si.checked = !!s.showImages; }
    if (typeof s.profileImage === 'string') {
      try { setProfileImageUrl(s.profileImage); } catch(e) { const avatar = document.getElementById('profileDropdown'); if (avatar) avatar.src = s.profileImage; const prev = document.getElementById('p_avatarPreview'); if (prev) prev.src = s.profileImage; }
    } else {
      const img = localStorage.getItem('cc_profile_image');
      if (img) { try { setProfileImageUrl(img); } catch(e) { const avatar = document.getElementById('profileDropdown'); if (avatar) avatar.src = img; const prev = document.getElementById('p_avatarPreview'); if (prev) prev.src = img; } }
    }
    // activity visibility
    if (typeof s.showActivity !== 'undefined') {
      const streakCard = document.getElementById('streakCard');
      if (streakCard) streakCard.style.display = s.showActivity ? '' : 'none';
      const p_sa = document.getElementById('p_showActivity'); if (p_sa) p_sa.checked = !!s.showActivity;
    }
    // visibility / notifications / bookmarks
    if (typeof s.visibility !== 'undefined') { const p_v = document.getElementById('p_visibility'); if (p_v) p_v.value = s.visibility; }
    if (typeof s.enableNotifications !== 'undefined') { const p_en = document.getElementById('p_enableNotifications'); if (p_en) p_en.checked = !!s.enableNotifications; }
    if (typeof s.emailAlerts !== 'undefined') { const p_ea = document.getElementById('p_emailAlerts'); if (p_ea) p_ea.checked = !!s.emailAlerts; }
    if (typeof s.enableBookmarks !== 'undefined') { const p_eb = document.getElementById('p_enableBookmarks'); if (p_eb) p_eb.checked = !!s.enableBookmarks; }
  });

  // Listen for settings saved (server result). Refresh profile data when server saved to keep profile dynamic.
  document.addEventListener('cc:settings-saved', async (ev) => {
    try {
      const detail = ev && ev.detail ? ev.detail : {};
      // If server returned a canonical user, apply those fields immediately so profile updates without waiting for refetch
      if (detail && detail.user) {
        try {
          const user = detail.user;
          if (user.profileImage) {
            // save canonical image preview and apply
            try { localStorage.setItem('cc_profile_image', user.profileImage); } catch(e) {}
            try { setProfileImageUrl(user.profileImage); } catch(e) { const avatar = document.getElementById('profileDropdown'); if (avatar) avatar.src = user.profileImage; }
          }
          if (typeof user.name === 'string') { const el = document.getElementById('profileName'); if (el) el.textContent = user.name; }
          if (typeof user.bio === 'string') { const bioText = document.getElementById('bioText'); if (bioText) bioText.textContent = user.bio; }
          try { localStorage.setItem('cc_user', JSON.stringify(user)); } catch(e) {}
        } catch (e) { console.warn('Error applying returned user from settings save', e); }
      }

      // If server save succeeded, refetch profile from server to pick up any authoritative changes
      if (localStorage.getItem('cc_token') && detail.serverSaved !== false) {
        try { await getProfile(); window.CCShowToast && window.CCShowToast('Profile updated', 'success'); } catch(e) { console.warn('Could not refresh profile after settings saved', e); }
      } else {
        // Apply settings locally (use stored settings or provided detail.settings)
        const s = detail.settings || (window.CCSettings && window.CCSettings.load ? window.CCSettings.load() : {});
        if (s) {
          try {
            if (typeof s.displayName !== 'undefined') { const el = document.getElementById('profileName'); if (el) el.textContent = s.displayName; }
            if (typeof s.bio !== 'undefined') { const bioText = document.getElementById('bioText'); if (bioText) bioText.textContent = s.bio; }
            if (s.profileImage) setProfileImageUrl(s.profileImage);
            // update local cc_user copy
            try { const cu = JSON.parse(localStorage.getItem('cc_user')||'null')||{}; localStorage.setItem('cc_user', JSON.stringify(Object.assign({}, cu, s))); } catch(e){}
            window.CCShowToast && window.CCShowToast('Profile updated locally', 'info');
          } catch(e) { console.warn('Error applying local settings to profile', e); }
        }
      }
    } catch (err) { /* ignore */ }
  });

  // Cross-tab sync: listen for changes to the profile image in localStorage and update the avatar and previews
  window.addEventListener('storage', (e) => {
    try {
      if (e.key === 'cc_profile_image') {
        const newImg = e.newValue || 'https://i.ibb.co/5T0QzBk/profile-avatar.png';
        // use helper to update all relevant UI and dispatch events
        try { setProfileImageUrl(newImg); } catch(e) {}
      }
    } catch (err) { /* ignore */ }
  });

  // Refresh settings modal UI right before it's shown so it reflects latest saved settings
  const settingsModalEl = document.getElementById('settingsModal');
  if (settingsModalEl) {
    settingsModalEl.addEventListener('show.bs.modal', () => {
      try { if (window.CCSettings && typeof window.CCSettings.load === 'function') window.CCSettings.load(); } catch (e) {}
      // repopulate the modal UI
      try { populateUI(); } catch(e) {}
    });
  }

  // remove quick-settings handlers (moved to settings page). If any inline IDs remain, ignore them.

  // add visible logout button handler (if present)
  const logoutVisible = document.getElementById('logoutBtnVisible');
  const logoutExisting = document.getElementById('logoutBtn');
  const doLogout = () => {
    localStorage.removeItem('cc_token');
    localStorage.removeItem('cc_user');
    window.location.href = 'login.html';
  };
  if (logoutExisting) {
    logoutExisting.addEventListener('click', (e) => { e.preventDefault(); doLogout(); });
  }
  if (logoutVisible) {
    logoutVisible.addEventListener('click', (e) => { e.preventDefault(); doLogout(); });
  }

  // ensure settings page load reflects current settings
  try { if (window.CCSettings && typeof window.CCSettings.load === 'function') window.CCSettings.load(); } catch(e) {}

});


