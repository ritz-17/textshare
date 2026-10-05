import type { Server, Socket } from 'socket.io';
import * as Y from 'yjs';
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness';
import { verifyToken, type AuthUser } from './auth.js';
import { pool } from './db.js';
import { assignGuest, type GuestIdentity } from './guests.js';

/**
 * Realtime protocol (Socket.IO events, payloads are binary Yjs messages):
 *   client -> server  join(roomName, { preferredGuest }, ack)
 *                     ack: { state, awareness, guest } | { error }
 *                     (guest is the unique anonymous identity assigned to non-logged-in users)
 *   client <-> server update(Uint8Array)    Yjs document update
 *   client <-> server awareness(Uint8Array) Yjs awareness update (names, cursors, lines)
 *
 * Each room's Y.Doc lives in memory on this process and is persisted to Postgres.
 * NOTE: run a single backend task, or add sticky sessions + a shared pub/sub
 * before scaling horizontally, otherwise two tasks would hold diverging docs.
 */

// Room names are exactly the URL path, case-sensitive (like codeshare.io).
const ROOM_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const RESERVED = new Set(['login', 'register', 'notes', 'api', 'health', '_next']);
const SAVE_THROTTLE_MS = 2_000;
const UNLOAD_DELAY_MS = 30_000;
const MAX_UPDATE_BYTES = 1_000_000;

export function isValidRoomName(name: unknown): name is string {
  return typeof name === 'string' && ROOM_NAME_RE.test(name) && !RESERVED.has(name.toLowerCase());
}

interface Room {
  name: string;
  doc: Y.Doc;
  awareness: Awareness;
  /** Connected sockets, with the guest identity assigned to anonymous ones. */
  sockets: Map<string, GuestIdentity | null>;
  saveTimer?: NodeJS.Timeout;
  unloadTimer?: NodeJS.Timeout;
}

interface SocketData {
  user: AuthUser | null;
  room: string | null;
  /** Awareness client IDs announced through this socket, removed on leave. */
  awarenessIds: Set<number>;
}

type AppSocket = Socket<any, any, any, SocketData>;

const rooms = new Map<string, Promise<Room>>();
const pendingSaves = new Map<string, Promise<void>>();

const channel = (name: string) => `room:${name}`;

async function saveRoom(room: Room): Promise<void> {
  const state = Buffer.from(Y.encodeStateAsUpdate(room.doc));
  const content = room.doc.getText('content').toString();
  await pool.query(
    `INSERT INTO rooms (name, ydoc, content) VALUES ($1, $2, $3)
     ON CONFLICT (name) DO UPDATE
       SET ydoc = EXCLUDED.ydoc, content = EXCLUDED.content, updated_at = now()`,
    [room.name, state, content],
  );
}

function scheduleSave(room: Room) {
  if (room.saveTimer) return;
  room.saveTimer = setTimeout(() => {
    room.saveTimer = undefined;
    saveRoom(room).catch((err) => console.error(`Failed to save room ${room.name}`, err));
  }, SAVE_THROTTLE_MS);
}

async function loadRoom(io: Server, name: string): Promise<Room> {
  // If this room is being unloaded, wait for its final save so we don't read stale data.
  await pendingSaves.get(name);

  const doc = new Y.Doc();
  const { rows } = await pool.query<{ ydoc: Buffer }>('SELECT ydoc FROM rooms WHERE name = $1', [
    name,
  ]);
  if (rows[0]) Y.applyUpdate(doc, new Uint8Array(rows[0].ydoc));

  const awareness = new Awareness(doc);
  awareness.setLocalState(null); // the server itself is not a participant

  const room: Room = { name, doc, awareness, sockets: new Map() };

  doc.on('update', () => scheduleSave(room));

  // Relay every awareness change (including removals on disconnect / timeout)
  // to everyone in the room except the socket it came from.
  awareness.on(
    'update',
    (
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown,
    ) => {
      const changed = added.concat(updated, removed);
      const originSocket = origin as AppSocket | undefined;
      if (originSocket && typeof originSocket === 'object' && 'data' in originSocket) {
        for (const id of added.concat(updated)) originSocket.data.awarenessIds.add(id);
        for (const id of removed) originSocket.data.awarenessIds.delete(id);
        originSocket.to(channel(name)).emit('awareness', encodeAwarenessUpdate(awareness, changed));
      } else {
        io.to(channel(name)).emit('awareness', encodeAwarenessUpdate(awareness, changed));
      }
    },
  );

  return room;
}

