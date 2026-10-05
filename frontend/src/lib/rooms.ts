// Keep in sync with backend/src/rooms.ts
// Room names are exactly the URL path, case-sensitive (like codeshare.io).
const ROOM_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const RESERVED = new Set(["login", "register", "notes", "api", "health", "_next"]);

export function isValidRoomName(name: string): boolean {
  return ROOM_NAME_RE.test(name) && !RESERVED.has(name.toLowerCase());
}

/** Turn free-form input like "Team Standup!" into a URL-safe room name ("Team-Standup"). */
export function toRoomSlug(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9_-]/g, "")
    .replace(/^[-_]+/, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 64);
}

const CODE_CHARS = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A short random room code such as "aB3x9Q". */
export function randomRoomName(length = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
}
