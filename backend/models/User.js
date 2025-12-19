const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, index: true, unique: true },
  passwordHash: { type: String, required: true },
  bio: { type: String, default: '' },
  bookmarks: [{
    id: { type: String },
    title: { type: String },
    href: { type: String },
    createdAt: { type: Date, default: Date.now }
  }],
  bookmarksEnabled: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  // flag for seeded/demo data so we can safely remove it later
  seeded: { type: Boolean, default: false },
  // profile image (data URL or hosted URL)
  profileImage: { type: String, default: '' },
  // followers / following (store user ids)
  followers: [{ type: String }],
  following: [{ type: String }],
  // leaderboard metrics (updated by server when using Mongo)
  leaderboard: {
    rank: { type: Number, default: null, index: true },
    blogs: { type: Number, default: 0 },
    originality: { type: Number, default: 0 },
    updatedAt: { type: Date }
  }
});

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
