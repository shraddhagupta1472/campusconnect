if (typeof API_BASE === 'undefined') { var API_BASE = (window.API_BASE || 'http://localhost:4000') + '/api'; }

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const errorEl = document.getElementById('loginError');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.style.display = 'none';
    let email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    // normalize email to lowercase for robust matching
    const sendEmail = (email || '').toLowerCase();
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: sendEmail, password })
      });

      // be defensive: some servers or proxies may return HTML (e.g., error page) instead of JSON
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      let data = null;
      if (ct.indexOf('application/json') !== -1) {
        try { data = await res.json(); } catch (e) { console.error('Failed to parse JSON from /login:', e); }
      } else {
        const text = await res.text();
        console.error('Non-JSON response from /login:', text.slice(0, 200));
        // explicit helpful errors for common HTTP statuses
        if (res.status === 404) throw new Error('Server returned 404 Not Found. Is the backend running and reachable?');
        if (res.status >= 500) throw new Error(`Server error (${res.status}). Check backend logs.`);
        // try to extract a useful message from HTML title or body, otherwise fall back to status text
        const m = text.match(/<title[^>]*>([^<]+)</i) || text.match(/<h1[^>]*>([^<]+)</i) || [];
        const msg = m[1] ? m[1].trim() : res.statusText || 'Login failed';
        throw new Error(msg);
      }

      if (!res.ok) throw new Error((data && data.error) || 'Login failed');
      localStorage.setItem('cc_user', JSON.stringify(data.user));
      localStorage.setItem('cc_token', data.token);
      window.location.href = 'profile.html';
    } catch (err) {
      // network-level errors (e.g., server unreachable) often surface as TypeError with message 'Failed to fetch'
      const msg = (err && err.message) ? err.message : 'Login failed';
      if (msg.indexOf('Failed to fetch') !== -1 || msg.indexOf('NetworkError') !== -1) {
        errorEl.textContent = 'Network error: could not reach server. Is the backend running?';
      } else {
        errorEl.textContent = msg;
      }
      errorEl.style.display = 'block';
    }
  });
});
