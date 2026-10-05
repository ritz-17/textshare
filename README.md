# TextShare

Real-time shared text rooms. Open `/<room-name>` and everyone in that room edits the same text. Each user's cursor is labelled with their name, and every user is listed with the line they are on. Users can stay anonymous (e.g. "Anonymous Otter") or log in with email to show their name and save personal notes.

```
textshare/
├── backend/    Node.js + Express + Socket.IO + Yjs + PostgreSQL
├── frontend/   Next.js (App Router) + CodeMirror 6 + Yjs
└── docker-compose.yml   local Postgres for development only
```

## How it works

| Piece | Details |
| --- | --- |
| Rooms | The URL path is the room name (`/team-standup`). Names are lowercase `a-z 0-9 - _`, max 64 chars. Visiting a room creates it. |
| Shared editing | Text is a [Yjs](https://yjs.dev) CRDT, so concurrent edits merge without conflicts. Updates are relayed over Socket.IO (WebSocket). |
| Presence | Yjs awareness carries each user's name, colour and current line. These show as inline cursor labels, gutter badges with line highlights, and the "In this room" list. |
| Persistence | Each room's document is saved to Postgres (`rooms` table) at most every 2 s while edited, and when the server receives SIGTERM. |
| Auth | Email + password (bcrypt), JWT bearer tokens stored in the browser. Guests can edit rooms without an account. |
| Guests | The server gives each guest an animal name and colour that nobody else in the room is using ("Anonymous Otter"). A browser gets the same animal back when it rejoins, if it's still free. |
| Notes | Logged-in users have private notes (`/notes`) with autosave, plus a "Save to my notes" button in every room. |

Tables (`users`, `rooms`, `notes`) are created automatically on backend start-up.

## Run locally

Requirements: Node 20+, and a Postgres 13+ database (`docker compose up -d` starts one).

```bash
# 1. Backend  (http://localhost:4000)
cd backend
cp .env.example .env        # adjust DATABASE_URL / JWT_SECRET if needed
npm install
npm run dev

# 2. Frontend (http://localhost:3000)
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Open two browser windows on the same room (e.g. one normal, one private) to see live collaboration.

## Configuration

### Backend (`backend/.env`)

| Variable | Description |
| --- | --- |
| `PORT` | HTTP + WebSocket port (default `4000`) |
| `DATABASE_URL` | Postgres connection string, e.g. `postgres://user:pass@your-rds-host:5432/textshare` |
| `DATABASE_SSL` | `true` to connect over TLS (needed for RDS) |
| `JWT_SECRET` | Long random secret used to sign login tokens. **Required** |
| `JWT_EXPIRES_IN` | Token lifetime (default `7d`) |
| `CORS_ORIGIN` | Comma-separated allowed frontend origins, e.g. `https://textshare.example.com` |

### Frontend (`frontend/.env.local`)

| Variable | Description |
| --- | --- |
| `API_URL` | Public URL of the backend as reached **from the browser**, e.g. `https://api.textshare.example.com` |

`API_URL` is read when each request is served, not at build time, so one image works in every environment.

### Production commands

```bash
# backend
npm ci && npm run build && npm start      # node dist/index.js
# frontend
npm ci && npm run build && npm start      # or run .next/standalone/server.js (see below)
```

The frontend uses `output: "standalone"`. To run the standalone server, copy `public/` and `.next/static/` into `.next/standalone/` and run `node server.js`, with `PORT` and `HOSTNAME=0.0.0.0` set.

## Deployment notes (ECS + RDS)

- **Health check:** backend `GET /health` returns `{"ok":true}`; frontend `GET /` returns 200.
- **WebSockets:** the browser connects to the backend with WebSocket-only Socket.IO. The load balancer in front of the backend must allow WebSocket upgrades (ALB does by default). Use an idle timeout of 60 s or more.
- **Scaling the backend:** each room's live document is held in the memory of one backend process. Run **one backend task**, or add sticky routing by room plus a shared pub/sub (e.g. the Socket.IO Redis adapter with Yjs update fan-out) before running several. Otherwise users in the same room on different tasks won't see each other. The frontend can scale freely.
- **Graceful shutdown:** on SIGTERM the backend saves all open rooms before exiting. Keep the ECS stop timeout at its default (30 s) or higher.
- **RDS:** set `DATABASE_SSL=true`. The database user needs permission to create tables on first start.
- **Secrets:** provide `JWT_SECRET` and `DATABASE_URL` from Secrets Manager / SSM rather than plain env vars.
