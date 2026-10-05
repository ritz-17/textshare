import type { GuestAssignment } from "./YSocketProvider";

export interface Identity {
  name: string;
  color: string;
  colorLight: string;
  guest: boolean;
}

const COLORS = [
  "#e11d48", "#db2777", "#9333ea", "#4f46e5", "#2563eb", "#0891b2",
  "#059669", "#65a30d", "#ca8a04", "#ea580c", "#dc2626", "#7c3aed",
];

function hash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (Math.imul(31, h) + input.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function identityForUser(user: { id: string; name: string }): Identity {
  const color = COLORS[hash(user.id) % COLORS.length];
  return { name: user.name, color, colorLight: `${color}33`, guest: false };
}

/** Guest identities are assigned by the server so no two guests in a room share an animal. */
export function identityForGuest(guest: GuestAssignment): Identity {
  return { name: guest.name, color: guest.color, colorLight: `${guest.color}33`, guest: true };
}

const GUEST_KEY = "textshare:guest";

/** The animal this browser was given last time, requested again on the next join. */
export function loadPreferredGuest(): GuestAssignment | null {
  try {
    const saved = JSON.parse(localStorage.getItem(GUEST_KEY) ?? "null");
    return saved && typeof saved.name === "string" && typeof saved.color === "string" ? saved : null;
  } catch {
    return null;
  }
}

export function savePreferredGuest(guest: GuestAssignment) {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify({ name: guest.name, color: guest.color }));
  } catch {
    // storage unavailable (private mode) - the guest just gets a fresh animal next time
  }
}
