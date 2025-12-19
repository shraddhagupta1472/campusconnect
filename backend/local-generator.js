const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// Simple local generation endpoint for development/testing
// POST /api/generate { prompt, title, mood }
app.post('/api/generate', (req, res) => {
  try {
    const { prompt = '', title = '', mood = '' } = req.body || {};
    const seed = (prompt || title || 'An interesting topic').trim();
    const moodTag = mood ? ` (${mood})` : '';

    // naive generation: three short paragraphs using the seed
    const intro = `${title ? title + ': ' : ''}${seed}${moodTag} — an engaging introduction that hooks the reader.`;
    const mid = `In this post, we explore ${seed} in simple terms, offering practical tips and examples.`;
    const outro = `To conclude, ${seed} matters because it leads to concrete improvements in learning and application.`;
    const generated = [intro, mid, outro].join('\n\n');

    // return normalized shape
    return res.json({ generated });
  } catch (err) {
    console.error('local generator error', err && err.message ? err.message : err);
    res.status(500).json({ error: 'Local generator error' });
  }
});

const PORT = process.env.LOCAL_GEN_PORT || 11434;
app.listen(PORT, () => console.log(`Local generator listening on http://localhost:${PORT}/api/generate`));
