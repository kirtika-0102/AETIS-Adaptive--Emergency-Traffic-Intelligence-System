import { USE_MOCK_API, isRecord } from "../api/axiosClient";

/* ==========================================================================
   Live connection to the AETIS backend.

   - Reconnects by itself, with growing waits and some randomness
   - Detects dead connections (browsers can take minutes to notice)
   - Knows nothing about emergencies or vehicles; it only delivers messages

   Wire format, both directions: { "type": string, "data"?: any }
   ========================================================================== */

export type SocketStatus =
  /** Not started, or live updates are unavailable (mock mode, bad URL) */
  | "idle"
  | "connecting"
  | "open"
  /** Lost the connection and waiting to retry, or retrying now */
  | "reconnecting"
  /** Closed on purpose with disconnect() */
  | "closed"
  /** The server refused the session (4401) or the role (4403). Retrying cannot help. */
  | "unauthorized";

export interface SocketMessage {
  type: string;
  data?: unknown;
}

export interface SocketOpenInfo {
  /** True when this is not the first connection since connect() */
  reconnect: boolean;
}

type MessageHandler = (message: SocketMessage) => void;
type OpenHandler = (info: SocketOpenInfo) => void;
type StatusListener = () => void;

/**
 * Browsers hide the HTTP status of a failed WebSocket handshake, so the server
 * must accept the upgrade and then close with one of these codes.
 */
export const CLOSE_UNAUTHORIZED = 4401;
export const CLOSE_FORBIDDEN = 4403;
const CLOSE_HEARTBEAT_TIMEOUT = 4000;

const MAX_INBOUND_CHARS = 1_000_000;
const MAX_OUTBOUND_CHARS = 64_000;
/** Do not retry immediately more often than this, even on "online" or tab focus */
const MIN_RECONNECT_GAP_MS = 2_000;
const MAX_BACKOFF_EXPONENT = 10;

export interface SocketClientOptions {
  /** null means live updates are unavailable and connect() does nothing */
  url: string | null;
  heartbeatIntervalMs?: number;
  /** Silence longer than this means the connection is dead */
  heartbeatTimeoutMs?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  /** A connection that stayed open this long resets the retry delay */
  stableAfterMs?: number;
  /** Replaceable in tests */
  createSocket?: (url: string) => WebSocket;
}

const isLocalHost = (hostname: string) =>
  hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";

/**
 * Turns VITE_WS_URL into a ws:// or wss:// address, or null if it is unusable.
 *  - "/ws" (the default) follows the page: wss on https, ws on http
 *  - http(s):// is converted to ws(s)://
 *  - addresses with a username or password are refused
 *  - plain ws:// from an https page is refused, except to localhost
 */
export function resolveSocketUrl(
  raw: string | undefined = import.meta.env.VITE_WS_URL
): string | null {
  if (typeof window === "undefined") return null;

  const value = typeof raw === "string" && raw.trim() ? raw.trim() : "/ws";
  const page = window.location;

  let url: URL;
  try {
    if (value.startsWith("/") && !value.startsWith("//")) {
      const scheme = page.protocol === "https:" ? "wss:" : "ws:";
      url = new URL(value, `${scheme}//${page.host}`);
    } else {
      url = new URL(value);
      if (url.protocol === "http:") url.protocol = "ws:";
      else if (url.protocol === "https:") url.protocol = "wss:";
    }
  } catch {
    return null;
  }

  if (url.protocol !== "ws:" && url.protocol !== "wss:") return null;
  if (url.username || url.password) return null;
  if (
    page.protocol === "https:" &&
    url.protocol === "ws:" &&
    !isLocalHost(url.hostname)
  ) {
    return null;
  }

  url.hash = "";
  return url.toString();
}

export class SocketClient {
  private readonly url: string | null;
  private readonly heartbeatIntervalMs: number;
  private readonly heartbeatTimeoutMs: number;
  private readonly backoffBaseMs: number;
  private readonly backoffMaxMs: number;
  private readonly stableAfterMs: number;
  private readonly createSocket: (url: string) => WebSocket;

