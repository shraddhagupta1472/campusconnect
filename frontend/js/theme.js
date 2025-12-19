// Theme toggle and persistence
(function () {
  const KEY = 'cc_theme';
  const root = document.documentElement;

  function applyTheme(theme) {
    if (theme === 'dark') root.classList.add('dark-theme');
    else root.classList.remove('dark-theme');
    updateToggleUIForAll();
  }

  function getStored() {
    return localStorage.getItem(KEY);
  }

  function detectSystem() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function toggleTheme() {
    const isDark = root.classList.contains('dark-theme');
    const newTheme = isDark ? 'light' : 'dark';
    applyTheme(newTheme);
    localStorage.setItem(KEY, newTheme);
  }

  function updateToggleUIForAll() {
    const toggles = document.querySelectorAll('[data-theme-toggle]');
    if (!toggles) return;
    const isDark = root.classList.contains('dark-theme');
    toggles.forEach(el => {
      if (el.tagName === 'BUTTON') {
        el.textContent = isDark ? '☀️' : '🌙';
        el.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
        el.setAttribute('aria-pressed', isDark);
      } else if (el.tagName === 'INPUT' && el.type === 'checkbox') {
        el.checked = isDark;
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    const stored = getStored();
    applyTheme(stored || detectSystem());

    // attach listeners to all toggles (buttons or inputs) identified by data-theme-toggle
    const toggles = document.querySelectorAll('[data-theme-toggle]');
    toggles.forEach(el => {
      if (el.tagName === 'BUTTON') el.addEventListener('click', toggleTheme);
      else if (el.tagName === 'INPUT' && el.type === 'checkbox') el.addEventListener('change', toggleTheme);
    });

    // react to system changes if user hasn't explicitly chosen
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
      if (!getStored()) applyTheme(e.matches ? 'dark' : 'light');
    });
  });

  // expose a small API in case pages want to programmatically set theme
  window.ccTheme = {
    applyTheme,
    toggleTheme,
    getStored
  };
})();
