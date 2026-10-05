"use client";

import { useAuth } from "./AuthProvider";
import NotesPanel from "./NotesPanel";
import RoomEntry from "./RoomEntry";

/** Logged-in home: enter a room first, personal notes below. */
export default function Dashboard() {
  const { user } = useAuth();

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-6">
      <section className="rounded-xl border border-[var(--border)] p-5">
        <h1 className="text-xl font-semibold">Hi {user?.name}, which room are you joining?</h1>
        <p className="mb-4 mt-1 text-sm text-[var(--muted)]">
          Type a room name to enter it. If it doesn&apos;t exist yet, it&apos;s created for you.
        </p>
        <div className="max-w-xl">
          <RoomEntry variant="name-first" />
        </div>
      </section>

      <section id="notes" className="flex min-h-[70vh] flex-col">
        <NotesPanel />
      </section>
    </div>
  );
}
