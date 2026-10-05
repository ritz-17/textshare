"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { isValidRoomName, randomRoomName, toRoomSlug } from "@/lib/rooms";

const noopSubscribe = () => () => {};

/**
 * Join a room by typing its name, or create one with a random code.
 * "name-first" puts the name field on top (logged-in dashboard); "create-first"
 * leads with the big create button (landing page).
 */
export default function RoomEntry({ variant }: { variant: "name-first" | "create-first" }) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const slug = toRoomSlug(input);
  const valid = isValidRoomName(slug);
  const host = useSyncExternalStore(noopSubscribe, () => window.location.host, () => "");

  const open = (name: string) => router.push(`/${name}`);

  const form = (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) open(slug);
      }}
    >
      <label htmlFor="room" className={variant === "name-first" ? "block text-sm font-medium" : "sr-only"}>
        Room name
      </label>
      <div className="flex gap-2">
        <input
          id="room"
          className="input"
          placeholder="e.g. team-standup"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoFocus={variant === "name-first"}
        />
        <button
          type="submit"
          className={`${variant === "name-first" ? "btn-primary" : "btn-secondary"} shrink-0`}
          disabled={!valid}
        >
          Enter room
        </button>
      </div>
      <p className="text-sm text-[var(--muted)]">
        {input && !valid ? (
          "That name isn't available. Use letters, numbers, - or _."
        ) : (
          <>
            Room URL: <code className="text-[var(--foreground)]">{host}/{slug || "room-name"}</code>
          </>
        )}
      </p>
    </form>
  );

  if (variant === "name-first") {
    return (
      <div className="space-y-3">
        {form}
        <p className="text-sm text-[var(--muted)]">
          or{" "}
          <button className="font-medium text-[var(--accent)] hover:underline" onClick={() => open(randomRoomName())}>
            create a new room with a random code
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button className="btn-primary w-full py-3 text-base" onClick={() => open(randomRoomName())}>
        Create a new room
      </button>
      <div className="flex items-center gap-3 text-sm text-[var(--muted)]">
        <span className="h-px flex-1 bg-[var(--border)]" />
        or enter a room by name
        <span className="h-px flex-1 bg-[var(--border)]" />
      </div>
      {form}
    </div>
  );
}
