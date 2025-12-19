// settings.js — sync UI <-> localStorage and dispatch update events to profile page
// Beginner-friendly, commented, and backend-ready (stores settings in localStorage). 

const SETTINGS_KEY = 'cc_settings';
const IMAGE_MAX_BYTES = 500 * 1024; // 500KB limit for client preview
const API_BASE = (window.API_BASE || 'http://localhost:4000') + '/api';

function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch (e) { return {}; }
}

async function saveSettings(obj) {
  const settings = obj || {};
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  // Backwards compatibility keys used elsewhere
  try {
    if (typeof settings.showImages !== 'undefined') localStorage.setItem('cc_show_images', settings.showImages ? '1' : '0');
    if (typeof settings.profileImage === 'string') localStorage.setItem('cc_profile_image', settings.profileImage);
  } catch (e) { /* ignore localStorage exceptions */ }

  let serverSaved = true;
  let savedUser = null;
  // Try to persist to server if logged in
  try {
    const token = localStorage.getItem('cc_token');
    if (token) {
      const payload = {};
      if (typeof settings.displayName === 'string') payload.name = settings.displayName;
      if (typeof settings.enableBookmarks === 'boolean') payload.bookmarksEnabled = settings.enableBookmarks;
      if (typeof settings.enableNotifications === 'boolean') payload.disableNotifications = !settings.enableNotifications;
      // include bio in payload so Settings updates bio server-side as well
      if (typeof settings.bio === 'string') payload.bio = settings.bio;      // include profile image if present so avatar can be persisted server-side
      if (typeof settings.profileImage === 'string') payload.profileImage = settings.profileImage;      if (Object.keys(payload).length) {
        const res = await fetch(`${API_BASE}/profile`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.user) {
            savedUser = data.user;
            try {
              const current = JSON.parse(localStorage.getItem('cc_user') || 'null') || {};
              const updated = Object.assign({}, current, data.user);
              localStorage.setItem('cc_user', JSON.stringify(updated));
              window.cc_user_profile = data.user;
            } catch (e) { /* ignore */ }
          }
        } else {
          console.warn('Settings save to server returned', res.status);
          serverSaved = false;
        }
      }
    }
  } catch (err) {
    console.error('Failed to save settings to server', err);
    serverSaved = false;
  }

  // Let other pages know settings changed
  document.dispatchEvent(new CustomEvent('cc:settings-updated', { detail: settings }));
  return { settings, serverSaved, user: savedUser };
}

function showTempSaved(el) {
  if (!el) return;
  el.style.display = 'inline-block';
  setTimeout(() => { el.style.display = 'none'; }, 1500);
}

function applyTheme(dark) {
  if (dark) document.body.classList.add('dark-mode'); else document.body.classList.remove('dark-mode');
}

// Populate UI with existing settings
let selectedAvatarFile = null; // holds File object when user picks an avatar to save to server

