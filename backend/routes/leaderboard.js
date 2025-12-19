const express = require('express');
const router = express.Router();
const db = require('../utils/db');

async function computeLeaderboard() {
  // returns an array of { id, name, blogs, originality } (Mongo-only)
  const { User, Blog } = db.getModels();
  const users = await User.find().lean();

  const results = await Promise.all(users.map(async (u) => {
    const idStr = u._id.toString();
    const blogsCount = await Blog.countDocuments({ authorId: idStr });
    const originality = Math.max(50, 100 - blogsCount * 2);
    return { id: idStr, name: u.name, blogs: blogsCount, originality };
  }));

  results.sort((a, b) => b.originality - a.originality || b.blogs - a.blogs);
  return results;
}

// GET /api/leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const results = await computeLeaderboard();
    res.json(results);
  } catch (err) {
    console.error('Leaderboard route error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Dev: GET /api/leaderboard/refresh - recompute, persist and broadcast (non-production only)
router.get('/leaderboard/refresh', async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') return res.status(403).json({ error: 'Not allowed in production' });
    const results = await computeLeaderboard();
    if (db.isMongo()) {
      const ok = await persistLeaderboard(results);
      if (!ok) console.error('leaderboard/refresh: persistLeaderboard failed');
    }
    try { const io = require('../utils/io').getIo(); if (io) io.emit('leaderboard', results); } catch (e) { /* ignore */ }
    res.json({ ok: true, results });
  } catch (err) {
    console.error('Leaderboard refresh failed:', err);
    res.status(500).json({ error: 'Failed to refresh leaderboard' });
  }
});

// persist leaderboard results into user documents (Mongo only)
async function persistLeaderboard(results) {
  if (!db.isMongo()) return null;
  const { User } = db.getModels();
  try {
    // perform per-user updates for reliability and better logging
    let success = true;
    const failures = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      try {
        const updateRes = await User.updateOne(
          { _id: r.id },
          { $set: { 'leaderboard.rank': i + 1, 'leaderboard.blogs': r.blogs, 'leaderboard.originality': r.originality, 'leaderboard.updatedAt': new Date() } }
        );
        // updateOne may report matchedCount/modifiedCount depending on driver version
        if (!updateRes || (typeof updateRes.matchedCount !== 'undefined' && updateRes.matchedCount === 0) || (typeof updateRes.nModified !== 'undefined' && updateRes.nModified === 0 && typeof updateRes.matchedCount !== 'undefined' && updateRes.matchedCount === 0)) {
          // no matching document found
          success = false;
          failures.push(r.id);
        }
      } catch (e) {
        success = false;
        failures.push(r.id);
        console.error('Error updating leaderboard for user', r.id, e && e.message ? e.message : e);
      }
    }
    if (!success) {
      console.error('persistLeaderboard: some updates failed for user ids:', failures);
    } else {
      console.log('persistLeaderboard: updated leaderboard for', results.length, 'users');
    }
    return success;
  } catch (err) {
    console.error('Failed to persist leaderboard (outer):', err);
    return false;
  }
}

// POST /api/leaderboard/update - recompute and persist leaderboard (requires auth)
const authMiddleware = require('../middleware/auth');
router.post('/leaderboard/update', authMiddleware, async (req, res) => {
  try {
    const results = await computeLeaderboard();
    if (db.isMongo()) {
      await persistLeaderboard(results);
    }
    // emit to sockets
    try {
      const io = require('../utils/io').getIo();
      if (io) io.emit('leaderboard', results);
    } catch (e) { /* ignore */ }
    res.json({ ok: true, results });
  } catch (err) {
    console.error('Leaderboard update failed:', err);
    res.status(500).json({ error: 'Failed to update leaderboard' });
  }
});

// attach helper so other modules (e.g. sockets) can call it
router.computeLeaderboard = computeLeaderboard;
router.persistLeaderboard = persistLeaderboard;

module.exports = router;
