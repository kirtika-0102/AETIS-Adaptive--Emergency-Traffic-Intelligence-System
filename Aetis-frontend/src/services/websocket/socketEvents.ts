import type { UnknownAction } from "@reduxjs/toolkit";

import {
  emergenciesReceived,
  emergencyRemoved,
  emergencyStatusChanged,
  emergencyUpserted,
  isActiveStatus,
} from "../../features/emergency/emergencySlice";
import type { EmergencyState } from "../../features/emergency/emergencySlice";
import {
  notificationReceived,
  notificationsReceived,
} from "../../features/notificationSlice";
import {
  routeCleared,
  routeSignalsReceived,
  signalStatusChanged,
  signalsReceived,
} from "../../features/signalSlice";
import type { SignalState } from "../../features/signalSlice";
import {
  connectionChanged,
  evMoved,
  evRemoved,
  evUpserted,
  evsSnapshotReceived,
} from "../../features/trackingSlice";
import type { TrackingState } from "../../features/trackingSlice";
import { nearbyCleared, vehicleStatusChanged } from "../../features/vehicleSlice";
import type { EmergencyStatus } from "../../types/emergency.types";
import type { SignalStatus } from "../../types/signal.types";
import {
  finiteNumber,
  idOf,
  isRecord,
  parseLatLng,
  parseLatLngList,
  str,
  toEpochMs,
} from "../api/axiosClient";
import { emergencyApi, normalizeEmergency } from "../api/emergencyApi";
import { normalizeNotification, notificationApi } from "../api/notificationApi";
import { normalizeSignal, signalApi } from "../api/signalApi";
import { normalizeEV, trackingApi } from "../api/trackingApi";
import type { SocketClient, SocketMessage } from "./socketClient";

/* ==========================================================================
   Event names the server sends. Each message is { type, data }.
   ========================================================================== */

export const SOCKET_EVENTS = {
  /** data: a full emergency. Sent for new emergencies and for any change. */
  EMERGENCY_UPDATED: "emergency.updated",
  /** data: { id, status, responseSeconds? } */
  EMERGENCY_STATUS: "emergency.status",
  /** data: { id } */
  EMERGENCY_REMOVED: "emergency.removed",
  /** data: a full tracked vehicle. Sent when a trip starts or its details change. */
  EV_UPDATED: "ev.updated",
  /** data: { emergencyId, location, speedKmh?, etaSeconds?, lastUpdateAt?, route? } */
  EV_MOVED: "ev.moved",
  /** data: { emergencyId }. The trip is over. */
  EV_ENDED: "ev.ended",
  /** data: { id, status, at?, expectedArrivalAt? } */
  SIGNAL_STATUS: "signal.status",
  /** data: { emergencyId, signals: Signal[], at? }, in the order the vehicle meets them */
  SIGNAL_ROUTE: "signal.route",
  /** data: { id, status, at? } */
  VEHICLE_STATUS: "vehicle.status",
  /** data: a notification */
  NOTIFICATION_NEW: "notification.new",
} as const;

/* ==========================================================================
   What the router needs from the store
   ========================================================================== */

/**
 * The state keys must match the slice names: "emergency", "tracking" and
 * "signals" (see EMERGENCY_STATE_KEY, TRACKING_STATE_KEY, SIGNAL_STATE_KEY).
 */
export interface SocketRootState {
  emergency: EmergencyState;
  tracking: TrackingState;
  signals: SignalState;
}

export interface SocketStore {
  dispatch(action: UnknownAction): unknown;
  getState(): SocketRootState;
}

/** Which snapshots to reload after every (re)connect. Role-dependent. */
export interface ResyncOptions {
  emergencies?: boolean;
  tracking?: boolean;
  signals?: boolean;
  notifications?: boolean;
}

/**
 * Defaults suit every role. A dispatcher or admin should also pass
 * { emergencies: true, signals: true }; other roles are not allowed to
 * read those lists and would only collect refusals.
 */
const DEFAULT_RESYNC: Required<ResyncOptions> = {
  emergencies: false,
  tracking: true,
  signals: false,
  notifications: true,
};

/* ==========================================================================
   Helpers
   ========================================================================== */

const VALID_ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;

const hasOwn = (obj: object, key: string) =>
  Object.prototype.hasOwnProperty.call(obj, key);

const validId = (value: unknown): string | null => {
  const id = idOf(value);
  return VALID_ID.test(id) ? id : null;
};

const FETCH_COOLDOWN_MS = 5_000;
const COOLDOWN_PRUNE_AT = 200;
const RESYNC_EMERGENCY_PAGE_SIZE = 50;
const MAX_REFETCH_AFTER_RESYNC = 20;

