const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const config = require('../utils/config');
const db = require('../utils/db');
const authMiddleware = require('../middleware/auth');

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const config = require('../utils/config');
let multer = null; // optional: gracefully degrade if multer not installed
try { multer = require('multer'); } catch (e) { /* multer not installed; fallback to accepting data URLs */ }
const router = express.Router();

function computeProfileImageUrl(req, stored) {
  // stored may be a data URL, an absolute URL, or a path starting with '/'
  if (stored && String(stored).startsWith('/')) {
    const host = (req.protocol ? req.protocol + '://' : '') + req.get('host');
    return host + stored;
  }
  if (stored) return stored;
  // fallback to configured default
  return config.DEFAULT_PROFILE_IMAGE;
}

// prepare uploads directory path used by multer to store files
const uploadsDir = path.join(__dirname, '..', 'frontend', 'uploads');
// configure multer storage only if available
let uploadMiddleware = (req, res, next) => next();
if (multer) {
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
    const storage = multer.diskStorage({
      destination: function (req, file, cb) { cb(null, uploadsDir); },
      filename: function (req, file, cb) {
        const ext = (file.originalname && file.originalname.split('.').pop()) || 'img';
        const fn = `${req.user && req.user.id ? req.user.id : 'anon'}-${Date.now()}.${ext}`;
        cb(null, fn);
      }
    });
    const upload = multer({ storage });
    uploadMiddleware = upload.single('avatar');
  } catch (e) { console.warn('Could not initialize multer storage:', e && e.message ? e.message : e); }
} else {
  console.warn('multer not installed: image uploads will fall back to data URLs. Run `npm install multer` to enable file uploads');
}

