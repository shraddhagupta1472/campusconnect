# CampusConnect Backend

This is a minimal Node.js + Express backend for the CampusConnect static frontend. In this version the project **requires a MongoDB database** — set `MONGODB_URI` (for example `mongodb://localhost:27017/campusconnect`). The file-based `data.json` fallback is deprecated and will not be used when the server runs.

Features
- Signup (`POST /api/signup`) — returns JWT token
- Login (`POST /api/login`) — returns JWT token
- Profile (`GET /api/profile`) — requires Authorization header
- Blogs (`GET /api/blogs`, `POST /api/blogs`) — `POST` requires auth
- Challenges (`GET /api/challenges`, `POST /api/challenges`) — `POST` requires auth

Quick start

1. Ensure MongoDB is available (local dev: use docker-compose from repo root):

```powershell
docker-compose up -d mongo
```

2. Open a terminal in `backend` and install dependencies:

```powershell
cd backend; npm install
```

3. (Optional) Migrate existing file DB contents into MongoDB:

```powershell
npm run migrate
```

4. Start server:

```powershell
npm start
```

By default the server listens on port `4000`. You can change it with `PORT` environment variable and change JWT secret with `JWT_SECRET`. Note: `MONGODB_URI` **must** be set for the server to start.

Real-time updates

- The backend exposes a Socket.IO server at the same origin (the client can connect to `/socket.io/socket.io.js` and then `io()` to receive events).
- The server emits `leaderboard` events with the updated leaderboard whenever blogs or user profiles change.

Seeding MongoDB

- To populate a small set of sample users and blogs for local testing you MUST set `MONGODB_URI` first (for example: `mongodb://localhost:27017/campusconnect`). Then run:

```powershell
npm run seed
```

- To remove seeded/demo data added by the seeder (emails ending with `@example.com` and items with `seeded: true`), run:

```powershell
npm run clean-seed
```


Example requests

- Signup:

  POST `/api/signup` { "name": "Alice", "email": "a@b.com", "password": "secret" }
- Login:

  POST `/api/login` { "email": "a@b.com", "password": "secret" }

Use the returned `token` as `Authorization: Bearer <token>` for protected endpoints.

Notes
- This is intentionally small and file-based for local development and prototyping.
- For production, use a proper database and stronger secret management.