function populateUI() {
  const s = loadSettings();
  const el_display = document.getElementById('s_displayName'); if (el_display) el_display.value = s.displayName || '';
  const el_bio = document.getElementById('s_bio'); if (el_bio) el_bio.value = s.bio || '';
  const el_dark = document.getElementById('s_darkMode'); if (el_dark) el_dark.checked = !!s.darkMode;
  const el_showImages = document.getElementById('s_showImages'); if (el_showImages) el_showImages.checked = typeof s.showImages === 'boolean' ? s.showImages : (localStorage.getItem('cc_show_images') === '1');
  const el_notif = document.getElementById('s_enableNotifications'); if (el_notif) el_notif.checked = !!s.enableNotifications;
  const el_email = document.getElementById('s_emailAlerts'); if (el_email) el_email.checked = !!s.emailAlerts;
  const el_vis = document.getElementById('s_visibility'); if (el_vis) el_vis.value = s.visibility || 'public';
  const el_showAct = document.getElementById('s_showActivity'); if (el_showAct) el_showAct.checked = typeof s.showActivity === 'boolean' ? s.showActivity : true;
  const el_book = document.getElementById('s_enableBookmarks'); if (el_book) el_book.checked = typeof s.enableBookmarks === 'boolean' ? s.enableBookmarks : true;

  // profile image preview
  const img = s.profileImage || localStorage.getItem('cc_profile_image');
  if (img) {
    const prev = document.querySelector('#s_avatarPreview img'); if (prev) prev.src = img;
    const prevLg = document.querySelector('#s_avatarPreviewLarge img'); if (prevLg) prevLg.src = img;
  }

  // previews
  const pvName = document.getElementById('s_previewName'); if (pvName) pvName.textContent = s.displayName || (window.cc_user_profile && window.cc_user_profile.name) || 'Your name';
  const pvBio = document.getElementById('s_previewBio'); if (pvBio) pvBio.textContent = s.bio || 'Your bio preview will appear here.';
  const pvTheme = document.getElementById('s_previewTheme'); if (pvTheme) pvTheme.textContent = s.darkMode ? 'Dark' : 'Light';
  const pvVis = document.getElementById('s_previewVisibility'); if (pvVis) pvVis.textContent = (s.visibility || 'public').charAt(0).toUpperCase() + (s.visibility || 'public').slice(1);
  const pvNotif = document.getElementById('s_previewNotifications'); if (pvNotif) pvNotif.textContent = (s.enableNotifications ? 'On' : 'Off');

  applyTheme(!!s.darkMode);
  // apply show images immediately
  if (typeof s.showImages !== 'undefined') {
    const evt = new CustomEvent('cc:settings-updated', { detail: s });
    document.dispatchEvent(evt);
  }
}

