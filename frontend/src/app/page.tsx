"use client";

import { useAuth } from "@/components/AuthProvider";
import Dashboard from "@/components/Dashboard";
import RoomEntry from "@/components/RoomEntry";

export default function Home() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (user) return <Dashboard />;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16">
      <h1 className="text-4xl font-bold tracking-tight">Write together, live.</h1>
      <p className="mb-8 mt-3 text-[var(--muted)]">
        Create a room and share its link. The URL is the room: anyone who opens{" "}
        <code className="text-[var(--foreground)]">/your-room</code> edits the same text live and can see who is on
        which line. No account needed. Log in to save personal notes.
      </p>
      <RoomEntry variant="create-first" />
    </div>
  );
}
