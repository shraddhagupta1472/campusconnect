const express = require('express');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const config = require('../utils/config');
const mongoose = require('mongoose');
const db = require('../utils/db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// send notification helper (Mongo-only)
async function sendNotification(recipientId, senderId, message, url) {
  const Notification = require('../models/Notification');
  try {
    await Notification.create({ recipientId, senderId, message, url });
  } catch (e) { console.error('notify err', e); }
} 

router.get('/blogs', async (req, res) => {
  const authorId = req.query.authorId;
  const { Blog } = db.getModels();
  try {
    const query = { draft: { $ne: true } };
    if (authorId) query.authorId = authorId;
    const blogs = await Blog.find(query).sort({ createdAt: -1 }).lean();
    // resolve author names where possible
    let authorMap = {};
    try {
      const { User } = db.getModels();
      const ids = Array.from(new Set(blogs.map(b => b.authorId).filter(Boolean)));
      if (ids.length) {
        const users = await User.find({ _id: { $in: ids } }).lean();
        users.forEach(u => { authorMap[u._id.toString()] = u.name; });
      }
    } catch (e) { /* ignore */ }
    res.json(blogs.map(b => ({ id: b._id.toString(), title: b.title, content: b.content, authorId: b.authorId, authorName: authorMap[b.authorId] || undefined, createdAt: b.createdAt, essential: !!b.essential, mood: b.mood || '', shareUrl: `/blog.html#${b._id.toString()}` })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});
// Create a new blog (Mongo-only)
router.post('/blogs', authMiddleware, async (req, res) => {
  const { title, content } = req.body || {};
  if (!title || !content) return res.status(400).json({ error: 'title and content required' });
  try {
    const { Blog, User } = db.getModels();
    const blog = await Blog.create({ title, content, authorId: req.user.id, createdAt: new Date(), essential: !!req.body.essential, mood: (req.body.mood || '').toString(), draft: !!req.body.draft });
    // notify other users
    try {
      const users = await User.find({ _id: { $ne: req.user.id } }, { _id: 1 }).lean();
      if (users && users.length) {
        const Notification = require('../models/Notification');
        const now = new Date();
        const notifs = users.map(u => ({ recipientId: u._id.toString(), senderId: req.user.id, message: `${req.user.id} published a new blog: ${title}`, url: `/blog.html#${blog._id.toString()}`, read: false, createdAt: now }));
        await Notification.insertMany(notifs);
      }
    } catch (e) { /* ignore */ }
    res.json({ id: blog._id.toString(), title: blog.title, content: blog.content, authorId: blog.authorId, createdAt: blog.createdAt, essential: !!blog.essential, mood: blog.mood || '' });
    // emit leaderboard update and new_blog
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
      try {
        const io2 = require('../utils/io').getIo();
        if (io2) {
          const authorName = (await require('../models/User').findById(req.user.id).lean()).name || undefined;
          io2.emit('new_blog', { id: blog._id.toString(), title: blog.title, content: blog.content, authorId: blog.authorId, authorName, createdAt: blog.createdAt, shareUrl: `/blog.html#${blog._id.toString()}` });
        }
      } catch (e) { /* ignore */ }
    } catch (e) { /* ignore */ }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single blog
router.get('/blogs/:id', async (req, res) => {
  const id = req.params.id;
  const { Blog } = db.getModels();
  try {
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(404).json({ error: 'Not found' });
    const b = await Blog.findById(id).lean();
    if (!b) return res.status(404).json({ error: 'Not found' });
    // try to fetch author name
    let authorName = undefined;
    try { const { User } = db.getModels(); const u = await User.findById(b.authorId).lean(); if (u) authorName = u.name; } catch (e) { /* ignore */ }
    res.json({ id: b._id.toString(), title: b.title, content: b.content, authorId: b.authorId, authorName, createdAt: b.createdAt, essential: !!b.essential, mood: b.mood || '', shareUrl: `/blog.html#${b._id.toString()}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get blogs for current user
router.get('/myblogs', authMiddleware, async (req, res) => {
  const { Blog } = db.getModels();
  try {
    const blogs = await Blog.find({ authorId: req.user.id }).sort({ createdAt: -1 }).lean();
    return res.json(blogs.map(b => ({ id: b._id.toString(), title: b.title, content: b.content, authorId: b.authorId, authorName: undefined, createdAt: b.createdAt, essential: !!b.essential, mood: b.mood || '', shareUrl: `/blog.html#${b._id.toString()}` })));
  } catch (err) { console.error(err); return res.status(500).json({ error: 'Server error' }); }
});

// Share blog (notify author)
router.post('/blogs/:id/share', authMiddleware, async (req, res) => {
  const id = req.params.id;
  try {
    let authorId = null;
    let title = 'a blog';
    const { Blog } = db.getModels();
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(404).json({ error: 'Not found' });
    const b = await Blog.findById(id).lean();
    if (!b) return res.status(404).json({ error: 'Not found' });
    authorId = b.authorId;
    title = b.title;

    // don't notify if sharer is the author
    if (authorId === req.user.id) return res.json({ ok: true });

    const url = `/blog.html#${id}`;
    const senderId = req.user.id;
    const message = `${senderId} shared your blog: ${title}`;
    const Notification = require('../models/Notification');
    await Notification.create({ recipientId: authorId, senderId, message, url });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update blog (author only)
router.put('/blogs/:id', authMiddleware, async (req, res) => {
  const id = req.params.id;
  const { title, content } = req.body || {};
  if (!title || !content) return res.status(400).json({ error: 'title and content required' });
  try {
    const { Blog } = db.getModels();
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(404).json({ error: 'Not found' });
    const blog = await Blog.findById(id);
    if (!blog) return res.status(404).json({ error: 'Not found' });
    if (String(blog.authorId) !== String(req.user.id)) {
      console.warn('Unauthorized edit attempt', { blogId: id, blogAuthor: blog.authorId, userId: req.user.id });
      return res.status(403).json({ error: 'Not allowed' });
    }
    blog.title = title;
    blog.content = content;
    if (typeof req.body.essential === 'boolean') blog.essential = req.body.essential;
    if (typeof req.body.mood === 'string') blog.mood = req.body.mood;
    await blog.save();
    res.json({ id: blog._id.toString(), title: blog.title, content: blog.content, authorId: blog.authorId, createdAt: blog.createdAt, essential: !!blog.essential, mood: blog.mood || '' });
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
      // emit new_blog for updates
      try {
        const io2 = require('../utils/io').getIo();
        if (io2) {
          const authorName = (await require('../models/User').findById(req.user.id).lean()).name || undefined;
          io2.emit('new_blog', { id: blog._id.toString(), title: blog.title, content: blog.content, authorId: blog.authorId, authorName, createdAt: blog.createdAt, shareUrl: `/blog.html#${blog._id.toString()}` });
        }
      } catch (e) { /* ignore */ }
    } catch (e) { /* ignore */ }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
