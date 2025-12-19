# CampusConnect AI Coding Instructions

## Architecture Overview

**CampusConnect** is a full-stack web app that is now MongoDB-first (Mongo required for runtime).

- **Backend** (`backend/`): Node.js + Express + Mongoose serving REST APIs
- **Frontend** (`frontend/`): Static HTML/CSS/JS (no build step) consuming backend APIs
- **Local Dev**: `docker-compose.yml` includes a `mongo` service for easy local setup; run `docker-compose up -d` then `npm start` in `backend/`.

### Key Design: Mongo-first routes

Routes use Mongoose models (in `backend/models/`) and assume MongoDB is present. Authentication attaches `req.user = { id }` (see `backend/middleware/auth.js`) and routes should look up full user documents as needed via `User.findById(req.user.id)`.

**Examples from the codebase:**
- Fetch current user in a route: `const user = await User.findById(req.user.id);` (see `backend/routes/auth.js` `GET /profile`).
- Validate IDs with `mongoose.Types.ObjectId.isValid(req.user.id)` before lookups (see `backend/routes/auth.js`).
- Create notifications with `Notification.create(...)` and bulk insert with `Notification.insertMany(...)` (see `backend/routes/blogs.js` when creating a blog).

## Authentication Flow

1. **Signup/Login** → JWT token + user data stored in localStorage (`cc_token`, `cc_user`)
2. **Protected Routes** → `authMiddleware` extracts `Bearer` token, verifies with `JWT_SECRET` (default: `'dev_jwt_secret_change_me'`)
3. **Token Payload**: `{ sub: userId, expiresIn: '7d' }` (routes should treat this as Mongo ObjectId strings)

## Startup & Configuration

**Quick start (local dev):**
```powershell
# from repo root
docker-compose up -d mongo
cd backend
npm install
# migrate existing file DB to Mongo (optional)
npm run migrate
npm start
```

**Important env vars** (`backend/utils/config.js`):
- `MONGODB_URI` **(required)** → e.g. `mongodb://localhost:27017/campusconnect`
- `PORT`, `JWT_SECRET`, `OPENAI_API_KEY`, etc.

**Migration helper:** `backend/scripts/migrate-data-to-mongo.js` is idempotent and uses upserts to import `backend/data.json` into MongoDB; run `npm run migrate`.

**Frontend API Discovery**: Uses `window.API_BASE` or defaults to `http://localhost:4000/api`.

## API Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/signup` | No | Register user, return JWT |
| POST | `/api/login` | No | Authenticate, return JWT |
| GET | `/api/profile` | Yes | Current user details |
| GET | `/api/blogs` | No | List all blogs (newest first) |
| POST | `/api/blogs` | Yes | Create blog (author = `req.user.id`) |
| GET | `/api/challenges` | No | List all challenges |
| POST | `/api/challenges` | Yes | Create challenge |
| GET | `/api/health` | No | Server health check |

## File Organization & Responsibilities

- **`backend/routes/`** → Endpoint handlers; each file manages one resource type
- **`backend/middleware/auth.js`** → JWT verification; sets `req.user`
- **`backend/models/`** → Mongoose schemas (User, Blog, Challenge); only loaded if `MONGODB_URI` set
- **`backend/utils/db.js`** → Storage abstraction; determines `isMongo()` state; handles fallback
- **`backend/utils/config.js`** → Env var reader; centralizes secret/port config
- **`frontend/js/`** → Vanilla JS event listeners; each file handles one page (login, signup, etc.)
- **`frontend/html/`** → Page templates; paired with matching JS file for interactivity

## Common Development Tasks

**Add a protected endpoint (Mongo-first):**
1. Add route in `backend/routes/newfeature.js` and import `authMiddleware` for protected endpoints.
2. Use Mongoose models from `db.getModels()` or require the model directly (e.g., `const { User } = db.getModels()` or `require('../models/User')`).
3. Validate `req.user.id` when needed (e.g., `mongoose.Types.ObjectId.isValid(req.user.id)`) and fetch documents with `Model.findById`.
4. Register route in `backend/server.js`: `app.use('/api', newFeatureRoutes)`.

**Modify user/blog/challenge schema:**
1. Update Mongoose model files in `backend/models/` and run migrations if you add required fields.
2. If you change data shape that needs migration from `backend/data.json`, update `backend/scripts/migrate-data-to-mongo.js` accordingly.

**Frontend fetch pattern** (see `signup.js`, `login.js`):
```javascript
const token = localStorage.getItem('cc_token');
const res = await fetch(`${API_BASE}/endpoint`, {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}` // for protected routes
  },
  body: JSON.stringify(payload)
});
```

## Testing & smoke checks

- Run a lightweight smoke test (requires `MONGODB_URI` and the server running):

```powershell
# from backend/
npm run smoke
```

- In CI prefer `mongodb-memory-server` or a test Mongo instance and run the same smoke script after bootstrapping the server.

## Critical Gotchas

- **Email case sensitivity**: Stored lowercase; always normalize on signup/login
- **MongoDB ID format**: `user._id.toString()` required (file DB used UUIDs historically — the file fallback is deprecated).
- **Data migration**: `backend/data.json` is deprecated; if you need to import its contents into Mongo, use `npm run migrate` which is idempotent.
- **Token expiry**: 7 days; no refresh token mechanism yet
- **CORS enabled** globally (`cors()` middleware); safe for dev, tighten for production
- **No input validation library**: Basic checks inline (required fields); sanitize if exposing user input
- **Static file serving**: Backend serves frontend at `/` (convenience; in production, use separate web server)

## Storage Data Structure

**Migration note:** `backend/data.json` is deprecated. Use `backend/scripts/migrate-data-to-mongo.js` (idempotent upserts) to import any existing file-DB records into MongoDB.

**MongoDB**: The application uses Mongoose models in `backend/models/` (User, Blog, Challenge, Notification). When reading/writing data prefer Mongoose queries (`find`, `findById`, `create`, `updateOne`) and return API shapes matching existing endpoints (see examples in `routes/`).
