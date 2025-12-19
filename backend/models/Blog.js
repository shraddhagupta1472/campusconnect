const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  authorId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  essential: { type: Boolean, default: false },
  mood: { type: String, default: '' },
  draft: { type: Boolean, default: false },
  // flag for seeded/demo posts
  seeded: { type: Boolean, default: false }
});

module.exports = mongoose.models.Blog || mongoose.model('Blog', blogSchema);
