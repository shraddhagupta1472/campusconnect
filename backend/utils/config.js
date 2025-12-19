require('dotenv').config();
const path = require('path');

module.exports = {
  PORT: process.env.PORT || 4000,
  JWT_SECRET: process.env.JWT_SECRET || 'dev_jwt_secret_change_me',
  MONGODB_URI: process.env.MONGODB_URI || '',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  HUGGINGFACE_API_KEY: process.env.HUGGINGFACE_API_KEY || '',
  // Default profile image used when user.profileImage is empty. Can be set via env var.
  DEFAULT_PROFILE_IMAGE: process.env.DEFAULT_PROFILE_IMAGE || 'https://i.ibb.co/5T0QzBk/profile-avatar.png',
  DATA_PATH: path.join(__dirname, '..', 'data.json')
};
