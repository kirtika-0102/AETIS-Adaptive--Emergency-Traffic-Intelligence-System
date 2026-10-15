import { createSelector, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

import type { AppNotification } from "../types/notification.types";
import { signedOut } from "./auth/authSlice";

/* ==========================================================================
   Notifications for the signed-in user (the bell and its panel).

   Fed by the API and, later, by WebSocket events. Fetching lives in hooks
   and services; this slice only holds and merges what they dispatch.
   ========================================================================== */

export type NotificationLoadStatus = "idle" | "loading" | "succeeded" | "failed";

export interface NotificationState {
  entities: Record<string, AppNotification>;
  /** Newest first */
  ids: string[];
  /**
   * Total unread according to the server. It can be larger than the number of
   * notifications held here, because only the latest are kept in memory.
   */
  unreadCount: number;
  loadStatus: NotificationLoadStatus;
  error: string | null;
}

export const initialNotificationState: NotificationState = {
  entities: {},
  ids: [],
  unreadCount: 0,
  loadStatus: "idle",
  error: null,
};

/** The panel shows 50; extra headroom keeps "mark as read" targets in memory */
const KEEP_LIMIT = 100;

/** Ids come from the server and are used as object keys, so odd ones are refused */
const VALID_ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;

const hasOwn = (obj: object, key: string) =>
  Object.prototype.hasOwnProperty.call(obj, key);

const isUsable = (n: unknown): n is AppNotification =>
  typeof n === "object" &&
  n !== null &&
  typeof (n as AppNotification).id === "string" &&
  VALID_ID.test((n as AppNotification).id) &&
  typeof (n as AppNotification).title === "string" &&
  typeof (n as AppNotification).message === "string";

const timeOf = (n: AppNotification) => {
  const t = Date.parse(n.createdAt);
  return Number.isFinite(t) ? t : 0;
};

const cleanCount = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null;

/** Returns true when the notification was not held before */
function mergeOne(state: NotificationState, incoming: AppNotification): boolean {
  const existing = hasOwn(state.entities, incoming.id)
    ? state.entities[incoming.id]
    : undefined;

  if (!existing) {
    state.entities[incoming.id] = incoming;
    return true;
  }

  state.entities[incoming.id] = {
    ...existing,
    ...incoming,
    // Once read here, a late snapshot that still says "unread" must not undo it
    read: existing.read || incoming.read,
  };
  return false;
}

function rebuildOrder(state: NotificationState) {
  const all = Object.values(state.entities);
  all.sort((a, b) => timeOf(b) - timeOf(a) || (a.id < b.id ? -1 : 1));

  state.ids = all.slice(0, KEEP_LIMIT).map((n) => n.id);
  all.slice(KEEP_LIMIT).forEach((n) => {
    delete state.entities[n.id];
  });
}

const countUnreadHeld = (state: NotificationState) =>
  Object.values(state.entities).filter((n) => !n.read).length;

const notificationSlice = createSlice({
  name: "notifications",
  initialState: initialNotificationState,
  reducers: {
    loadStarted(state) {
      state.loadStatus = "loading";
      state.error = null;
    },

    /**
     * A page of notifications from the API, with the server's unread total.
     * When the total is not supplied, it is counted from what is held.
     */
    notificationsReceived(
      state,
      action: PayloadAction<{ items: AppNotification[]; unreadCount?: number }>
    ) {
      action.payload.items.filter(isUsable).forEach((n) => mergeOne(state, n));
      rebuildOrder(state);

      state.unreadCount =
        cleanCount(action.payload.unreadCount) ?? countUnreadHeld(state);
      state.loadStatus = "succeeded";
      state.error = null;
    },

    loadFailed(state, action: PayloadAction<string>) {
      state.loadStatus = "failed";
      state.error = action.payload;
    },

    /** One notification pushed live over the socket */
    notificationReceived(state, action: PayloadAction<AppNotification>) {
      if (!isUsable(action.payload)) return;

      const isNew = mergeOne(state, action.payload);
      if (isNew && !action.payload.read) state.unreadCount += 1;
      rebuildOrder(state);
    },

    /** Optimistic update, applied the moment the user taps a notification */
    markedRead(state, action: PayloadAction<string>) {
      if (!hasOwn(state.entities, action.payload)) return;

      const n = state.entities[action.payload];
      if (n.read) return;

      n.read = true;
      state.unreadCount = Math.max(0, state.unreadCount - 1);
    },

    /** Undoes markedRead when the request fails */
    markedUnread(state, action: PayloadAction<string>) {
      if (!hasOwn(state.entities, action.payload)) return;

      const n = state.entities[action.payload];
      if (!n.read) return;

      n.read = false;
      state.unreadCount += 1;
    },

    allMarkedRead(state) {
      Object.values(state.entities).forEach((n) => {
        n.read = true;
      });
      state.unreadCount = 0;
    },

    /**
     * Undoes allMarkedRead when the request fails. The caller passes the ids
     * that were unread beforehand and the previous server total.
     */
    unreadRestored(
      state,
      action: PayloadAction<{ ids: string[]; unreadCount: number }>
    ) {
      action.payload.ids.forEach((id) => {
        if (hasOwn(state.entities, id)) state.entities[id].read = false;
      });
      state.unreadCount =
        cleanCount(action.payload.unreadCount) ?? countUnreadHeld(state);
    },

    notificationsCleared() {
      return initialNotificationState;
    },
  },

  extraReducers: (builder) => {
    // Notifications are personal; nothing may carry over to the next person
    builder.addCase(signedOut, () => initialNotificationState);
  },
});

export const {
  loadStarted,
  notificationsReceived,
  loadFailed,
  notificationReceived,
  markedRead,
  markedUnread,
  allMarkedRead,
  unreadRestored,
  notificationsCleared,
} = notificationSlice.actions;

export const NOTIFICATION_STATE_KEY = notificationSlice.name;

export default notificationSlice.reducer;

/* ---------- Selectors (take the slice itself, like the others) ---------- */

/** Newest first */
export const selectAllNotifications = createSelector(
  [
    (s: NotificationState) => s.ids,
    (s: NotificationState) => s.entities,
  ],
  (ids, entities) => ids.map((id) => entities[id]).filter(Boolean)
);

export const selectUnreadNotifications = createSelector(
  [selectAllNotifications],
  (all) => all.filter((n) => !n.read)
);

export const selectUnreadCount = (s: NotificationState): number => s.unreadCount;

/** Unread items that are flagged urgent, among those held in memory */
export const selectUnreadUrgentCount = (s: NotificationState): number =>
  selectUnreadNotifications(s).filter((n) => n.urgent).length;

export const selectNotificationLoadStatus = (
  s: NotificationState
): NotificationLoadStatus => s.loadStatus;

export const selectNotificationError = (s: NotificationState): string | null =>
  s.error;