// Wire up events
document.addEventListener('DOMContentLoaded', () => {
  populateUI();

  // Live preview handlers (attach only if elements exist)
  const nameEl = document.getElementById('s_displayName');
  const bioEl = document.getElementById('s_bio');
  const darkEl = document.getElementById('s_darkMode');
  const showImagesEl = document.getElementById('s_showImages');
  const visEl = document.getElementById('s_visibility');
  const notifEl = document.getElementById('s_enableNotifications');

  if (nameEl) nameEl.addEventListener('input', (e) => { const el = document.getElementById('s_previewName'); if (el) el.textContent = e.target.value || (window.cc_user_profile && window.cc_user_profile.name) || 'Your name'; });
  if (bioEl) bioEl.addEventListener('input', (e) => { const el = document.getElementById('s_previewBio'); if (el) el.textContent = e.target.value || 'Your bio preview will appear here.'; });
  if (darkEl) darkEl.addEventListener('change', (e) => { const el = document.getElementById('s_previewTheme'); if (el) el.textContent = e.target.checked ? 'Dark' : 'Light'; applyTheme(e.target.checked); });
  if (visEl) visEl.addEventListener('change', (e) => { const el = document.getElementById('s_previewVisibility'); if (el) el.textContent = e.target.value.charAt(0).toUpperCase() + e.target.value.slice(1); });
  if (notifEl) notifEl.addEventListener('change', (e) => { const el = document.getElementById('s_previewNotifications'); if (el) el.textContent = e.target.checked ? 'On' : 'Off'; });

  // Profile image upload / preview
  const imgInput = document.getElementById('s_profileImageInput');
  if (imgInput) {
    imgInput.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      const errEl = document.getElementById('s_profileSaved');
      if (!f) return;
      if (!f.type.startsWith('image/')) { alert('Unsupported file type'); e.target.value = ''; return; }
      if (f.size > IMAGE_MAX_BYTES) { alert('Image too large (max 500KB)'); e.target.value = ''; return; }
      // remember the raw file so we can upload it when Save is clicked
      selectedAvatarFile = f;
      const reader = new FileReader();
      reader.onload = () => {
        const data = String(reader.result);
        const prev = document.querySelector('#s_avatarPreview img'); if (prev) prev.src = data;
        const prevLg = document.querySelector('#s_avatarPreviewLarge img'); if (prevLg) prevLg.src = data;
        // store immediately in preview-only storage (not saving until Save clicked)
        imgInput.dataset.preview = data;
        // Mirror immediately to profile page (if open) and global storage so previews stay consistent
        try {
          localStorage.setItem('cc_profile_image', data);
          const prof = document.getElementById('profileDropdown'); if (prof) prof.src = data;
          document.dispatchEvent(new CustomEvent('cc:settings-updated', { detail: { profileImage: data } }));
        } catch (e) { /* ignore */ }
      };
      reader.readAsDataURL(f);
    });
  }

  document.getElementById('s_removeImage').addEventListener('click', async (e) => {
    e.preventDefault();
    const defaultImg = 'https://i.ibb.co/5T0QzBk/profile-avatar.png';
    const token = localStorage.getItem('cc_token');
    // clear UI first
    document.querySelector('#s_avatarPreview img').src = defaultImg;
    document.querySelector('#s_avatarPreviewLarge img').src = defaultImg;
    const inputEl = document.getElementById('s_profileImageInput'); if (inputEl) { inputEl.value = ''; delete inputEl.dataset.preview; }
    selectedAvatarFile = null;

    try {
      if (token) {
        // call server to delete stored avatar
        try {
          const res = await fetch((window.API_BASE || 'http://localhost:4000') + '/api/profile/avatar', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
          if (!res.ok) throw new Error('Server could not delete avatar');
          const d = await res.json().catch(() => ({}));
          const srvUser = d && d.user ? d.user : null;
          if (srvUser && srvUser.profileImage) {
            try { localStorage.setItem('cc_profile_image', srvUser.profileImage); } catch(e) {}
            document.querySelector('#s_avatarPreview img').src = srvUser.profileImage;
            document.querySelector('#s_avatarPreviewLarge img').src = srvUser.profileImage;
            const prof = document.getElementById('profileDropdown'); if (prof) prof.src = srvUser.profileImage;
          } else {
            try { localStorage.removeItem('cc_profile_image'); } catch(e) {}
            const prof = document.getElementById('profileDropdown'); if (prof) prof.src = defaultImg;
          }
          try { document.dispatchEvent(new CustomEvent('cc:settings-saved', { detail: { serverSaved: true, user: srvUser } })); } catch(e) {}
          if (window.CCShowToast) window.CCShowToast('Profile image removed', 'success');
          return;
        } catch (err) {
          console.error('Failed to delete avatar on server', err);
          if (window.CCShowToast) window.CCShowToast('Could not remove image from server', 'danger');
          return;
        }
      }
    } catch (e) { /* ignore */ }

    // fallback: not signed-in, just clear local preview
    try {
      localStorage.removeItem('cc_profile_image');
      const prof = document.getElementById('profileDropdown'); if (prof) prof.src = defaultImg;
      document.dispatchEvent(new CustomEvent('cc:settings-updated', { detail: { profileImage: defaultImg } }));
      if (window.CCShowToast) window.CCShowToast('Profile image removed (local only)', 'info');
    } catch (e) { /* ignore */ }
  });

  // Small utility: show a Bootstrap toast
  function showToast(message, type = 'success') {
    try {
      const containerId = 'cc_toast_container';
      let container = document.getElementById(containerId);
      if (!container) {
        container = document.createElement('div');
        container.id = containerId;
        container.className = 'position-fixed bottom-0 end-0 p-3';
        container.style.zIndex = 1080;
        document.body.appendChild(container);
      }
      const toastEl = document.createElement('div');
      toastEl.className = 'toast align-items-center text-bg-' + (type === 'success' ? 'success' : (type === 'warning' ? 'warning' : 'danger')) + ' border-0';
      toastEl.role = 'alert';
      toastEl.ariaLive = 'assertive';
      toastEl.ariaAtomic = 'true';
      toastEl.innerHTML = `<div class="d-flex"><div class="toast-body">${message}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button></div>`;
      container.appendChild(toastEl);
      const bsToast = new bootstrap.Toast(toastEl, { delay: 4000 });
      bsToast.show();
      toastEl.addEventListener('hidden.bs.toast', () => { toastEl.remove(); });
    } catch (e) { console.warn('Toast error', e); }
  }

  // Save all settings with UX: disable button, show toast, restore button
  document.getElementById('s_saveAll').addEventListener('click', async (ev) => {
    ev.preventDefault();
    const btn = document.getElementById('s_saveAll');
    const origText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Saving...';

    const settings = {
      displayName: document.getElementById('s_displayName').value.trim() || undefined,
      bio: document.getElementById('s_bio').value.trim() || undefined,
      darkMode: !!document.getElementById('s_darkMode').checked,
      showImages: typeof document.getElementById('s_showImages').checked === 'boolean' ? document.getElementById('s_showImages').checked : (localStorage.getItem('cc_show_images') === '1'),
      enableNotifications: !!document.getElementById('s_enableNotifications').checked,
      emailAlerts: !!document.getElementById('s_emailAlerts').checked,
      visibility: document.getElementById('s_visibility').value || 'public',
      showActivity: !!document.getElementById('s_showActivity').checked,
      enableBookmarks: !!document.getElementById('s_enableBookmarks').checked
    };

    // include profile image if preview present
    const imgPreview = document.getElementById('s_profileImageInput').dataset.preview;
    if (imgPreview) settings.profileImage = imgPreview;

    try {
      // If user picked a file and is signed-in, upload using multipart/form-data so server stores a real file
      const token = localStorage.getItem('cc_token');
      if (selectedAvatarFile && token) {
        try {
          const form = new FormData();
          // avatar file
          form.append('avatar', selectedAvatarFile);
          // other fields as text fields so server can update name/bio in the same request
          if (typeof settings.displayName === 'string') form.append('name', settings.displayName);
          if (typeof settings.bio === 'string') form.append('bio', settings.bio);
          if (typeof settings.showActivity !== 'undefined') form.append('showActivity', settings.showActivity ? '1' : '0');
          if (typeof settings.visibility !== 'undefined') form.append('visibility', settings.visibility);
          if (typeof settings.enableNotifications !== 'undefined') form.append('enableNotifications', settings.enableNotifications ? '1' : '0');

          const res = await fetch((window.API_BASE || 'http://localhost:4000') + '/api/profile', {
            method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: form
          });
          const data = await res.json().catch(() => ({}));
          const result = { settings, serverSaved: !!res.ok, user: data && data.user ? data.user : null };
          showTempSaved(document.getElementById('s_status'));
          showTempSaved(document.getElementById('s_profileSaved'));
          if (!res.ok) {
            showToast('Settings saved locally but could not be saved to the server.', 'warning');
          } else {
            showToast('Settings saved', 'success');
          }
          // if server returned canonical user, update local storage and UI
          if (result.user) {
            try { localStorage.setItem('cc_user', JSON.stringify(result.user)); } catch(e) {}
            // set canonical profile image (add cache-buster)
            if (result.user.profileImage) {
              const imgUrl = result.user.profileImage + (result.user.profileImage.indexOf('?') === -1 ? `?v=${Date.now()}` : `&v=${Date.now()}`);
              try { localStorage.setItem('cc_profile_image', imgUrl); } catch(e) {}
            }
          }
          // clear selected file
          selectedAvatarFile = null; const inputEl = document.getElementById('s_profileImageInput'); if (inputEl) inputEl.value = '';
          try { document.dispatchEvent(new CustomEvent('cc:settings-saved', { detail: result })); } catch(e) {}
        } catch (err) {
          console.error('Failed to upload avatar', err);
          showToast('Failed to upload avatar to server', 'danger');
        }
      } else {
        const result = await saveSettings(settings);
        showTempSaved(document.getElementById('s_status'));
        showTempSaved(document.getElementById('s_profileSaved'));
        if (localStorage.getItem('cc_token') && result && result.serverSaved === false) {
          showToast('Settings saved locally but could not be saved to the server.', 'warning');
        } else {
          showToast('Settings saved', 'success');
        }
        // Notify other pages that settings were saved (include server result)
        try { document.dispatchEvent(new CustomEvent('cc:settings-saved', { detail: result })); } catch(e) {}
      }
    } catch (e) {
      console.error(e);
      showToast('Failed to save settings', 'danger');
    } finally {
      btn.disabled = false;
      btn.textContent = origText;
    }
  });

  // Reset to blank/defaults (does not delete server data)
  document.getElementById('s_reset').addEventListener('click', (e) => {
    e.preventDefault();
    if (!confirm('Reset settings to defaults? This will clear local settings only.')) return;
    localStorage.removeItem(SETTINGS_KEY);
    // also remove backward keys
    try { localStorage.removeItem('cc_show_images'); localStorage.removeItem('cc_profile_image'); } catch (e) {}
    populateUI();
    document.dispatchEvent(new CustomEvent('cc:settings-updated', { detail: loadSettings() }));
    showTempSaved(document.getElementById('s_status'));
  });

  // change password (UI-only modal)
  document.getElementById('s_changePassword').addEventListener('click', () => {
    const m = new bootstrap.Modal(document.getElementById('changePasswordModal'));
    m.show();
  });
  document.getElementById('cp_save').addEventListener('click', () => {
    alert('Password change is UI-only in this demo. Implement server-side call to change password.');
    const m = bootstrap.Modal.getInstance(document.getElementById('changePasswordModal'));
    if (m) m.hide();
  });

  // Logout all sessions simulation
  document.getElementById('s_logoutAll').addEventListener('click', () => {
    if (!confirm('Simulate logging out from all sessions? This will clear your local token.')) return;
    localStorage.removeItem('cc_token');
    showTempSaved(document.getElementById('s_status'));
    alert('Simulated logout: local session cleared. To fully log out other sessions, implement server-side session invalidation.');
  });

});

