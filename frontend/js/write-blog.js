const API_BASE = (window.API_BASE || 'http://localhost:4000') + '/api';

document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('cc_token');
  if (!token) {
    // protect page — redirect to login
    window.location.href = 'login.html';
    return;
  }

  const form = document.getElementById('writeBlogForm');
  const err = document.getElementById('wbError');

  // Grammar check UI elements
  const grammarBtn = document.getElementById('grammarCheckBtn');
  const grammarModalEl = document.getElementById('grammarModal');
  const grammarStatus = document.getElementById('grammarStatus');
  const grammarOriginal = document.getElementById('grammarOriginal');
  const grammarSuggested = document.getElementById('grammarSuggested');
  const grammarMatches = document.getElementById('grammarMatches');
  const applyGrammarBtn = document.getElementById('applyGrammarBtn');
  const grammarModal = new bootstrap.Modal(grammarModalEl);

  grammarBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    grammarStatus.textContent = 'Checking...';
    grammarMatches.innerHTML = '';
    grammarOriginal.value = '';
    grammarSuggested.value = '';
    grammarModal.show();
    const contentEl = document.getElementById('blogContent');
    const text = contentEl.value || '';
    try {
      const res = await fetch(`${API_BASE}/grammar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language: 'en-US' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Grammar service failed');
      grammarOriginal.value = data.original || text;
      grammarSuggested.value = data.corrected || text;
      const matches = data.matches || [];
      if (matches.length === 0) {
        grammarStatus.textContent = 'No suggestions — looks good!';
      } else {
        grammarStatus.textContent = `${matches.length} suggestion(s) found`;
        // display matches list
        const ul = document.createElement('ul');
        ul.className = 'small';
        for (const m of matches) {
          const li = document.createElement('li');
          const context = (m.context && (m.context.text || '') ) || '';
          const replacement = (m.replacements && m.replacements[0] && m.replacements[0].value) || '';
          li.textContent = `${m.message} → suggestion: "${replacement}" (context: "${context}")`;
          ul.appendChild(li);
        }
        grammarMatches.appendChild(ul);
      }
    } catch (err2) {
      console.error('grammar check failed', err2);
      grammarStatus.textContent = 'Error: ' + (err2.message || 'Failed to check grammar');
    }
  });

  applyGrammarBtn.addEventListener('click', (e) => {
    const suggested = grammarSuggested.value || '';
    if (suggested) {
      document.getElementById('blogContent').value = suggested;
    }
    grammarModal.hide();
  });

  // AI Summary UI
  const aiBtn = document.getElementById('aiSummaryBtn');
  const aiModalEl = document.getElementById('aiSummaryModal');
  const aiStatus = document.getElementById('aiStatus');
  const aiOriginal = document.getElementById('aiOriginal');
  const aiSummary = document.getElementById('aiSummary');
  const aiError = document.getElementById('aiError');
  const applyAiSummaryBtn = document.getElementById('applyAiSummaryBtn');
  const aiModal = new bootstrap.Modal(aiModalEl);

  aiBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    aiStatus.textContent = 'Generating...';
    aiError.style.display = 'none';
    aiOriginal.value = '';
    aiSummary.value = '';
    aiModal.show();
    const contentEl = document.getElementById('blogContent');
    const text = contentEl.value || '';
    try {
      const res = await fetch(`${API_BASE}/ai/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI summary failed');
      aiOriginal.value = data.original || text;
      aiSummary.value = data.summary || '';
      const provider = data.provider || (data.fallback ? 'fallback' : 'unknown');
      if (provider === 'huggingface') {
        aiStatus.textContent = aiSummary.value ? 'Summary ready (Hugging Face)' : 'No summary produced';
        aiError.style.display = 'none';
      } else if (provider === 'openai') {
        aiStatus.textContent = aiSummary.value ? 'Summary ready (OpenAI)' : 'No summary produced';
        aiError.style.display = 'none';
      } else {
        aiStatus.textContent = aiSummary.value ? 'Summary ready (fallback)' : 'No summary produced (fallback)';
        aiError.style.display = 'block';
        aiError.textContent = data.note || 'No AI configured — showing fallback summary';
      }
    } catch (err2) {
      console.error('ai summary failed', err2);
      aiError.style.display = 'block';
      aiError.textContent = err2.message || 'Failed to generate summary';
      aiStatus.textContent = 'Error';
    }
  });

  applyAiSummaryBtn.addEventListener('click', (e) => {
    const summary = aiSummary.value || '';
    if (summary) {
      document.getElementById('blogContent').value = summary;
    }
    aiModal.hide();
  });

  // Local generation UI
  const localGenBtn = document.getElementById('localGenBtn');
  const localGenModalEl = document.getElementById('localGenModal');
  const localGenModal = new bootstrap.Modal(localGenModalEl);
  const localGenStatus = document.getElementById('localGenStatus');
  const localGenSeed = document.getElementById('localGenSeed');
  const localGenResult = document.getElementById('localGenResult');
  const localGenError = document.getElementById('localGenError');
  const applyLocalGenBtn = document.getElementById('applyLocalGenBtn');

  localGenBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    localGenStatus.textContent = 'Generating...';
    localGenError.style.display = 'none';
    localGenSeed.value = '';
    localGenResult.value = '';
    localGenModal.show();

    // prepare seed/prompt from editor fields
    const title = (document.getElementById('blogTitle').value || '').trim();
    const mood = (document.getElementById('writeMood') && document.getElementById('writeMood').value) || '';
    const seed = (document.getElementById('blogContent').value || '').trim();
    localGenSeed.value = seed || title || `Write a ${mood || 'short'} blog about ...`;

    try {
      const res = await fetch(`${API_BASE}/ai/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: localGenSeed.value, title, mood })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Generation failed (HTTP ${res.status})`);
      localGenResult.value = data.generated || '';
      const provider = data.provider || (data.fallback ? 'fallback' : 'local');
      if (provider === 'huggingface') localGenStatus.textContent = localGenResult.value ? 'Generated draft ready (Hugging Face)' : 'No output produced';
      else if (provider === 'openai') localGenStatus.textContent = localGenResult.value ? 'Generated draft ready (OpenAI)' : 'No output produced';
      else if (provider === 'local') localGenStatus.textContent = localGenResult.value ? 'Generated draft ready (Local)' : 'No output produced';
      else { localGenStatus.textContent = localGenResult.value ? 'Generated draft ready (Fallback)' : 'No output produced'; localGenError.style.display = 'block'; localGenError.textContent = data.note || 'Fallback draft returned'; }
    } catch (err2) {
      console.error('local generation failed', err2);
      localGenError.style.display = 'block';
      localGenError.textContent = err2.message || 'Failed to generate draft';
      localGenStatus.textContent = 'Error';
    }
  });

  applyLocalGenBtn.addEventListener('click', () => {
    const generated = localGenResult.value || '';
    if (generated) document.getElementById('blogContent').value = generated;
    localGenModal.hide();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.style.display = 'none';
    const title = document.getElementById('blogTitle').value.trim();
    const content = document.getElementById('blogContent').value.trim();
    if (!title || !content) {
      err.textContent = 'Title and content are required.';
      err.style.display = 'block';
      return;
    }
    try {
      const essential = !!document.getElementById('writeEssential').checked;
      const mood = (document.getElementById('writeMood') && document.getElementById('writeMood').value) || '';
      const res = await fetch(`${API_BASE}/blogs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title, content, essential, mood })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to publish');
      // success — go to blog listing
      window.location.href = 'blog.html';
    } catch (err2) {
      console.error(err2);
      err.textContent = err2.message || 'Failed to publish blog';
      err.style.display = 'block';
    }
  });
});
