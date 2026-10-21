export type NotificationType =
  | "emergency_incoming"
  | "emergency_assigned"
  | "vehicle_dispatched"
  | "signal_priority"
  | "signal_fault"
  | "detection"
  | "acknowledgement"
  | "emergency_completed"
  | "system";

/**
 * Titles and messages must not contain patient or caller details: the bell
 * sits in the topbar of every page, where bystanders can read it.
 */
export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  /** ISO date-time */
  createdAt: string;
  /** Kept on the server, per user */
  read: boolean;
  urgent?: boolean;
  /** An in-app path such as /hospital/emergency/EM-1042. Other links are ignored. */
  link?: string;
}