  private ws: WebSocket | null = null;
  private status: SocketStatus = "idle";
  private wantConnected = false;
  private everOpened = false;
  private attempts = 0;
  private openedAt: number | null = null;
  private lastMessageAt = 0;
  private lastAttemptAt = 0;
  private lastCloseCode: number | null = null;
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private globalListenersAttached = false;

  private readonly messageHandlers = new Set<MessageHandler>();
  private readonly openHandlers = new Set<OpenHandler>();
  private readonly statusListeners = new Set<StatusListener>();

  constructor(options: SocketClientOptions) {
    this.url = options.url;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 20_000;
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? 50_000;
    this.backoffBaseMs = options.backoffBaseMs ?? 1_000;
    this.backoffMaxMs = options.backoffMaxMs ?? 30_000;
    this.stableAfterMs = options.stableAfterMs ?? 10_000;
    this.createSocket = options.createSocket ?? ((u) => new WebSocket(u));
  }

  /* ---------- Public API ---------- */

  /** False when live updates cannot work (mock mode, or an unusable URL) */
  get available(): boolean {
    return this.url !== null;
  }

  getStatus(): SocketStatus {
    return this.status;
  }

  /** The code the last connection closed with, or null */
  getLastCloseCode(): number | null {
    return this.lastCloseCode;
  }

  /** Safe to call more than once */
  connect(): void {
    if (!this.url || this.wantConnected) return;

    this.wantConnected = true;
    this.attempts = 0;
    this.lastCloseCode = null;
    this.attachGlobalListeners();
    this.open();
  }

  /** Closes for good. Call connect() again to start over. */
  disconnect(): void {
    this.wantConnected = false;
    this.clearReconnectTimer();
    this.stopHeartbeat();
    this.detachGlobalListeners();

    const ws = this.ws;
    this.ws = null;
    this.detach(ws);
    try {
      ws?.close(1000, "client closing");
    } catch {
      /* already closed */
    }

    this.attempts = 0;
    this.openedAt = null;
    this.everOpened = false;
    this.setStatus(this.url ? "closed" : "idle");
  }

