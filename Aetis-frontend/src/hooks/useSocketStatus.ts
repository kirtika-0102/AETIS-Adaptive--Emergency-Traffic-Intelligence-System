import { useSyncExternalStore } from "react";

import { getSocketClient } from "../services/websocket/socketClient";
import type { SocketStatus } from "../services/websocket/socketClient";

export interface SocketStatusInfo {
  status: SocketStatus;
  /** The live connection is up, so the socket is keeping data current */
  isOpen: boolean;
  /**
   * False when live updates cannot work at all (mock mode, or an unusable
   * VITE_WS_URL). Data then has to come from polling.
   */
  available: boolean;
}

/** Follows the shared socket connection. Re-renders only when the status changes. */
export function useSocketStatus(): SocketStatusInfo {
  const client = getSocketClient();
  const status = useSyncExternalStore(client.subscribeStatus, () =>
    client.getStatus()
  );

  return { status, isOpen: status === "open", available: client.available };
}