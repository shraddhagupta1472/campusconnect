const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const config = require('../utils/config');

const DATA_PATH = config.DATA_PATH;

const now = new Date().toISOString();

const users = [
  { id: uuidv4(), name: 'Shraddha Gupta', email: 'shraddha@example.com', passwordHash: bcrypt.hashSync('seed', 10), createdAt: now, seeded: true },
  { id: uuidv4(), name: 'Aman Verma', email: 'aman@example.com', passwordHash: bcrypt.hashSync('seed', 10), createdAt: now, seeded: true },
  { id: uuidv4(), name: 'Neha Singh', email: 'neha@example.com', passwordHash: bcrypt.hashSync('seed', 10), createdAt: now, seeded: true }
];

const blogs = [
  { id: uuidv4(), title: 'Ethical Writing 101', content: 'Good practices...', authorId: users[0].id, createdAt: now, seeded: true },
  { id: uuidv4(), title: 'Originality Matters', content: 'Why originality...', authorId: users[1].id, createdAt: now, seeded: true },
  { id: uuidv4(), title: 'How to Self-write', content: 'Tips...', authorId: users[0].id, createdAt: now, seeded: true }
];

const data = { users, blogs, challenges: [] };

const seedFileDB = () => {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
  console.log('Seeded file DB to', DATA_PATH);
};

async function seedMongo() {
  const mongoose = require('mongoose');
  const config = require('../utils/config');
  if (!config.MONGODB_URI) return false;

  // helper to attempt connect with optional override DB name
  async function tryConnect(uri) {
    try {
      await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
      return true;
    } catch (e) {
      return e;
    }
  }

  function altCaseUri(uri) {
    // attempt to toggle case of DB name portion (last path segment before ?)
    const q = uri.indexOf('?');
    const base = q === -1 ? uri : uri.slice(0, q);
    const rest = q === -1 ? '' : uri.slice(q);
    const lastSlash = base.lastIndexOf('/');
    if (lastSlash === -1) return uri;
    const dbName = base.slice(lastSlash + 1);
    if (!dbName) return uri;
    // simple toggle: if lowercase -> TitleCase; else -> lowercase
    const alt = dbName === dbName.toLowerCase() ? dbName.charAt(0).toUpperCase() + dbName.slice(1) : dbName.toLowerCase();
    return base.slice(0, lastSlash + 1) + alt + rest;
  }

  try {
    console.log('Seeding using MONGODB_URI:', config.MONGODB_URI);
    let connected = await tryConnect(config.MONGODB_URI);
    if (connected !== true) {
      // debug connect error
      const msg = (connected && connected.message) ? connected.message : String(connected);
      console.error('Mongo connect error (raw):', connected);
      // if message indicates a DB name case mismatch, extract the existing DB name and retry with it
      const caseMismatch = /db already exists with different case[\s\S]*?\[([^\]]+)\][\s\S]*?\[([^\]]+)\]/i;
      const m = msg.match(caseMismatch);
      if (m && m[1]) {
        const existing = m[1];
        // build a new URI by replacing the last segment (target DB name) with the existing name
        const q = config.MONGODB_URI.indexOf('?');
        const base = q === -1 ? config.MONGODB_URI : config.MONGODB_URI.slice(0, q);
        const rest = q === -1 ? '' : config.MONGODB_URI.slice(q);
        const lastSlash = base.lastIndexOf('/');
        if (lastSlash !== -1) {
          const newUri = base.slice(0, lastSlash + 1) + existing + rest;
          console.warn('Detected DB name case mismatch. Retrying seed with DB name:', existing);
          const retry = await tryConnect(newUri);
          if (retry === true) connected = true; else connected = retry;
        }
      }
    }

    if (connected !== true) {
      throw connected;
    }

    // require models (they return mongoose models)
    const User = require(path.join(__dirname, '..', 'models', 'User'));
    const Blog = require(path.join(__dirname, '..', 'models', 'Blog'));

    // upsert users (don't drop DB/collections to avoid case-related errors)
    const createdUsers = [];
    for (const u of users) {
      const filters = { email: u.email.toLowerCase() };
      const update = { name: u.name, passwordHash: u.passwordHash, createdAt: u.createdAt, seeded: true };
      const saved = await User.findOneAndUpdate(filters, update, { upsert: true, new: true, setDefaultsOnInsert: true });
      createdUsers.push(saved);
    }

    // upsert blogs (match by title + author email)
    for (const b of blogs) {
      const authorEmail = users.find(u => u.id === b.authorId).email.toLowerCase();
      const author = createdUsers.find(cu => cu.email === authorEmail);
      const filters = { title: b.title, authorId: author._id.toString() };
      const update = { content: b.content, authorId: author._id.toString(), createdAt: b.createdAt, seeded: true };
      await Blog.findOneAndUpdate(filters, update, { upsert: true, new: true, setDefaultsOnInsert: true });
    }

    console.log('Seeded MongoDB with sample users and blogs');
    // compute and persist initial leaderboard metrics
    try {
      const allUsers = await User.find().lean();
      const results = await Promise.all(allUsers.map(async (u) => {
        const idStr = u._id.toString();
        const blogsCount = await Blog.countDocuments({ authorId: idStr });
        const originality = Math.max(50, 100 - blogsCount * 2);
        return { id: idStr, name: u.name, blogs: blogsCount, originality };
      }));
      results.sort((a,b) => b.originality - a.originality || b.blogs - a.blogs);
      const ops = results.map((r,i) => ({ updateOne: { filter: { _id: new mongoose.Types.ObjectId(r.id) }, update: { $set: { 'leaderboard.rank': i+1, 'leaderboard.blogs': r.blogs, 'leaderboard.originality': r.originality, 'leaderboard.updatedAt': new Date() } }, upsert: false } }));
      if (ops.length) await User.bulkWrite(ops, { ordered: false });
      console.log('Persisted initial leaderboard metrics to users');
    } catch (e) {
      console.error('Failed to persist leaderboard on seed:', e.message || e);
    }
    await mongoose.disconnect();
    return true;
  } catch (err) {
    console.error('Failed to seed MongoDB:', (err && err.message) ? err.message : err);
    return false;
  }
}

// decide where to seed (MongoDB required in db-only mode)
(async function run() {
  if (!config.MONGODB_URI) {
    console.error('MONGODB_URI not set. Seeding requires MongoDB. Set MONGODB_URI to your DB (e.g., mongodb://localhost:27017/campusconnect) and re-run.');
    process.exit(1);
  }
  const ok = await seedMongo();
  if (!ok) {
    console.error('Seeding failed. Check MongoDB connection and try again.');
    process.exit(1);
  }
})();
