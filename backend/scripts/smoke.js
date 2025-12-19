(async () => {
  try {
    const base = 'http://localhost:4000/api';
    const fetch = globalThis.fetch || (await import('node-fetch')).default;
    const login = async (email, password) => {
      const r = await fetch(base + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const j = await r.json();
      if (!r.ok) throw new Error('Login failed: ' + JSON.stringify(j));
      return j;
    };

    console.log('1) Login as Shraddha');
    const shr = await login('shraddha@example.com', 'seed');
    const shrToken = shr.token;
    console.log('  SHR_ID=', shr.user.id);

    console.log('2) Create a blog as Shraddha');
    let r = await fetch(base + '/blogs', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + shrToken }, body: JSON.stringify({ title: 'Smoke Test Blog', content: 'Smoke test content' }) });
    let blog = await r.json();
    console.log('  create blog response:', blog);
    const blogId = blog.id || blog._id || blog.id;

    console.log('3) Fetch leaderboard (after create)');
    r = await fetch(base + '/leaderboard');
    const lb = await r.json();
    console.log('  leaderboard top entries:', lb.slice(0,5));
    const shrEntry = lb.find(u => u.name && u.name.includes('Shraddha'));
    console.log('  Shraddha leaderboard entry:', shrEntry);

    console.log('4) Login as Aman and share the blog (to create a notification)');
    const aman = await login('aman@example.com', 'seed');
    const amanToken = aman.token;
    r = await fetch(base + `/blogs/${blogId}/share`, { method: 'POST', headers: { Authorization: 'Bearer ' + amanToken } });
    console.log('  share response status:', r.status, 'body:', await r.json());

    console.log('5) Fetch notifications as Shraddha');
    r = await fetch(base + '/notifications', { headers: { Authorization: 'Bearer ' + shrToken } });
    const notes = await r.json();
    console.log('  notifications:', notes);

    console.log('6) Create a challenge as Shraddha');
    r = await fetch(base + '/challenges', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + shrToken }, body: JSON.stringify({ title: 'Smoke Challenge', description: 'A challenge for smoke testing' }) });
    const ch = await r.json();
    console.log('  challenge created:', ch);

    console.log('7) Join challenge as Aman');
    r = await fetch(base + `/challenges/${ch.id || ch._id}/join`, { method: 'POST', headers: { Authorization: 'Bearer ' + amanToken } });
    const joinRes = await r.json();
    console.log('  join response:', joinRes);

    console.log('8) Verify user leaderboard fields in Mongo');
    const mongoose = require('mongoose');
    const config = require('../utils/config');
    await mongoose.connect(config.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    const User = require('../models/User');
    const shrUser = await User.findOne({ email: 'shraddha@example.com' }).lean();
    console.log('  Shraddha user document leaderboard:', shrUser.leaderboard || null);
    await mongoose.disconnect();

    console.log('\nSMOKE TEST SUMMARY OK');
  } catch (e) {
    console.error('SMOKE TEST FAILED:', e && e.message ? e.message : e);
    process.exit(1);
  }
})();