/**
 * Runs lookups for records an event mentioned but the store does not hold.
 * The same lookup is never started twice at once, and a key that was just
 * tried is left alone for a few seconds, so a flood of events about an
 * unknown or forbidden record cannot turn into a flood of requests.
 */
function createFetchGuard() {
  const inflight = new Set<string>();
  const retryAfter = new Map<string, number>();

  const prune = () => {
    if (retryAfter.size <= COOLDOWN_PRUNE_AT) return;
    const now = Date.now();
    retryAfter.forEach((until, key) => {
      if (until <= now) retryAfter.delete(key);
    });
  };

  return {
    run(key: string, task: () => Promise<void>): void {
      if (inflight.has(key)) return;
      const blockedUntil = retryAfter.get(key);
      if (blockedUntil !== undefined && blockedUntil > Date.now()) return;

      inflight.add(key);
      task()
        .catch(() => undefined)
        .finally(() => {
          inflight.delete(key);
          retryAfter.set(key, Date.now() + FETCH_COOLDOWN_MS);
          prune();
        });
    },
  };
}

/* ==========================================================================
   Router
   ========================================================================== */

export function createSocketEventRouter(
  store: SocketStore,
  resyncOptions: ResyncOptions = {}
) {
  const options = { ...DEFAULT_RESYNC, ...resyncOptions };
  const guard = createFetchGuard();

  // Once disposed (sign-out), nothing may reach the store, including the
  // results of requests that were still on their way back
  let disposed = false;
  const dispatch = (action: UnknownAction) => {
    if (!disposed) store.dispatch(action);
  };

  /* ---------- Lookups for records the store does not hold yet ---------- */

  const fetchEmergency = (id: string) =>
    guard.run(`emergency:${id}`, async () => {
      dispatch(emergencyUpserted(await emergencyApi.getEmergencyById(id)));
    });

  const fetchEV = (id: string) =>
    guard.run(`ev:${id}`, async () => {
      const ev = await trackingApi.getEV(id);
      if (ev) dispatch(evUpserted(ev));
    });

  const refreshSignals = () =>
    guard.run("signals", async () => {
      const requestedAt = Date.now();
      dispatch(signalsReceived(await signalApi.getSignals(), requestedAt));
    });

  /* ---------- Events ---------- */

  function route({ type, data }: SocketMessage): void {
    const d = isRecord(data) ? data : null;

    switch (type) {
      case SOCKET_EVENTS.EMERGENCY_UPDATED:
        dispatch(emergencyUpserted(normalizeEmergency(data)));
        return;

      case SOCKET_EVENTS.EMERGENCY_STATUS: {
        const id = d && validId(d.id);
        const status = d && str(d.status);
        if (!d || !id || !status) return;

        if (hasOwn(store.getState().emergency.entities, id)) {
          dispatch(
            emergencyStatusChanged({
              id,
              status: status as EmergencyStatus,
              responseSeconds: finiteNumber(d.responseSeconds),
            })
          );
        } else {
          // A bare status cannot create a record, so load the whole thing
          fetchEmergency(id);
        }
        return;
      }

      case SOCKET_EVENTS.EMERGENCY_REMOVED: {
        const id = d && validId(d.id);
        if (id) dispatch(emergencyRemoved(id));
        return;
      }

      case SOCKET_EVENTS.EV_UPDATED:
        dispatch(evUpserted(normalizeEV(data)));
        return;

      case SOCKET_EVENTS.EV_MOVED: {
        const emergencyId = d && validId(d.emergencyId);
        const location = d && parseLatLng(d.location);
        if (!d || !emergencyId || !location) return;

        if (!hasOwn(store.getState().tracking.entities, emergencyId)) {
          fetchEV(emergencyId);
          return;
        }

        // Accepts an ISO string or epoch milliseconds, stores an ISO string
        const sentAt = toEpochMs(d.lastUpdateAt);

        dispatch(
          evMoved({
            emergencyId,
            location,
            speedKmh: finiteNumber(d.speedKmh),
            etaSeconds: finiteNumber(d.etaSeconds),
            lastUpdateAt:
              sentAt !== undefined ? new Date(sentAt).toISOString() : undefined,
            // Only present when the route was recalculated
            route: d.route !== undefined ? parseLatLngList(d.route) : undefined,
          })
        );
        return;
      }

      case SOCKET_EVENTS.EV_ENDED: {
        const emergencyId = d && validId(d.emergencyId);
        if (!emergencyId) return;

        dispatch(evRemoved(emergencyId));
        dispatch(routeCleared(emergencyId));
        dispatch(nearbyCleared(emergencyId));
        return;
      }

      case SOCKET_EVENTS.SIGNAL_STATUS: {
        const id = d && validId(d.id);
        const status = d && str(d.status);
        if (!d || !id || !status) return;

        if (hasOwn(store.getState().signals.entities, id)) {
          dispatch(
            signalStatusChanged({
              id,
              status: status as SignalStatus,
              at: toEpochMs(d.at),
              expectedArrivalAt: toEpochMs(d.expectedArrivalAt),
            })
          );
        } else {
          refreshSignals();
        }
        return;
      }

      case SOCKET_EVENTS.SIGNAL_ROUTE: {
        const emergencyId = d && validId(d.emergencyId);
        if (!d || !emergencyId || !Array.isArray(d.signals)) return;

        dispatch(
          routeSignalsReceived(
            emergencyId,
            d.signals.map(normalizeSignal),
            toEpochMs(d.at) ?? Date.now()
          )
        );
        return;
      }

      case SOCKET_EVENTS.VEHICLE_STATUS: {
        const id = d && validId(d.id);
        const status = d && str(d.status);
        if (!d || !id || !status) return;

        dispatch(vehicleStatusChanged({ id, status, at: toEpochMs(d.at) }));
        return;
      }

      case SOCKET_EVENTS.NOTIFICATION_NEW:
        dispatch(notificationReceived(normalizeNotification(data)));
        return;

      default:
        // Unknown types are ignored, so the server can add events safely
        return;
    }
  }

  function handleMessage(message: SocketMessage): void {
    if (disposed) return;
    try {
      route(message);
    } catch {
      // A malformed event is dropped. It must never stop the feed.
    }
  }

  /* ---------- Catching up after a (re)connect ---------- */

  /**
   * Events sent while the connection was down are gone, so every connect
   * reloads the snapshots. Failures are ignored here: the pages show their
   * own errors, and the next event or reconnect fixes the rest.
   */
  async function resync(): Promise<void> {
    const requestedAt = Date.now();
    const tasks: Promise<unknown>[] = [];

    if (options.tracking) {
      tasks.push(
        trackingApi
          .getActiveEVs()
          .then((evs) => dispatch(evsSnapshotReceived(evs, requestedAt)))
      );
    }

    if (options.signals) {
      tasks.push(
        signalApi
          .getSignals()
          .then((signals) => dispatch(signalsReceived(signals, requestedAt)))
      );
    }

    if (options.notifications) {
      tasks.push(
        notificationApi.getNotifications().then((result) =>
          dispatch(
            notificationsReceived({
              items: result.items,
              unreadCount: result.unreadCount,
            })
          )
        )
      );
    }

    if (options.emergencies) {
      tasks.push(
        emergencyApi
          .getEmergencies({
            status: "active",
            page: 1,
            pageSize: RESYNC_EMERGENCY_PAGE_SIZE,
          })
          .then((page) => {
            dispatch(emergenciesReceived(page.data));

            // The slice only adds and updates. An emergency that finished
            // during the outage is missing from this list but still held as
            // active, so load those individually. Only possible when the list
            // is complete.
            if (page.total > page.data.length) return;

            const listed = new Set(page.data.map((e) => e.id));
            Object.values(store.getState().emergency.entities)
              .filter((e) => isActiveStatus(e.status) && !listed.has(e.id))
              .slice(0, MAX_REFETCH_AFTER_RESYNC)
              .forEach((e) => fetchEmergency(e.id));
          })
      );
    }

    await Promise.allSettled(tasks);
  }

  function dispose(): void {
    disposed = true;
  }

  return { handleMessage, resync, dispose };
}

