const express = require('express');
const db = require('../utils/db');
const mongoose = require('mongoose');
const config = require('../utils/config');
const router = express.Router();

function computeProfileImageUrl(req, stored) {
  if (stored && String(stored).startsWith('/')) {
    const host = (req.protocol ? req.protocol + '://' : '') + req.get('host');
    return host + stored;
  }
  if (stored) return stored;
  return config.DEFAULT_PROFILE_IMAGE;
}

// Public user profile
router.get('/users/:id', async (req, res) => {
  const id = req.params.id;
  const { User } = db.getModels();
  try {
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(404).json({ error: 'User not found' });
    const user = await User.findById(id).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    const followersCount = (user.followers || []).length;
    const followingCount = (user.following || []).length;
    return res.json({ user: { id: user._id.toString(), name: user.name, bio: user.bio || '', createdAt: user.createdAt, followersCount, followingCount, profileImage: computeProfileImageUrl(req, user.profileImage) } });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Server error' }); }
});

// Follow a user
const authMiddleware = require('../middleware/auth');
router.post('/users/:id/follow', authMiddleware, async (req, res) => {
  const id = req.params.id;
  const { User } = db.getModels();
  try {
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(404).json({ error: 'User not found' });
    if (String(req.user.id) === String(id)) return res.status(400).json({ error: 'Cannot follow yourself' });
    const me = await User.findById(req.user.id);
    const target = await User.findById(id);
    if (!me || !target) return res.status(404).json({ error: 'User not found' });
    // add to following/followers if not present
    if (!me.following) me.following = [];
    if (!target.followers) target.followers = [];
    const already = me.following.includes(String(id));
    if (!already) {
      me.following.push(String(id));
      target.followers.push(String(me._id));
      await me.save();
      await target.save();
      // create a notification for the followed user
      try {
        const Notification = require('../models/Notification');
        const note = await Notification.create({ recipientId: String(target._id), senderId: String(me._id), message: `${me.name} started following you`, url: `/profile.html?id=${me._id}` });
        // emit via socket.io if available
        try {
          const io = require('../utils/io').getIo();
          if (io) io.emit('notification', { recipientId: String(target._id), notification: note });
        } catch (e) { /* ignore socket errors */ }
      } catch (e) { console.error('Could not create notification', e); }
    }
    return res.json({ followed: true, followersCount: target.followers.length, followingCount: me.following.length });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Server error' }); }
});

// Unfollow a user
router.post('/users/:id/unfollow', authMiddleware, async (req, res) => {
  const id = req.params.id;
  const { User } = db.getModels();
  try {
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(404).json({ error: 'User not found' });
    if (String(req.user.id) === String(id)) return res.status(400).json({ error: 'Cannot unfollow yourself' });
    const me = await User.findById(req.user.id);
    const target = await User.findById(id);
    if (!me || !target) return res.status(404).json({ error: 'User not found' });
    me.following = (me.following || []).filter(x => String(x) !== String(id));
    target.followers = (target.followers || []).filter(x => String(x) !== String(me._id));
    await me.save();
    await target.save();
    return res.json({ followed: false, followersCount: target.followers.length, followingCount: me.following.length });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Server error' }); }
});

// List followers for a user
router.get('/users/:id/followers', async (req, res) => {
  const id = req.params.id;
  const { User } = db.getModels();
  try {
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(404).json({ error: 'User not found' });
    const user = await User.findById(id).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    const ids = (user.followers || []).slice(0, 500);
    const list = await User.find({ _id: { $in: ids } }).select('name profileImage createdAt').lean();
    const mapped = list.map(u => ({ id: u._id.toString(), name: u.name, profileImage: computeProfileImageUrl(req, u.profileImage) }));
    return res.json({ followers: mapped });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Server error' }); }
});

// List following for a user
router.get('/users/:id/following', async (req, res) => {
  const id = req.params.id;
  const { User } = db.getModels();
  try {
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(404).json({ error: 'User not found' });
    const user = await User.findById(id).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    const ids = (user.following || []).slice(0, 500);
    const list = await User.find({ _id: { $in: ids } }).select('name profileImage createdAt').lean();
    const mapped = list.map(u => ({ id: u._id.toString(), name: u.name, profileImage: computeProfileImageUrl(req, u.profileImage) }));
    return res.json({ following: mapped });
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Server error' }); }
});

// Public users list (optional search q and limit)
router.get('/users', async (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20')));
  const { User } = db.getModels();
  try {
    const filter = q ? { $or: [ { name: { $regex: q, $options: 'i' } }, { email: { $regex: q, $options: 'i' } } ] } : {};
    const users = await User.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    return res.json(users.map(u => ({ id: u._id.toString(), name: u.name, createdAt: u.createdAt })));
  } catch (e) { console.error(e); return res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