// Signup
router.post('/signup', async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email and password required' });
  try {
    const { User } = db.getModels();
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(400).json({ error: 'Email already registered' });
    const passwordHash = bcrypt.hashSync(password, 10);
    const payload = { name, email: email.toLowerCase(), passwordHash };
    const user = await User.create(payload);
    const token = jwt.sign({ sub: user._id.toString() }, config.JWT_SECRET, { expiresIn: '7d' });
    res.json({ user: { id: user._id.toString(), name: user.name, email: user.email, createdAt: user.createdAt, profileImage: computeProfileImageUrl(req, user.profileImage) }, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const identifier = (email || '').trim();
  console.log('login attempt for identifier:', identifier);
  try {
    const { User } = db.getModels();
    // try email first, then try id (if user typed id instead of email)
    let user = await User.findOne({ email: identifier.toLowerCase() });
    if (!user && mongoose.Types.ObjectId.isValid(identifier)) {
      user = await User.findById(identifier);
      console.log('  mongo user lookup by id:', !!user, user ? user.email : null);
    } else {
      console.log('  mongo user found by email:', !!user, user ? user.email : null);
    }
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });
    const ok = bcrypt.compareSync(password, user.passwordHash);
    console.log('  password match:', ok);
    if (!ok) return res.status(400).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ sub: user._id.toString() }, config.JWT_SECRET, { expiresIn: '7d' });
    res.json({ user: { id: user._id.toString(), name: user.name, email: user.email, createdAt: user.createdAt }, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Profile
router.get('/profile', authMiddleware, async (req, res) => {
  const { User } = db.getModels();
  try {
    if (!mongoose.Types.ObjectId.isValid(req.user.id)) return res.status(404).json({ error: 'User not found' });
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    let unread = 0;
    try {
      const Notification = require('../models/Notification');
      unread = await Notification.countDocuments({ recipientId: user._id.toString(), read: false });
    } catch (e) { /* ignore */ }
    res.json({ user: { id: user._id.toString(), name: user.name, email: user.email, bio: user.bio || '', bookmarks: user.bookmarks || [], bookmarksEnabled: !!user.bookmarksEnabled, unreadNotifications: unread, profileImage: computeProfileImageUrl(req, user.profileImage), createdAt: user.createdAt, followers: user.followers || [], following: user.following || [] } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get bookmarks
router.get('/bookmarks', authMiddleware, async (req, res) => {
  const { User } = db.getModels();
  try {
    if (!mongoose.Types.ObjectId.isValid(req.user.id)) return res.status(404).json({ error: 'User not found' });
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ bookmarks: user.bookmarks || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete current user's avatar (removes server-hosted file if present and clears profileImage)
router.delete('/profile/avatar', authMiddleware, async (req, res) => {
  const { User } = db.getModels();
  try {
    if (!mongoose.Types.ObjectId.isValid(req.user.id)) return res.status(404).json({ error: 'User not found' });
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // if avatar is a server-hosted file under /uploads, remove it
    try {
      const cur = user.profileImage;
      if (cur && String(cur).startsWith('/uploads/')) {
        const filename = path.basename(cur);
        const filePath = path.join(__dirname, '..', 'frontend', 'uploads', filename);
        if (fs.existsSync(filePath)) {
          try { fs.unlinkSync(filePath); } catch (e) { console.warn('Could not delete avatar file', filePath, e && e.message ? e.message : e); }
        }
      }
    } catch (e) { /* ignore */ }

    // clear profileImage
    user.profileImage = '';
    await user.save();

    // return updated user with canonical profileImage
    const profileImgUrl = computeProfileImageUrl(req, user.profileImage);
    res.json({ user: { id: user._id.toString(), name: user.name, email: user.email, bio: user.bio || '', bookmarks: user.bookmarks || [], bookmarksEnabled: !!user.bookmarksEnabled, profileImage: profileImgUrl, createdAt: user.createdAt } });
  } catch (err) {
    console.error('Failed to delete avatar', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add bookmark
router.post('/bookmarks', authMiddleware, async (req, res) => {
  const { id, title, href, pinned } = req.body || {};
  if (!id || !title) return res.status(400).json({ error: 'id and title required' });
  const entry = { id, title, href: href || '#', pinned: !!pinned, createdAt: new Date().toISOString() };
  try {
    const { User } = db.getModels();
    if (!mongoose.Types.ObjectId.isValid(req.user.id)) return res.status(404).json({ error: 'User not found' });
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    // prevent duplicate ids
    const exists = (user.bookmarks || []).some(b => b.id === id);
    if (!exists) user.bookmarks.unshift(entry);
    await user.save();
    res.json({ bookmarks: user.bookmarks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update bookmark (e.g., pinned)
router.put('/bookmarks/:id', authMiddleware, async (req, res) => {
  const bmId = req.params.id;
  const { pinned } = req.body || {};
  if (!bmId) return res.status(400).json({ error: 'bookmark id required' });
  try {
    const { User } = db.getModels();
    if (!mongoose.Types.ObjectId.isValid(req.user.id)) return res.status(404).json({ error: 'User not found' });
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.bookmarks = (user.bookmarks || []).map(b => b.id === bmId ? Object.assign({}, b.toObject ? b.toObject() : b, { pinned: typeof pinned === 'boolean' ? pinned : b.pinned }) : b);
    await user.save();
    res.json({ bookmarks: user.bookmarks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Remove bookmark
router.delete('/bookmarks/:id', authMiddleware, async (req, res) => {
  const bmId = req.params.id;
  if (!bmId) return res.status(400).json({ error: 'bookmark id required' });
  try {
    const { User } = db.getModels();
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.bookmarks = (user.bookmarks || []).filter(b => b.id !== bmId);
    await user.save();
    res.json({ bookmarks: user.bookmarks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update profile (e.g., bio, name) — accepts multipart/form-data with `avatar` file when multer is enabled
router.put('/profile', authMiddleware, uploadMiddleware, async (req, res) => {
  // note: if multer handled an `avatar` file, it will be at req.file
  const { name, bio, profileImage } = req.body || {};
  try {
    const { User } = db.getModels();
    if (!mongoose.Types.ObjectId.isValid(req.user.id)) return res.status(404).json({ error: 'User not found' });

    // fetch current user so we can remove previous uploaded files if replaced
    const oldUser = await User.findById(req.user.id);
    if (!oldUser) return res.status(404).json({ error: 'User not found' });

    const update = {};
    if (typeof name === 'string') update.name = name;
    if (typeof bio === 'string') update.bio = bio;

    // if client sent multipart/form-data but multer isn't installed, return informative error
    const ct = (req.headers && req.headers['content-type']) ? req.headers['content-type'] : '';
    if (!multer && ct && ct.indexOf && ct.indexOf('multipart/form-data') !== -1) {
      return res.status(501).json({ error: 'Server not configured to accept file uploads. Install multer (npm install multer) to enable file uploads.' });
    }

    // if a file was uploaded with multer, prefer that and set profileImage to the served uploads path
    if (req.file && req.file.filename) {
      // serve path relative to site root
      update.profileImage = `/uploads/${req.file.filename}`;
    } else if (typeof profileImage === 'string' && profileImage.startsWith('data:')) {
      // fallback: if client sent a data URL, keep existing behavior (store data URL) — slower and large, but backward compatible
      update.profileImage = profileImage;
    } else if (typeof profileImage === 'string' && profileImage) {
      // could be a URL or path from client — store as-is
      update.profileImage = profileImage;
    }

    if (typeof req.body.bookmarksEnabled === 'boolean') update.bookmarksEnabled = req.body.bookmarksEnabled;
    if (typeof req.body.disableNotifications === 'boolean') update.notificationsEnabled = !req.body.disableNotifications;

    const user = await User.findByIdAndUpdate(req.user.id, update, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // If the previous profile image was a server-hosted file under /uploads and it's been replaced or cleared, remove the old file
    try {
      const prev = oldUser.profileImage;
      const curr = user.profileImage;
      if (prev && String(prev).startsWith('/uploads/') && String(prev) !== String(curr)) {
        const filename = path.basename(prev);
        const filePath = path.join(__dirname, '..', 'frontend', 'uploads', filename);
        if (fs.existsSync(filePath)) {
          try { fs.unlinkSync(filePath); } catch (e) { console.warn('Could not remove old avatar file', filePath, e && e.message ? e.message : e); }
        }
      }
    } catch (e) { /* ignore */ }

    // ensure we return profileImage as absolute URL for convenience
    let profileImgUrl = null;
    if (user.profileImage && String(user.profileImage).startsWith('/')) {
      const host = (req.protocol ? req.protocol + '://' : '') + req.get('host');
      profileImgUrl = host + user.profileImage;
    } else {
      profileImgUrl = user.profileImage || null;
    }

    res.json({ user: { id: user._id.toString(), name: user.name, email: user.email, bio: user.bio || '', bookmarks: user.bookmarks || [], bookmarksEnabled: !!user.bookmarksEnabled, profileImage: profileImgUrl, createdAt: user.createdAt } });

    try {
      const io = require('../utils/io').getIo();
      if (io && typeof require('./leaderboard').computeLeaderboard === 'function') {
        const data = await require('./leaderboard').computeLeaderboard();
        io.emit('leaderboard', data);
        try {
          if (typeof require('./leaderboard').persistLeaderboard === 'function') {
            await require('./leaderboard').persistLeaderboard(data);
          }
        } catch (e) { /* ignore */ }
      }
    } catch (e) { /* ignore */ }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
