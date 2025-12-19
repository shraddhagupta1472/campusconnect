/*
 * Migration script: import data from backend/data.json into MongoDB.
 * Usage: set MONGODB_URI in env (or in .env) and run `node scripts/migrate-data-to-mongo.js`
 * The script is idempotent: it uses upserts to avoid duplicating records.
 */

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const config = require('../utils/config');

async function main() {
  const uri = process.env.MONGODB_URI || config.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set. Please set MONGODB_URI to your MongoDB connection string.');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });

  const User = require('../models/User');
  const Blog = require('../models/Blog');
  const Challenge = require('../models/Challenge');

  const dataPath = config.DATA_PATH || path.join(__dirname, '..', 'data.json');
  if (!fs.existsSync(dataPath)) {
    console.error('Data file not found at', dataPath);
    await mongoose.disconnect();
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const users = raw.users || [];
  const blogs = raw.blogs || [];
  const challenges = raw.challenges || [];

  let uCount = 0, bCount = 0, cCount = 0;

  try {
    // Users: upsert by email if available
    for (const u of users) {
      if (!u.email) {
        console.warn('Skipping user record with no email:', u);
        continue;
      }
      const email = (u.email || '').toLowerCase();
      const doc = {
        name: u.name || 'Unnamed',
        email,
        passwordHash: u.passwordHash || (u.password ? u.password : 'seed-placeholder'),
        bio: u.bio || '',
        bookmarks: u.bookmarks || [],
        bookmarksEnabled: typeof u.bookmarksEnabled === 'boolean' ? u.bookmarksEnabled : true,
        createdAt: u.createdAt ? new Date(u.createdAt) : new Date(),
        seeded: true
      };
      const res = await User.findOneAndUpdate({ email }, { $set: doc }, { upsert: true, new: true, setDefaultsOnInsert: true });
      uCount++;
    }

    // Blogs: upsert by title + createdAt (best-effort)
    for (const b of blogs) {
      const query = { title: b.title || '', createdAt: b.createdAt ? new Date(b.createdAt) : undefined };
      const doc = {
        title: b.title || 'Untitled',
        content: b.content || '',
        authorId: b.authorId || '',
        createdAt: b.createdAt ? new Date(b.createdAt) : new Date(),
        seeded: true
      };
      // remove undefined fields from query
      if (!query.createdAt) delete query.createdAt;
      const res = await Blog.findOneAndUpdate(query, { $set: doc }, { upsert: true, new: true, setDefaultsOnInsert: true });
      bCount++;
    }

    // Challenges
    for (const c of challenges) {
      const query = { title: c.title || '', createdAt: c.createdAt ? new Date(c.createdAt) : undefined };
      const doc = {
        title: c.title || 'Untitled',
        description: c.description || '',
        authorId: c.authorId || '',
        participants: c.participants || [],
        createdAt: c.createdAt ? new Date(c.createdAt) : new Date()
      };
      if (!query.createdAt) delete query.createdAt;
      const res = await Challenge.findOneAndUpdate(query, { $set: doc }, { upsert: true, new: true, setDefaultsOnInsert: true });
      cCount++;
    }

    console.log(`Migration complete. Users: ${uCount}, Blogs: ${bCount}, Challenges: ${cCount}`);

  } catch (e) {
    console.error('Migration error:', e && e.message ? e.message : e);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(err => { console.error('Failed to run migration:', err); process.exit(1); });
