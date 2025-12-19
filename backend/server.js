const express = require('express');
const path = require('path');
const cors = require('cors');
const http = require('http');
const { Server: IOServer } = require('socket.io');
const config = require('./utils/config');
const db = require('./utils/db');
const ioUtil = require('./utils/io');

const authRoutes = require('./routes/auth');
const blogsRoutes = require('./routes/blogs');
const challengesRoutes = require('./routes/challenges');
const notificationsRoutes = require('./routes/notifications');
const leaderboardRoutes = require('./routes/leaderboard');
const grammarRoutes = require('./routes/grammar');
const aiRoutes = require('./routes/ai');
const usersRoutes = require('./routes/users');

const app = express();
app.use(cors());
// Allow larger JSON payloads (images are sent as data URLs) — increase limit to 1mb
app.use(express.json({ limit: '1mb' }));

// API routes
app.use('/api', authRoutes);
app.use('/api', blogsRoutes);
app.use('/api', challengesRoutes);
app.use('/api', notificationsRoutes);
app.use('/api', leaderboardRoutes);
app.use('/api', grammarRoutes);
app.use('/api', aiRoutes);
app.use('/api', usersRoutes);

// Health
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Ensure uploads directory exists and serve uploaded files
const fs = require('fs');
const uploadsDir = path.join(__dirname, '..', 'frontend', 'uploads');
try { fs.mkdirSync(uploadsDir, { recursive: true }); } catch (e) { console.warn('Could not ensure uploads dir:', e && e.message ? e.message : e); }
app.use('/uploads', express.static(uploadsDir));

// Serve frontend static files (optional convenience)
app.use(express.static(path.join(__dirname, '..', 'frontend')));

async function start() {
  await db.init();
  // ensure we're running in Mongo-only mode
  if (!db.isMongo()) {
    console.error('MongoDB storage is required. Please set MONGODB_URI and restart the server.');
    process.exit(1);
  }
  const PORT = config.PORT || 4000;

  // create HTTP server and attach socket.io
  const server = http.createServer(app);
  const io = new IOServer(server, { cors: { origin: '*' } });
  ioUtil.setIo(io);

  io.on('connection', async (socket) => {
    console.log('socket connected:', socket.id);
    try {
      // send initial leaderboard
      if (leaderboardRoutes && typeof leaderboardRoutes.computeLeaderboard === 'function') {
        const data = await leaderboardRoutes.computeLeaderboard();
        socket.emit('leaderboard', data);
      }
    } catch (e) {
      console.error('error sending initial leaderboard:', e.message || e);
    }

    socket.on('disconnect', () => {
      console.log('socket disconnected:', socket.id);
    });
  });

  server.on('error', (err) => {
    console.error('Server error during listen:', err && err.message ? err.message : err);
    if (err && err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Please stop other node processes or change PORT in your environment (e.g., set PORT=<port>).`);
    }
    // exit so supervisor/runner can restart if desired
    process.exit(1);
  });

  server.listen(PORT, () => {
    console.log(`CampusConnect backend listening on port ${PORT}`);
    console.log('Using MongoDB storage');
  });

  // periodic leaderboard persistence to ensure data eventually lands in DB
  try {
    const lb = require('./routes/leaderboard');
    (async () => {
      try {
        const data = await lb.computeLeaderboard();
        if (db.isMongo() && typeof lb.persistLeaderboard === 'function') {
          const ok = await lb.persistLeaderboard(data);
          if (ok) console.log('Initial leaderboard persisted successfully'); else console.error('Initial leaderboard persistence failed');
        }
      } catch (e) { console.error('Initial leaderboard persistence error:', e && e.message ? e.message : e); }
    })();

    // schedule recurring persistence every 2 minutes
    setInterval(async () => {
      try {
        const data = await lb.computeLeaderboard();
        if (db.isMongo() && typeof lb.persistLeaderboard === 'function') {
          const ok = await lb.persistLeaderboard(data);
          if (ok) console.log('Recurring leaderboard persisted successfully'); else console.error('Recurring leaderboard persistence failed');
        }
      } catch (e) { console.error('Recurring leaderboard persistence error:', e && e.message ? e.message : e); }
    }, 2 * 60 * 1000);
  } catch (e) { /* ignore if leaderboard module not available */ }

  // global handlers to log unexpected errors (helps debugging intermittent crashes)
  process.on('unhandledRejection', (reason, p) => {
    console.error('Unhandled Rejection at Promise', p, 'reason:', reason);
  });
  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err && err.stack ? err.stack : err);
    // let it crash to avoid undefined state
    process.exit(1);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
