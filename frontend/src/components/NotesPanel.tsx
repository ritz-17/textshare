"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

interface Note {
  id: string;
  title: string;
  content: string;
  sourceRoom: string | null;
  createdAt: string;
  updatedAt: string;
}

type SaveStatus = "saved" | "unsaved" | "saving" | "error";
const AUTOSAVE_MS = 800;

/** Personal notes list + editor. Render only for a logged-in user. */
export default function NotesPanel() {
  const { user, request } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [listError, setListError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ title: string; content: string }>({ title: "", content: "" });
  const [status, setStatus] = useState<SaveStatus>("saved");
  const pending = useRef<{ id: string; title: string; content: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!user) return;
    request<{ notes: Note[] }>("/api/notes")
      .then(({ notes }) => {
        setNotes(notes);
        if (notes[0]) select(notes[0]);
      })
      .catch((err) => setListError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, request]);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const change = pending.current;
    if (!change) return;
    pending.current = null;
    setStatus("saving");
    try {
      const { note } = await request<{ note: Note }>(`/api/notes/${change.id}`, {
        method: "PUT",
        body: JSON.stringify({ title: change.title, content: change.content }),
      });
      setNotes((list) => [note, ...list.filter((n) => n.id !== note.id)]);
      setStatus(pending.current ? "unsaved" : "saved");
    } catch {
      setStatus("error");
    }
  }, [request]);

  // Save any unsaved edits when leaving the page.
  useEffect(() => () => void flush(), [flush]);

  function select(note: Note) {
    void flush();
    setSelectedId(note.id);
    setDraft({ title: note.title, content: note.content });
    setStatus("saved");
  }

  function edit(change: Partial<{ title: string; content: string }>) {
    if (!selectedId) return;
    const next = { ...draft, ...change };
    setDraft(next);
    setStatus("unsaved");
    pending.current = { id: selectedId, ...next };
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
  }

  async function createNote() {
    await flush();
    const { note } = await request<{ note: Note }>("/api/notes", {
      method: "POST",
      body: JSON.stringify({ title: "Untitled" }),
    });
    setNotes((list) => [note, ...list]);
    select(note);
  }

  async function deleteNote() {
    if (!selectedId || !confirm("Delete this note? This can't be undone.")) return;
    clearTimeout(timer.current);
    pending.current = null;
    await request(`/api/notes/${selectedId}`, { method: "DELETE" });
    const rest = notes.filter((n) => n.id !== selectedId);
    setNotes(rest);
    if (rest[0]) select(rest[0]);
    else {
      setSelectedId(null);
      setDraft({ title: "", content: "" });
    }
  }

  const selected = notes.find((n) => n.id === selectedId);

  return (
    <div className="flex flex-1 flex-col gap-4 md:flex-row">
      <aside className="flex w-full shrink-0 flex-col gap-3 md:w-72">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">My notes</h2>
          <button className="btn-primary" onClick={createNote}>
            New note
          </button>
        </div>
        {listError && <p className="text-sm text-red-500">{listError}</p>}
        <ul className="flex max-h-[30vh] flex-col gap-1 overflow-auto md:max-h-none">
          {notes.map((note) => (
            <li key={note.id}>
              <button
                onClick={() => select(note)}
                className={`w-full rounded-lg px-3 py-2 text-left transition ${
                  note.id === selectedId ? "bg-[var(--surface)] ring-1 ring-[var(--border)]" : "hover:bg-[var(--surface)]"
                }`}
              >
                <span className="block truncate text-sm font-medium">{note.title || "Untitled"}</span>
                <span className="block truncate text-xs text-[var(--muted)]">
                  {new Date(note.updatedAt).toLocaleString()}
                  {note.sourceRoom && ` · from /${note.sourceRoom}`}
                </span>
              </button>
            </li>
          ))}
          {notes.length === 0 && !listError && (
            <li className="rounded-lg border border-dashed border-[var(--border)] p-4 text-sm text-[var(--muted)]">
              No notes yet. Create one, or use &ldquo;Save to my notes&rdquo; inside a room.
            </li>
          )}
        </ul>
      </aside>

      <section className="flex min-h-[60vh] flex-1 flex-col overflow-hidden rounded-xl border border-[var(--border)]">
        {selected ? (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2">
              <input
                className="min-w-0 flex-1 bg-transparent text-lg font-semibold outline-none"
                value={draft.title}
                onChange={(e) => edit({ title: e.target.value })}
                placeholder="Untitled"
                maxLength={200}
                aria-label="Note title"
              />
              <span className="text-xs text-[var(--muted)]">
                {{ saved: "Saved", unsaved: "Unsaved changes", saving: "Saving…", error: "Save failed" }[status]}
              </span>
              {selected.sourceRoom && (
                <Link href={`/${selected.sourceRoom}`} className="btn-secondary">
                  Open room
                </Link>
              )}
              <button className="btn text-red-600 hover:bg-red-500/10 dark:text-red-400" onClick={deleteNote}>
                Delete
              </button>
            </div>
            <textarea
              className="flex-1 resize-none bg-transparent p-4 font-mono text-[15px] leading-relaxed outline-none"
              value={draft.content}
              onChange={(e) => edit({ content: e.target.value })}
              placeholder="Start writing…"
              aria-label="Note content"
            />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-[var(--muted)]">
            Select or create a note
          </div>
        )}
      </section>
    </div>
  );
}
