import type { AppNotification } from "../../types/notification.types";
import {
  badResponse,
  clampInt,
  expectArray,
  expectRecord,
  finiteNumber,
  http,
  idOf,
  pathSegment,
  str,
} from "./axiosClient";

export interface NotificationsResult {
  items: AppNotification[];
  /** Server total. It can exceed items.length. Undefined if not sent. */
  unreadCount?: number;
}

export function normalizeNotification(raw: unknown): AppNotification {
  const r = expectRecord(raw, "notification");
  const id = idOf(r.id);
  const createdAt = str(r.createdAt);
  if (!id || !createdAt) badResponse("notification");

  return {
    id,
    type: (str(r.type) || "system") as AppNotification["type"],
    title: str(r.title),
    message: str(r.message),
    createdAt,
    read: r.read === true,
    urgent: r.urgent === true ? true : undefined,
    // Not checked here: the panel only follows paths that stay inside the app
    link: str(r.link).trim() || undefined,
  };
}

export const notificationApi = {
  async getNotifications(limit = 50): Promise<NotificationsResult> {
    const data = await http.get<unknown>("/notifications", {
      params: { limit: clampInt(limit, 1, 100, 50) },
    });
    const r = expectRecord(data, "notification list");

    return {
      items: expectArray(r.items, "notification list").map(normalizeNotification),
      unreadCount: finiteNumber(r.unreadCount),
    };
  },

  async markAsRead(id: string): Promise<void> {
    await http.post(`/notifications/${pathSegment(id)}/read`);
  },

  async markAllAsRead(): Promise<void> {
    await http.post("/notifications/read-all");
  },
};