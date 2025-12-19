(async function(){
  const mongoose = require('mongoose');
  const config = require('../utils/config');
  const uri = process.env.MONGODB_URI || config.MONGODB_URI;
  if (!uri) { console.error('no MONGODB_URI'); process.exit(1); }
  try {
    await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('connected successfully to', (mongoose.connection && mongoose.connection.name) ? mongoose.connection.name : uri);
    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.error('connect failed:');
    console.error(e);
    if (e && e.message) console.error('message:', e.message);
    if (e && e.stack) console.error('stack:', e.stack);
    process.exit(1);
  }
})();