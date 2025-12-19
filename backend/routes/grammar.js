const express = require('express');
const router = express.Router();

// Simple proxy to LanguageTool public API to avoid CORS and normalize output
// POST /api/grammar { text, language }
router.post('/grammar', async (req, res) => {
  try {
    const { text = '', language = 'en-US' } = req.body || {};
    if (typeof text !== 'string') return res.status(400).json({ error: 'text must be a string' });
    if (text.length === 0) return res.status(400).json({ error: 'text is required' });
    // reject extremely large payloads
    if (text.length > 20000) return res.status(400).json({ error: 'text too long (max 20000 chars)' });

    // call LanguageTool public API
    const params = new URLSearchParams();
    params.append('text', text);
    params.append('language', language);

    const resp = await fetch('https://api.languagetool.org/v2/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    if (!resp.ok) {
      const textBody = await resp.text().catch(() => '');
      return res.status(502).json({ error: 'LanguageTool error', status: resp.status, body: textBody });
    }

    const result = await resp.json();

    // apply suggestions to produce corrected text
    const matches = result.matches || [];
    let corrected = text;
    try {
      // sort by offset descending so replacements don't affect earlier offsets
      const byOffsetDesc = matches
        .map(m => ({ offset: m.offset, length: m.length, replacements: (m.replacements || []).map(r => r.value).filter(Boolean) }))
        .filter(m => m.replacements.length > 0)
        .sort((a, b) => b.offset - a.offset);
      for (const m of byOffsetDesc) {
        const replacement = m.replacements[0];
        corrected = corrected.slice(0, m.offset) + replacement + corrected.slice(m.offset + m.length);
      }
    } catch (e) {
      // if anything fails, just return original text as corrected
      corrected = text;
    }

    return res.json({ original: text, corrected, matches: result.matches || [] });
  } catch (err) {
    console.error('grammar proxy error:', err && err.message ? err.message : err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
