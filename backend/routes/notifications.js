const express = require('express');
const db = require('../utils/db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// List notifications for current user
router.get('/notifications', authMiddleware, async (req, res) => {
  const Notification = require('../models/Notification');
  try {
    const list = await Notification.find({ recipientId: req.user.id }).sort({ createdAt: -1 }).lean();
    res.json({ notifications: list });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Dismiss a notification
router.delete('/notifications/:id', authMiddleware, async (req, res) => {
  const id = req.params.id;
  if (!id) return res.status(400).json({ error: 'id required' });
  const Notification = require('../models/Notification');
  try {
    await Notification.deleteOne({ _id: id, recipientId: req.user.id });
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
