import { RangeSetBuilder, StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, GutterMarker, gutter, type DecorationSet } from "@codemirror/view";

export interface Peer {
  clientId: number;
  name: string;
  color: string;
  colorLight: string;
  guest: boolean;
  line: number;
  self: boolean;
}

/** Replace the set of remote peers (keyed by 1-based line number). */
export const setPeersEffect = StateEffect.define<Map<number, Peer[]>>();

interface PresenceState {
  byLine: Map<number, Peer[]>;
  decorations: DecorationSet;
}

function buildDecorations(byLine: Map<number, Peer[]>, doc: EditorView["state"]["doc"]): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const lineNo of [...byLine.keys()].sort((a, b) => a - b)) {
    if (lineNo < 1 || lineNo > doc.lines) continue;
    const peer = byLine.get(lineNo)![0];
    builder.add(
      doc.line(lineNo).from,
      doc.line(lineNo).from,
      Decoration.line({
        attributes: { style: `background-color: ${peer.colorLight}; box-shadow: inset 2px 0 ${peer.color}` },
      }),
    );
  }
  return builder.finish();
}

const presenceField = StateField.define<PresenceState>({
  create: () => ({ byLine: new Map(), decorations: Decoration.none }),
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setPeersEffect)) {
        return { byLine: effect.value, decorations: buildDecorations(effect.value, tr.state.doc) };
      }
    }
    return tr.docChanged ? { ...value, decorations: value.decorations.map(tr.changes) } : value;
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
});

class PeersMarker extends GutterMarker {
  constructor(readonly peers: Peer[]) {
    super();
  }

  eq(other: PeersMarker) {
    return (
      other.peers.length === this.peers.length &&
      other.peers.every((p, i) => p.clientId === this.peers[i].clientId && p.name === this.peers[i].name)
    );
  }

  toDOM() {
    const wrap = document.createElement("div");
    wrap.className = "cm-presence-marker";
    wrap.title = this.peers.map((p) => p.name).join(", ");
    for (const peer of this.peers.slice(0, 3)) {
      const badge = document.createElement("span");
      badge.className = "cm-presence-badge";
      badge.style.backgroundColor = peer.color;
      badge.textContent = peer.name.replace(/^Anonymous\s+/, "").charAt(0).toUpperCase();
      wrap.appendChild(badge);
    }
    if (this.peers.length > 3) {
      const more = document.createElement("span");
      more.className = "cm-presence-more";
      more.textContent = `+${this.peers.length - 3}`;
      wrap.appendChild(more);
    }
    return wrap;
  }
}

const spacer = new PeersMarker([]);

const presenceGutter = gutter({
  class: "cm-presence-gutter",
  lineMarker(view, line) {
    const lineNo = view.state.doc.lineAt(line.from).number;
    const peers = view.state.field(presenceField).byLine.get(lineNo);
    return peers ? new PeersMarker(peers) : null;
  },
  lineMarkerChange: (update) => update.transactions.some((tr) => tr.effects.some((e) => e.is(setPeersEffect))),
  initialSpacer: () => spacer,
});

const presenceTheme = EditorView.baseTheme({
  ".cm-presence-gutter": { minWidth: "56px" },
  ".cm-presence-marker": { display: "flex", gap: "2px", alignItems: "center", height: "100%", paddingLeft: "4px" },
  ".cm-presence-badge": {
    width: "16px",
    height: "16px",
    borderRadius: "9999px",
    color: "white",
    fontSize: "10px",
    fontWeight: "600",
    lineHeight: "16px",
    textAlign: "center",
    display: "inline-block",
  },
  ".cm-presence-more": { fontSize: "10px", opacity: "0.7" },
});

/** Gutter badges + line highlight showing which line each other user is on. */
export function linePresence(): Extension {
  return [presenceField, presenceGutter, presenceTheme];
}

/** Report the local cursor's line number whenever it changes. */
export function trackOwnLine(onLine: (line: number) => void): Extension {
  return EditorView.updateListener.of((update) => {
    if (!update.selectionSet && !update.docChanged) return;
    const line = update.state.doc.lineAt(update.state.selection.main.head).number;
    onLine(line);
  });
}
