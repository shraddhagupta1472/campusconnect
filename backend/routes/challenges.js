const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');
const authMiddleware = require('../middleware/auth');

const mongoose = require('mongoose');
const router = express.Router();

router.get('/challenges', async (req, res) => {
  const { Challenge, User } = db.getModels();
  try {
    const challenges = await Challenge.find().sort({ createdAt: -1 }).lean();
    // build author map
    const authorIds = Array.from(new Set(challenges.map(c => String(c.authorId || '')).filter(Boolean)));
    let authors = [];
    if (authorIds.length) authors = await User.find({ _id: { $in: authorIds } }).lean();
    const authorMap = {};
    authors.forEach(a => { authorMap[a._id.toString()] = a.name || a.email || 'User'; });
    res.json(challenges.map(c => ({ id: c._id.toString(), title: c.title, description: c.description, authorId: c.authorId, authorName: authorMap[String(c.authorId)] || 'Unknown', participants: c.participants || [], createdAt: c.createdAt, difficulty: c.difficulty || null, tags: c.tags || [] })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/challenges', authMiddleware, async (req, res) => {
  const { title, description } = req.body || {};
  if (!title || !description) return res.status(400).json({ error: 'title and description required' });
  try {
    const { Challenge } = db.getModels();
    const challenge = await Challenge.create({ title, description, authorId: req.user.id, createdAt: new Date() });
    const out = { id: challenge._id.toString(), title: challenge.title, description: challenge.description, authorId: challenge.authorId, participants: challenge.participants || [], createdAt: challenge.createdAt };
    res.json(out);
    // emit creation for real-time clients
    try {
      const io = require('../utils/io').getIo();
      if (io) io.emit('challenge_created', out);
    } catch (e) { /* ignore */ }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Join a challenge
router.post('/challenges/:id/join', authMiddleware, async (req, res) => {
  const id = req.params.id;
  try {
    const { Challenge } = db.getModels();
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(404).json({ error: 'Challenge not found' });
    const challenge = await Challenge.findById(id);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });
    const userId = req.user.id;
    challenge.participants = challenge.participants || [];
    if (challenge.participants.includes(userId)) return res.json({ joined: false, message: 'Already joined' });
    challenge.participants.push(userId);
    await challenge.save();
    // emit join update
    try {
      const io = require('../utils/io').getIo();
      if (io) io.emit('challenge_joined', { id: challenge._id.toString(), participants: challenge.participants.length });
    } catch (e) { /* ignore */ }
    return res.json({ joined: true, participants: challenge.participants.length });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
