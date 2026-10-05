"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { identityForUser, type Identity } from "@/lib/identity";

// CodeMirror and the socket connection only make sense in the browser.
const CollabEditor = dynamic(() => import("@/components/CollabEditor"), {
  ssr: false,
  loading: () => <EditorPlaceholder />,
});

export default function RoomView({ room }: { room: string }) {
  const { user, token, apiUrl, loading, request } = useAuth();
  const [roomIdentity, setRoomIdentity] = useState<Identity | null>(null);
  const [copied, setCopied] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const getText = useRef<() => string>(() => "");

  const userIdentity = useMemo(() => (user ? identityForUser(user) : null), [user]);
  // Guests only learn their (unique) animal name once the server assigns it on join.
  const identity = userIdentity ?? roomIdentity;
  const onReady = useCallback((fn: () => string) => {
    getText.current = fn;
  }, []);

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function saveToNotes() {
    setSaveState("saving");
    try {
      await request("/api/notes", {
        method: "POST",
        body: JSON.stringify({
          title: `${room} - ${new Date().toLocaleString()}`,
          content: getText.current(),
          sourceRoom: room,
        }),
      });
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
    setTimeout(() => setSaveState("idle"), 2000);
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Room</p>
          <h1 className="truncate text-2xl font-semibold">{room}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {identity && (
            <span className="flex items-center gap-2 text-sm text-[var(--muted)]">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: identity.color }} />
              You are <strong className="text-[var(--foreground)]">{identity.name}</strong>
            </span>
          )}
          <button className="btn-secondary" onClick={copyLink}>
            {copied ? "Link copied" : "Copy link"}
          </button>
          {user ? (
            <button className="btn-primary" onClick={saveToNotes} disabled={saveState === "saving"}>
              {{ idle: "Save to my notes", saving: "Saving…", saved: "Saved", error: "Save failed" }[saveState]}
            </button>
          ) : (
            !loading && (
              <Link href={`/login?next=/${room}`} className="btn-primary">
                Log in to save notes
              </Link>
            )
          )}
        </div>
      </div>

      {loading ? (
        <EditorPlaceholder />
      ) : (
        <CollabEditor room={room} apiUrl={apiUrl} token={token} userIdentity={userIdentity}
          onIdentity={setRoomIdentity}
          onReady={onReady} />
      )}
    </div>
  );
}

function EditorPlaceholder() {
  return (
    <div className="flex min-h-[60vh] flex-1 items-center justify-center rounded-xl border border-[var(--border)] text-sm text-[var(--muted)]">
      Loading editor…
    </div>
  );
}
