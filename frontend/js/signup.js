const API_BASE = (window.API_BASE || 'http://localhost:4000') + '/api';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('signupForm');
  const errorEl = document.getElementById('signupError');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.style.display = 'none';
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirm = document.getElementById('confirmPassword').value;
    if (password !== confirm) {
      errorEl.textContent = 'Passwords do not match';
      errorEl.style.display = 'block';
      return;
    }
    try {
      const payload = { name, email, password };
      const res = await fetch(`${API_BASE}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Signup failed');
      localStorage.setItem('cc_user', JSON.stringify(data.user));
      localStorage.setItem('cc_token', data.token);
      window.location.href = 'profile.html';
    } catch (err) {
      errorEl.textContent = err.message || 'Signup failed';
      errorEl.style.display = 'block';
    }
  });
});
