const mongoose = require('mongoose');

const EntrySchema = new mongoose.Schema({
  name: { type: String, required: true },
  blogs: { type: Number, default: 0 },
  originality: { type: Number, default: 0 },
  rank: { type: Number, required: true }
}, { _id: false });

const LeaderboardSnapshotSchema = new mongoose.Schema({
  createdAt: { type: Date, default: Date.now },
  entries: { type: [EntrySchema], default: [] }
});

module.exports = mongoose.models.LeaderboardSnapshot || mongoose.model('LeaderboardSnapshot', LeaderboardSnapshotSchema);
