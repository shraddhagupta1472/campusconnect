const express = require('express');
const router = express.Router();
const config = require('../utils/config');

// POST /api/ai/summary { text }
router.post('/ai/summary', async (req, res) => {
  try {
    const { text = '', model = 'gpt-3.5-turbo' } = req.body || {};
    if (typeof text !== 'string' || text.trim().length === 0) return res.status(400).json({ error: 'text is required' });
    if (text.length > 20000) return res.status(400).json({ error: 'text too long (max 20000 chars)' });

    // Prefer Hugging Face if configured
    const hfKey = config.HUGGINGFACE_API_KEY;
    if (hfKey) {
      try {
        const hfModel = req.body.huggingface_model || 'sshleifer/distilbart-cnn-12-6';
        const payload = { inputs: text, parameters: { max_length: 150, min_length: 30, do_sample: false } };
        const resp = await fetch(`https://api-inference.huggingface.co/models/${encodeURIComponent(hfModel)}`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${hfKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!resp.ok) {
          const txt = await resp.text().catch(() => '');
          // try to continue to OpenAI if available, otherwise fallback
          console.error('HuggingFace API error', resp.status, txt);
        } else {
          const hfJson = await resp.json();
          // common response for summarization models is [{ summary_text: '...' }] or { summary_text: '...' }
          let summaryText = '';
          if (Array.isArray(hfJson) && hfJson[0] && (hfJson[0].summary_text || typeof hfJson[0] === 'string')) {
            summaryText = hfJson[0].summary_text || (typeof hfJson[0] === 'string' ? hfJson[0] : '') ;
          } else if (hfJson && hfJson.summary_text) {
            summaryText = hfJson.summary_text;
          } else if (typeof hfJson === 'string') {
            summaryText = hfJson;
          }
          if (summaryText && summaryText.trim().length > 0) {
            return res.json({ original: text, summary: summaryText.trim(), provider: 'huggingface' });
          }
        }
      } catch (e) {
        console.error('HuggingFace call failed:', e && e.message ? e.message : e);
        // fall through to OpenAI or extractive fallback
      }
    }

    // If Hugging Face not used or failed, try OpenAI if configured
    const apiKey = config.OPENAI_API_KEY;
    if (apiKey) {
      try {
        const promptSystem = 'You are a helpful assistant that summarizes blog posts concisely. Provide a short, clear summary in 3-5 sentences, preserving factual details and headings when relevant.';
        const userContent = `Summarize the following blog content succinctly (3-5 sentences). Do not add new facts. Return a single concise paragraph.\n\n${text}`;

        const body = {
          model,
          messages: [
            { role: 'system', content: promptSystem },
            { role: 'user', content: userContent }
          ],
          temperature: 0.3,
          max_tokens: 250
        };

        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(body)
        });

        if (!resp.ok) {
          const txt = await resp.text().catch(() => '');
          console.error('OpenAI API error', resp.status, txt);
        } else {
          const json = await resp.json();
          const summary = (json.choices && json.choices[0] && (json.choices[0].message && json.choices[0].message.content)) || '';
          if (summary && summary.trim().length > 0) {
            return res.json({ original: text, summary: (summary || '').trim(), provider: 'openai' });
          }
        }
      } catch (err) {
        console.error('OpenAI call failed:', err && err.message ? err.message : err);
        // fall through to extractive fallback
      }
    }

    // Last resort: extractive fallback summary
    try {
      const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
      if (sentences.length === 0) return res.json({ original: text, summary: '' });
      const firstSlice = sentences.slice(0, 6);
      const sorted = firstSlice
        .map((s, idx) => ({ s, idx, len: s.length }))
        .sort((a, b) => b.len - a.len)
        .slice(0, 3)
        .sort((a, b) => a.idx - b.idx)
        .map(x => x.s);
      const summary = sorted.join(' ').trim();
      return res.json({ original: text, summary: summary, provider: 'fallback', fallback: true, note: 'No AI configured or both providers failed — returned extractive fallback summary' });
    } catch (e) {
      const summary = text.slice(0, 300) + (text.length > 300 ? '...' : '');
      return res.json({ original: text, summary, provider: 'fallback', fallback: true, note: 'No AI configured — truncated summary' });
    }
  } catch (err) {
    console.error('ai summary error:', err && err.message ? err.message : err);
    res.status(500).json({ error: 'Server error' });
  }
});


