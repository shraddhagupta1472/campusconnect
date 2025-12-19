const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const config = require('./config');

let useMongo = false;
let Models = { User: null, Blog: null, Challenge: null };

const DB_PATH = config.DATA_PATH;

let warnedDeprecated = false;
function loadFileDB() {
  if (!warnedDeprecated) { console.warn('DEPRECATED: loadFileDB called — file-based DB is deprecated and will be removed. Prefer MongoDB.'); warnedDeprecated = true; }
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    const init = { users: [], blogs: [], challenges: [] };
    fs.writeFileSync(DB_PATH, JSON.stringify(init, null, 2));
    return init;
  }
}

function saveFileDB(db) {
  if (!warnedDeprecated) { console.warn('DEPRECATED: saveFileDB called — file-based DB is deprecated and will be removed. Prefer MongoDB.'); warnedDeprecated = true; }
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

async function init() {
  const uri = config.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set. This project requires MongoDB. Set MONGODB_URI to mongodb://localhost:27017/campusconnect');
    throw new Error('MONGODB_URI not set');
  }
  try {
    await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
    // load models
    Models.User = require(path.join(__dirname, '..', 'models', 'User'));
    Models.Blog = require(path.join(__dirname, '..', 'models', 'Blog'));
    Models.Challenge = require(path.join(__dirname, '..', 'models', 'Challenge'));
    useMongo = true;
    console.log('db: connected to MongoDB');
  } catch (err) {
    console.error('db: failed to connect to MongoDB -', err.message);
    // rethrow so startup fails fast and operator is notified
    throw err;
  }
}

module.exports = {
  init,
  isMongo: () => useMongo,
  getModels: () => Models,
  loadFileDB,
  saveFileDB
};