function getRoom(io: Server, name: string): Promise<Room> {
  let room = rooms.get(name);
  if (!room) {
    room = loadRoom(io, name);
    rooms.set(name, room);
    room.catch(() => rooms.delete(name));
  }
  return room;
}

function unloadRoom(room: Room) {
  rooms.delete(room.name);
  clearTimeout(room.saveTimer);
  const save = saveRoom(room)
    .catch((err) => console.error(`Failed to save room ${room.name} on unload`, err))
    .finally(() => {
      pendingSaves.delete(room.name);
      room.awareness.destroy();
      room.doc.destroy();
    });
  pendingSaves.set(room.name, save);
}

async function leaveRoom(io: Server, socket: AppSocket) {
  const name = socket.data.room;
  if (!name) return;
  socket.data.room = null;
  socket.leave(channel(name));

  const room = await rooms.get(name);
  if (!room) return;
  if (socket.data.awarenessIds.size) {
    removeAwarenessStates(room.awareness, [...socket.data.awarenessIds], 'server');
  }
  socket.data.awarenessIds.clear();
  room.sockets.delete(socket.id);

  if (room.sockets.size === 0) {
    clearTimeout(room.unloadTimer);
    room.unloadTimer = setTimeout(() => {
      if (room.sockets.size === 0 && rooms.has(room.name)) unloadRoom(room);
    }, UNLOAD_DELAY_MS);
  }
}

function toUint8(data: unknown): Uint8Array | null {
  if (data instanceof Uint8Array) return data.byteLength <= MAX_UPDATE_BYTES ? data : null;
  if (data instanceof ArrayBuffer) return data.byteLength <= MAX_UPDATE_BYTES ? new Uint8Array(data) : null;
  return null;
}

export function registerRoomHandlers(io: Server) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    const data = socket.data as SocketData;
    data.user = typeof token === 'string' && token ? verifyToken(token) : null;
    data.room = null;
    data.awarenessIds = new Set();
    next();
  });

  io.on('connection', (rawSocket) => {
    const socket = rawSocket as AppSocket;

    socket.on('join', async (roomName: unknown, options: unknown, ack: unknown) => {
      if (typeof ack !== 'function') return;
      const preferredGuest = (options as { preferredGuest?: Partial<GuestIdentity> } | null)?.preferredGuest;
      if (!isValidRoomName(roomName)) {
        ack({ error: 'Invalid room name' });
        return;
      }
      try {
        if (socket.data.room) await leaveRoom(io, socket);
        const room = await getRoom(io, roomName);
        if (socket.disconnected) return;
        clearTimeout(room.unloadTimer);
        const taken = [...room.sockets.values()].filter((g): g is GuestIdentity => g !== null);
        const guest = socket.data.user ? null : assignGuest(taken, preferredGuest);
        room.sockets.set(socket.id, guest);
        socket.data.room = roomName;
        await socket.join(channel(roomName));

        const clients = [...room.awareness.getStates().keys()];
        ack({
          state: Y.encodeStateAsUpdate(room.doc),
          awareness: clients.length ? encodeAwarenessUpdate(room.awareness, clients) : null,
          guest,
        });
      } catch (err) {
        console.error(`Failed to join room ${roomName}`, err);
        ack({ error: 'Could not open room' });
      }
    });

    socket.on('update', async (data: unknown) => {
      const update = toUint8(data);
      const name = socket.data.room;
      if (!update || !name) return;
      const room = await rooms.get(name);
      if (!room) return;
      try {
        Y.applyUpdate(room.doc, update, socket);
        socket.to(channel(name)).emit('update', update);
      } catch (err) {
        console.warn(`Rejected malformed update in room ${name}`, err);
      }
    });

    socket.on('awareness', async (data: unknown) => {
      const update = toUint8(data);
      const name = socket.data.room;
      if (!update || !name) return;
      const room = await rooms.get(name);
      if (!room) return;
      try {
        applyAwarenessUpdate(room.awareness, update, socket);
      } catch (err) {
        console.warn(`Rejected malformed awareness update in room ${name}`, err);
      }
    });

    socket.on('leave', () => void leaveRoom(io, socket));
    socket.on('disconnect', () => void leaveRoom(io, socket));
  });
}

/** Persist every loaded room, used on graceful shutdown (ECS sends SIGTERM). */
export async function flushAllRooms(): Promise<void> {
  const loaded = await Promise.allSettled(rooms.values());
  await Promise.allSettled([
    ...loaded.flatMap((r) => (r.status === 'fulfilled' ? [saveRoom(r.value)] : [])),
    ...pendingSaves.values(),
  ]);
}