/* ==========================================================================
   Wiring
   ========================================================================== */

export interface BindOptions {
  resync?: ResyncOptions;
  /**
   * Called once when the server refuses the session or the role. Check the
   * session here: if it is gone, sign out; if it is valid, the role was
   * refused and nothing more should be attempted.
   */
  onUnauthorized?: () => void;
}

/**
 * Connects a client to the store. Returns a function that undoes it, which
 * must be called on sign-out so a late response cannot put the previous
 * user's data back into the store.
 */
export function bindSocketToStore(
  client: SocketClient,
  store: SocketStore,
  options: BindOptions = {}
): () => void {
  const router = createSocketEventRouter(store, options.resync);

  const unsubscribeMessages = client.onMessage(router.handleMessage);

  const unsubscribeOpen = client.onOpen(() => {
    void router.resync();
  });

  const unsubscribeStatus = client.subscribeStatus(() => {
    const status = client.getStatus();
    store.dispatch(connectionChanged(status === "open"));

    if (status === "unauthorized") {
      try {
        options.onUnauthorized?.();
      } catch {
        /* the handler's failure must not break the connection logic */
      }
    }
  });

  // Bound after the connection was already open: nothing will announce it
  store.dispatch(connectionChanged(client.getStatus() === "open"));
  if (client.getStatus() === "open") void router.resync();

  return () => {
    unsubscribeMessages();
    unsubscribeOpen();
    unsubscribeStatus();
    router.dispose();
    store.dispatch(connectionChanged(false));
  };
}