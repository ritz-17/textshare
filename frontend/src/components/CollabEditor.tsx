"use client";

import { useEffect, useRef, useState } from "react";
import { basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import * as Y from "yjs";
import { yCollab } from "y-codemirror.next";
import { YSocketProvider, type ConnectionStatus } from "@/lib/YSocketProvider";
import { identityForGuest, loadPreferredGuest, savePreferredGuest, type Identity } from "@/lib/identity";
import { linePresence, setPeersEffect, trackOwnLine, type Peer } from "./presence";

interface Props {
  room: string;
  apiUrl: string;
  token: string | null;
  /** Identity of the logged-in user, or null for a guest (the server then assigns a unique animal). */
  userIdentity: Identity | null;
  /** Called with the identity actually used in the room. */
  onIdentity?: (identity: Identity) => void;
  /** Called with a getter for the current room text (used by "Save to notes"). */
  onReady?: (getText: () => string) => void;
}

const editorTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "15px", backgroundColor: "var(--background)", color: "var(--foreground)" },
  ".cm-scroller": { fontFamily: "var(--font-mono), ui-monospace, monospace", lineHeight: "1.6" },
  ".cm-content": { caretColor: "var(--foreground)", padding: "12px 0" },
  ".cm-gutters": { backgroundColor: "var(--surface)", color: "var(--muted)", borderRight: "1px solid var(--border)" },
  ".cm-activeLineGutter, .cm-activeLine": { backgroundColor: "transparent" },
  "&.cm-focused": { outline: "none" },
});

export default function CollabEditor({ room, apiUrl, token, userIdentity, onIdentity, onReady }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [error, setError] = useState<string>();
  const [peers, setPeers] = useState<Peer[]>([]);

  const userName = userIdentity?.name;
  const userColor = userIdentity?.color;

  useEffect(() => {
    const doc = new Y.Doc();
    const ytext = doc.getText("content");
    const announce = (identity: Identity) => {
      const { name, color, colorLight, guest } = identity;
      awareness.setLocalState({ ...awareness.getLocalState(), user: { name, color, colorLight, guest } });
      onIdentity?.(identity);
    };
    const provider = new YSocketProvider(apiUrl, room, doc, {
      token,
      onStatus: (s, err) => {
        setStatus(s);
        setError(err);
      },
      preferredGuest: loadPreferredGuest,
      onGuest: (guest) => {
        if (userIdentity) return;
        savePreferredGuest(guest);
        announce(identityForGuest(guest));
      },
    });
    const { awareness } = provider;
    awareness.setLocalState({ line: 1 });
    if (userIdentity) announce(userIdentity);

    const view = new EditorView({
      parent: hostRef.current!,
      state: EditorState.create({
        doc: ytext.toString(),
        extensions: [
          basicSetup,
          EditorView.lineWrapping,
          editorTheme,
          yCollab(ytext, awareness, { undoManager: new Y.UndoManager(ytext) }),
          linePresence(),
          trackOwnLine((line) => {
            if (awareness.getLocalState()?.line !== line) awareness.setLocalStateField("line", line);
          }),
          EditorView.contentAttributes.of({ "aria-label": `Shared text for room ${room}` }),
        ],
      }),
    });

    // Awareness changes can fire mid-update (e.g. from our own line tracker), and
    // CodeMirror forbids dispatching then, so batch the refresh into the next frame.
    let frame = 0;
    const refresh = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const list: Peer[] = [];
        awareness.getStates().forEach((state, clientId) => {
          const user = state.user;
          if (!user) return;
          list.push({
            clientId,
            name: String(user.name ?? "Anonymous"),
            color: String(user.color ?? "#888"),
            colorLight: String(user.colorLight ?? "#8883"),
            guest: Boolean(user.guest),
            line: Number(state.line) || 1,
            self: clientId === doc.clientID,
          });
        });
        list.sort((a, b) => Number(b.self) - Number(a.self) || a.line - b.line);
        setPeers(list);

        const byLine = new Map<number, Peer[]>();
        for (const peer of list) {
          if (peer.self) continue;
          byLine.set(peer.line, [...(byLine.get(peer.line) ?? []), peer]);
        }
        view.dispatch({ effects: setPeersEffect.of(byLine) });
      });
    };
    awareness.on("change", refresh);
    refresh();
    onReady?.(() => ytext.toString());

    return () => {
      cancelAnimationFrame(frame);
      awareness.off("change", refresh);
      provider.destroy();
      view.destroy();
      doc.destroy();
    };
    // userIdentity is tracked via its name/colour so a new object with the same values doesn't reconnect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, apiUrl, token, userName, userColor, onIdentity, onReady]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
      <div className="flex min-h-[60vh] flex-1 flex-col overflow-hidden rounded-xl border border-[var(--border)]">
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm">
          <StatusPill status={status} error={error} />
          <span className="text-[var(--muted)]">
            {peers.length} {peers.length === 1 ? "person" : "people"} here
          </span>
        </div>
        <div ref={hostRef} className="min-h-0 flex-1 overflow-auto" />
      </div>

      <aside className="w-full shrink-0 rounded-xl border border-[var(--border)] p-4 lg:w-72">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">In this room</h2>
        <ul className="space-y-2">
          {peers.map((peer) => (
            <li key={peer.clientId} className="flex items-center gap-2 text-sm">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: peer.color }} />
              <span className="min-w-0 flex-1 truncate">
                {peer.name}
                {peer.self && <span className="text-[var(--muted)]"> (you)</span>}
              </span>
              {peer.guest && (
                <span className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-[10px] uppercase text-[var(--muted)]">
                  guest
                </span>
              )}
              <span className="shrink-0 tabular-nums text-[var(--muted)]">L{peer.line}</span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

function StatusPill({ status, error }: { status: ConnectionStatus; error?: string }) {
  const styles: Record<ConnectionStatus, { dot: string; label: string }> = {
    connecting: { dot: "bg-amber-500", label: "Connecting…" },
    connected: { dot: "bg-emerald-500", label: "Live" },
    disconnected: { dot: "bg-zinc-400", label: "Offline - reconnecting" },
    error: { dot: "bg-red-500", label: error ?? "Error" },
  };
  const { dot, label } = styles[status];
  return (
    <span className="flex items-center gap-2" role="status">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
