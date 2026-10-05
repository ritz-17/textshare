import http from 'node:http';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { Server } from 'socket.io';
import { config } from './config.js';
import { migrate, pool } from './db.js';
import { authRouter } from './auth.js';
import { notesRouter } from './notes.js';
import { flushAllRooms, registerRoomHandlers } from './rooms.js';

const app = express();
app.set('trust proxy', 1); // behind the AWS load balancer
app.use(helmet());
app.use(cors({ origin: config.corsOrigins }));
app.use(express.json({ limit: '1mb' }));

// Health check for the load balancer target group.
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use(
  '/api/auth',
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: 'draft-8', legacyHeaders: false }),
  authRouter,
);
app.use('/api/notes', notesRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: config.corsOrigins },
  maxHttpBufferSize: 2e6,
});
registerRoomHandlers(io);

async function main() {
  await migrate();
  server.listen(config.port, () => {
    console.log(`TextShare backend listening on :${config.port}`);
  });
}

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, saving rooms and shutting down`);
  io.close();
  await flushAllRooms();
  await pool.end();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

main().catch((err) => {
  console.error('Failed to start', err);
  process.exit(1);
});