  /**
   * Sends a message if the connection is open, and reports whether it did.
   * Nothing is queued: a command held back through an outage and sent minutes
   * later could be out of date, so the caller decides what to do on false.
   */
  send(message: SocketMessage): boolean {
    return this.write(message, true);
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  /** Called each time a connection opens, including after a reconnect */
  onOpen(handler: OpenHandler): () => void {
    this.openHandlers.add(handler);
    return () => {
      this.openHandlers.delete(handler);
    };
  }

  /** Works with React's useSyncExternalStore(subscribeStatus, getStatus) */
  subscribeStatus = (listener: StatusListener): (() => void) => {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  };

  /* ---------- Connection ---------- */

  private open(): void {
    if (!this.url || !this.wantConnected || this.ws) return;

    this.clearReconnectTimer();
    this.lastAttemptAt = Date.now();
    this.setStatus(
      this.attempts === 0 && !this.everOpened ? "connecting" : "reconnecting"
    );

    let ws: WebSocket;
    try {
      ws = this.createSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      if (this.ws !== ws) return;

      const reconnect = this.everOpened;
      this.everOpened = true;
      this.openedAt = Date.now();
      this.lastMessageAt = this.openedAt;

      this.setStatus("open");
      this.startHeartbeat();

      for (const handler of [...this.openHandlers]) {
        try {
          handler({ reconnect });
        } catch {
          /* one failing handler must not stop the others */
        }
      }
    };

    ws.onmessage = (event) => {
      if (this.ws !== ws) return;
      this.handleMessage(event);
    };

    // An error is always followed by a close event, which does the work
    ws.onerror = () => undefined;

    ws.onclose = (event) => {
      if (this.ws !== ws) return;
      this.detach(ws);
      this.ws = null;
      this.afterClose(event.code);
    };
  }

  private handleMessage(event: MessageEvent): void {
    // Any message, even a pong, proves the connection is alive
    this.lastMessageAt = Date.now();

    const raw = event.data;
    if (typeof raw !== "string" || raw.length > MAX_INBOUND_CHARS) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (!isRecord(parsed) || typeof parsed.type !== "string") return;

    if (parsed.type === "pong") return;
    if (parsed.type === "ping") {
      this.write({ type: "pong" }, false);
      return;
    }

    const message: SocketMessage = { type: parsed.type, data: parsed.data };
    for (const handler of [...this.messageHandlers]) {
      try {
        handler(message);
      } catch {
        /* one failing handler must not stop the others */
      }
    }
  }

  private afterClose(code: number): void {
    this.stopHeartbeat();

    const stable =
      this.openedAt !== null &&
      Date.now() - this.openedAt >= this.stableAfterMs;
    this.openedAt = null;
    this.lastCloseCode = code;

    if (!this.wantConnected) {
      this.setStatus(this.url ? "closed" : "idle");
      return;
    }

    if (code === CLOSE_UNAUTHORIZED || code === CLOSE_FORBIDDEN) {
      this.wantConnected = false;
      this.detachGlobalListeners();
      this.setStatus("unauthorized");
      return;
    }

    // A connection that opens and drops straight away must keep backing off
    if (stable) this.attempts = 0;
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (!this.wantConnected) return;

    this.setStatus("reconnecting");
    this.clearReconnectTimer();

    const ceiling = Math.min(
      this.backoffMaxMs,
      this.backoffBaseMs * 2 ** Math.min(this.attempts, MAX_BACKOFF_EXPONENT)
    );
    // Half fixed, half random: clients do not all return at the same moment
    const delay = Math.round(ceiling / 2 + Math.random() * (ceiling / 2));

    this.attempts += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  /** Skips the wait, for when the network or the tab has just come back */
  private reconnectNow(): void {
    if (!this.wantConnected || this.ws || this.status !== "reconnecting") return;
    if (Date.now() - this.lastAttemptAt < MIN_RECONNECT_GAP_MS) return;

    this.clearReconnectTimer();
    this.open();
  }

  /** A connection that has said nothing for too long is treated as dead */
  private checkLiveness(): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (Date.now() - this.lastMessageAt <= this.heartbeatTimeoutMs) return;

    // close() waits for a handshake a dead link never completes, so do not wait
    this.detach(ws);
    this.ws = null;
    try {
      ws.close();
    } catch {
      /* already gone */
    }
    this.afterClose(CLOSE_HEARTBEAT_TIMEOUT);
  }

  /* ---------- Helpers ---------- */

  private write(message: SocketMessage, enforceLimit: boolean): boolean {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;

    try {
      const text = JSON.stringify(message);
      if (enforceLimit && text.length > MAX_OUTBOUND_CHARS) return false;
      ws.send(text);
      return true;
    } catch {
      return false;
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      this.checkLiveness();
      this.write({ type: "ping" }, false);
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /** Stops a replaced or closed socket from calling back into this client */
  private detach(ws: WebSocket | null): void {
    if (!ws) return;
    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
  }

  private setStatus(next: SocketStatus): void {
    if (this.status === next) return;
    this.status = next;

    for (const listener of [...this.statusListeners]) {
      try {
        listener();
      } catch {
        /* one failing listener must not stop the others */
      }
    }
  }

  private readonly onOnline = () => this.reconnectNow();

  private readonly onVisibilityChange = () => {
    if (document.visibilityState !== "visible") return;
    // Timers are throttled in background tabs, so check straight away
    this.checkLiveness();
    this.reconnectNow();
  };

  private attachGlobalListeners(): void {
    if (this.globalListenersAttached) return;
    this.globalListenersAttached = true;
    window.addEventListener("online", this.onOnline);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  private detachGlobalListeners(): void {
    if (!this.globalListenersAttached) return;
    this.globalListenersAttached = false;
    window.removeEventListener("online", this.onOnline);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
  }
}

/* ==========================================================================
   Shared instance
   ========================================================================== */

let instance: SocketClient | null = null;

/** Created on first use, so importing this file has no side effects */
export function getSocketClient(): SocketClient {
  if (!instance) {
    // Mock mode has no server to connect to
    const url = USE_MOCK_API ? null : resolveSocketUrl();

    if (!USE_MOCK_API && url === null) {
      console.error(
        "[AETIS] Live updates are disabled: VITE_WS_URL is not a usable WebSocket address."
      );
    }
    instance = new SocketClient({ url });
  }
  return instance;
}