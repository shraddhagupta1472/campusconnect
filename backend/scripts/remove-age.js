#!/usr/bin/env node
const mongoose = require('mongoose');
const config = require('../utils/config');

(async function main() {
  if (!config.MONGODB_URI) {
    console.error('MONGODB_URI not set. Aborting.');
    process.exit(2);
  }
  try {
    await mongoose.connect(config.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to', config.MONGODB_URI);

    const User = require('../models/User');
    const LeaderboardSnapshot = require('../models/LeaderboardSnapshot');

    console.log('Removing age from User documents...');
    const userRes = await User.updateMany({ age: { $exists: true } }, { $unset: { age: "" } });
    console.log('User update result:', userRes);

    console.log('Removing age from LeaderboardSnapshot entries (if present)...');
    try {
      const snapRes = await LeaderboardSnapshot.updateMany({ 'entries.age': { $exists: true } }, { $unset: { 'entries.$[].age': "" } });
      console.log('LeaderboardSnapshot update result:', snapRes);
    } catch (e) {
      console.warn('LeaderboardSnapshot update failed (attempting per-document cleanup):', e && e.message ? e.message : e);
      // fallback: remove age fields from each snapshot entry by reading and rewriting docs
      try {
        const snaps = await LeaderboardSnapshot.find().lean();
        for (const s of snaps) {
          if (Array.isArray(s.entries) && s.entries.some(e => typeof e.age !== 'undefined')) {
            const updatedEntries = s.entries.map(({age, ...rest}) => rest);
            await LeaderboardSnapshot.updateOne({ _id: s._id }, { $set: { entries: updatedEntries } });
            console.log('Cleaned snapshot', s._id.toString());
          }
        }
      } catch (e2) {
        console.error('Fallback snapshot cleanup also failed:', e2 && e2.message ? e2.message : e2);
      }
    }

    await mongoose.disconnect();
    console.log('Done.');
    process.exit(0);
  } catch (err) {
    console.error('Script failed:', err && err.message ? err.message : err);
    try { await mongoose.disconnect(); } catch (e) {}
    process.exit(1);
  }
})();