// When other pages ask to apply settings, update UI accordingly (e.g., profile page listens)
document.addEventListener('cc:settings-updated', (e) => {
  // keep UI consistent (populate values from new settings)
  populateUI();
});

// Cross-tab sync: listen for storage events so updates from other tabs/pages update previews immediately
window.addEventListener('storage', (e) => {
  try {
    if (e.key === 'cc_profile_image') {
      const img = e.newValue || 'https://i.ibb.co/5T0QzBk/profile-avatar.png';
      const prev = document.querySelector('#s_avatarPreview img'); if (prev) prev.src = img;
      const prevLg = document.querySelector('#s_avatarPreviewLarge img'); if (prevLg) prevLg.src = img;
      // also update profile page avatar if present
      const prof = document.getElementById('profileDropdown'); if (prof) prof.src = img;
      // reflect into settings UI dataset so Save will include it
      const input = document.getElementById('s_profileImageInput'); if (input) { input.dataset.preview = e.newValue || ''; }
    }
  } catch (err) { /* ignore */ }
});

// When settings are saved (server result) update the Settings UI immediately so previews match server canonical values
document.addEventListener('cc:settings-saved', (ev) => {
  try {
    const detail = ev && ev.detail ? ev.detail : {};
    // if server provided a user object, prefer server canonical image and fields
    if (detail && detail.user) {
      const user = detail.user;
      const img = user.profileImage || localStorage.getItem('cc_profile_image') || 'https://i.ibb.co/5T0QzBk/profile-avatar.png';
      const prev = document.querySelector('#s_avatarPreview img'); if (prev) prev.src = img;
      const prevLg = document.querySelector('#s_avatarPreviewLarge img'); if (prevLg) prevLg.src = img;
      try { localStorage.setItem('cc_profile_image', img); } catch(e) {}
      const input = document.getElementById('s_profileImageInput'); if (input) { input.dataset.preview = img; }
      // update name/bio fields if server returned them
      if (typeof user.name === 'string') {
        const nameEl = document.getElementById('s_displayName'); if (nameEl) nameEl.value = user.name;
        const pvName = document.getElementById('s_previewName'); if (pvName) pvName.textContent = user.name;
      }
      if (typeof user.bio === 'string') {
        const bioEl = document.getElementById('s_bio'); if (bioEl) bioEl.value = user.bio;
        const pvBio = document.getElementById('s_previewBio'); if (pvBio) pvBio.textContent = user.bio;
      }
    } else if (detail && detail.settings) {
      // local-only save: just repopulate the UI
      populateUI();
    }
  } catch (err) { /* ignore */ }
});

// Expose a simple API for other scripts to read settings and show toasts
window.CCSettings = {
  load: loadSettings,
  save: saveSettings
};
// Allow other modules to show a toast using the same styling
window.CCShowToast = function(msg, type) { try { showToast(msg, type); } catch(e){} };
