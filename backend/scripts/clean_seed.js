const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const config = require('../utils/config');

const DATA_PATH = config.DATA_PATH;

async function cleanMongo() {
  if (!config.MONGODB_URI) {
    console.log('No MONGODB_URI, skipping Mongo clean');
    return;
  }
  try {
    await mongoose.connect(config.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    const User = require(path.join(__dirname, '..', 'models', 'User'));
    const Blog = require(path.join(__dirname, '..', 'models', 'Blog'));

    const usersToRemove = await User.find({ $or: [ { seeded: true }, { email: /@example\.com$/i } ] }).lean();
    if (!usersToRemove.length) {
      console.log('No seeded users found in MongoDB');
    } else {
      const ids = usersToRemove.map(u => u._id.toString());
      const delBlogs = await Blog.deleteMany({ $or: [ { seeded: true }, { authorId: { $in: ids } } ] });
      const delUsers = await User.deleteMany({ _id: { $in: ids } });
      console.log(`Removed ${delUsers.deletedCount} users and ${delBlogs.deletedCount} blogs from MongoDB`);
    }

    await mongoose.disconnect();
  } catch (e) {
    console.error('Error cleaning MongoDB seeded data:', e.message || e);
  }
}

function cleanFileDB() {
  try {
    if (!fs.existsSync(DATA_PATH)) {
      console.log('File DB not found, skipping');
      return;
    }
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const usersBefore = parsed.users ? parsed.users.length : 0;
    const blogsBefore = parsed.blogs ? parsed.blogs.length : 0;

    parsed.users = (parsed.users || []).filter(u => !(u.seeded === true || (u.email && /@example\.com$/i.test(u.email))));
    parsed.blogs = (parsed.blogs || []).filter(b => !(b.seeded === true));

    fs.writeFileSync(DATA_PATH, JSON.stringify(parsed, null, 2));
    console.log(`File DB cleaned. Users: ${usersBefore} -> ${parsed.users.length}. Blogs: ${blogsBefore} -> ${parsed.blogs.length}`);
  } catch (e) {
    console.error('Error cleaning file DB seeded data:', e.message || e);
  }
}

(async function run() {
  await cleanMongo();
  cleanFileDB();
})();