import { io, type Socket } from "socket.io-client";
import * as Y from "yjs";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export interface GuestAssignment {
  name: string;
  color: string;
}

interface JoinResponse {
  state?: ArrayBuffer;
  awareness?: ArrayBuffer | null;
  /** Unique anonymous identity assigned by the server (null when logged in). */
  guest?: GuestAssignment | null;
  error?: string;
}

interface ProviderOptions {
  token: string | null;
  onStatus: (status: ConnectionStatus, error?: string) => void;
  /** The guest identity this browser had before, kept if still free in the room. */
  preferredGuest?: () => GuestAssignment | null;
  /** Called on every join with the guest identity the server assigned. */
  onGuest?: (guest: GuestAssignment) => void;
}

/**
 * Syncs a Y.Doc and its Awareness with the backend over Socket.IO.
 * See backend/src/rooms.ts for the server side of the protocol.
 */
export class YSocketProvider {
  readonly awareness: Awareness;
  private readonly socket: Socket;
  private synced = false;

  constructor(
    serverUrl: string,
    private readonly room: string,
    private readonly doc: Y.Doc,
    private readonly options: ProviderOptions,
  ) {
    this.awareness = new Awareness(doc);
    const { token } = options;
    // WebSocket-only so the load balancer doesn't need sticky sessions for long-polling.
    this.socket = io(serverUrl, { auth: { token }, transports: ["websocket"] });

    this.socket.on("connect", this.join);
    this.socket.on("disconnect", this.handleDisconnect);
    this.socket.on("connect_error", () => this.options.onStatus("disconnected"));
    this.socket.on("update", (update: ArrayBuffer) => {
      Y.applyUpdate(this.doc, new Uint8Array(update), this);
    });
    this.socket.on("awareness", (update: ArrayBuffer) => {
      applyAwarenessUpdate(this.awareness, new Uint8Array(update), this);
    });

    this.doc.on("update", this.handleDocUpdate);
    this.awareness.on("update", this.handleAwarenessUpdate);
    window.addEventListener("beforeunload", this.handleUnload);
    this.options.onStatus("connecting");
  }

  private join = () => {
    this.options.onStatus("connecting");
    const preferredGuest = this.options.preferredGuest?.() ?? null;
    this.socket.emit("join", this.room, { preferredGuest }, (res: JoinResponse) => {
      if (res.error || !res.state) {
        this.options.onStatus("error", res.error ?? "Could not join room");
        return;
      }
      const serverState = new Uint8Array(res.state);
      Y.applyUpdate(this.doc, serverState, this);

      // Push anything we have that the server doesn't (edits made while offline,
      // or unsaved changes lost by a server restart).
      const missing = Y.encodeStateAsUpdate(this.doc, Y.encodeStateVectorFromUpdate(serverState));
      if (missing.byteLength > 2) this.socket.emit("update", missing);

      // Set our guest name before announcing ourselves to the room.
      if (res.guest) this.options.onGuest?.(res.guest);
      if (res.awareness) applyAwarenessUpdate(this.awareness, new Uint8Array(res.awareness), this);
      if (this.awareness.getLocalState()) {
        this.socket.emit("awareness", encodeAwarenessUpdate(this.awareness, [this.doc.clientID]));
      }
      this.synced = true;
      this.options.onStatus("connected");
    });
  };

  private handleDisconnect = () => {
    this.synced = false;
    const others = [...this.awareness.getStates().keys()].filter((id) => id !== this.doc.clientID);
    removeAwarenessStates(this.awareness, others, this);
    this.options.onStatus("disconnected");
  };

  private handleDocUpdate = (update: Uint8Array, origin: unknown) => {
    // Updates made while offline are sent as a single diff on the next join.
    if (origin !== this && this.synced) this.socket.emit("update", update);
  };

  private handleAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (origin === this || !this.synced) return;
    const changed = added.concat(updated, removed);
    this.socket.emit("awareness", encodeAwarenessUpdate(this.awareness, changed));
  };

  private handleUnload = () => {
    removeAwarenessStates(this.awareness, [this.doc.clientID], "unload");
  };

  destroy() {
    window.removeEventListener("beforeunload", this.handleUnload);
    removeAwarenessStates(this.awareness, [this.doc.clientID], "destroy");
    this.doc.off("update", this.handleDocUpdate);
    this.awareness.off("update", this.handleAwarenessUpdate);
    this.awareness.destroy();
    this.socket.disconnect();
  }
}