// Route: POST /api/ai/generate
// Forwards request to a local generation service at http://localhost:11434/api/generate
router.post('/ai/generate', async (req, res) => {
  try {
    const { prompt = '', title = '', mood = '' } = req.body || {};
    const payload = Object.assign({}, req.body);

    // attempt local service first
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const upstreamResp = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (upstreamResp && upstreamResp.ok) {
        let body;
        try { body = await upstreamResp.json(); } catch (e) { body = { generated: await upstreamResp.text().catch(() => '') }; }
        let generated = '';
        if (typeof body === 'string') generated = body;
        else if (body.generated) generated = body.generated;
        else if (body.text) generated = body.text;
        else if (body.result) generated = body.result;
        else if (Array.isArray(body) && body[0] && body[0].generated) generated = body[0].generated;
        else generated = JSON.stringify(body);
        return res.json({ generated, provider: 'local' });
      }
      // else fallthrough and try other providers
    } catch (err) {
      // if abort
      if (err && err.name === 'AbortError') {
        // time out - proceed to fallback generation
      } else {
        // network error - proceed to fallback
      }
    } finally {
      clearTimeout(timeout);
    }

    // If local service unavailable, try Hugging Face text-generation (if configured)
    const hfKey = config.HUGGINGFACE_API_KEY;
    if (hfKey) {
      try {
        const hfModel = req.body.huggingface_model || 'gpt2';
        const payload = { inputs: prompt || title || 'Write a short blog', parameters: { max_length: 250, do_sample: true, temperature: 0.7 } };
        const resp = await fetch(`https://api-inference.huggingface.co/models/${encodeURIComponent(hfModel)}`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${hfKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (resp.ok) {
          const hfJson = await resp.json();
          // Many HF generation models return [{generated_text: '...'}] or { generated_text: '...' }
          let generated = '';
          if (Array.isArray(hfJson) && hfJson[0]) generated = hfJson[0].generated_text || (hfJson[0].text || '');
          else if (hfJson.generated_text) generated = hfJson.generated_text;
          else if (typeof hfJson === 'string') generated = hfJson;
          if (generated) return res.json({ generated: (generated || '').trim(), provider: 'huggingface' });
        }
      } catch (e) { /* ignore huggingface failure and fall through */ }
    }

    // If OpenAI API key configured, use it to generate draft
    const apiKey = config.OPENAI_API_KEY;
    if (apiKey) {
      try {
        const system = 'You are a helpful assistant that writes short blog posts. Produce a coherent, engaging blog post of about 3 short paragraphs based on the seed information.';
        const userPrompt = `Title: ${title || ''}\nMood: ${mood || ''}\nSeed: ${prompt || ''}\n\nWrite the blog post:`;
        const body = { model: 'gpt-3.5-turbo', messages: [{ role: 'system', content: system }, { role: 'user', content: userPrompt }], temperature: 0.6, max_tokens: 600 };
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify(body)
        });
        if (resp.ok) {
          const json = await resp.json();
          const gen = (json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || '';
          if (gen && gen.trim()) return res.json({ generated: gen.trim(), provider: 'openai' });
        }
      } catch (e) { /* ignore and fallback */ }
    }

    // Last resort: simple template-based fallback generator (guarantees functionality)
    try {
      const seedText = prompt || title || 'A short blog about something interesting.';
      const intro = `Introduction: ${seedText}.`;
      const body1 = `This post discusses ${seedText} in a clear and friendly way, highlighting the most relevant points and practical takeaways.`;
      const body2 = `Readers will find examples and simple steps to understand and apply ideas related to ${seedText}.`;
      const conclusion = `Conclusion: In summary, ${seedText} matters because it helps people engage more effectively with the subject and see practical value.`;
      const generated = [intro, body1, body2, conclusion].join('\n\n');
      return res.json({ generated, provider: 'fallback', fallback: true, note: 'Local generation and remote APIs unavailable — returned template draft' });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to generate draft' });
    }

  } catch (err) {
    console.error('ai generate proxy error:', err && err.message ? err.message : err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
