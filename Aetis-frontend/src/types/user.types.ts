/** The four canonical account roles enforced by the server. */
export type UserRole =
  | "dispatcher"
  | "driver"
  | "hospital"
  | "admin";

export type UserStatus = "active" | "pending" | "suspended";

/**
 * The signed-in user as the interface knows them. Deliberately small: no
 * token (the session is an HttpOnly cookie) and no phone number.
 */
export interface AuthUser {
  id: string;
  name: string;
  email?: string;
  role: UserRole;
}

/** A row on the admin Users page */
export interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  status: UserStatus;
  /** Only verified accounts can sign in */
  verified: boolean;
  /** Dispatchers and drivers */
  employeeId?: string;
  /** Hospital, police station or fire station name, for those roles */
  organization?: string;
  /** ISO date-time. Absent when the person has never signed in. */
  lastLoginAt?: string;
  /** ISO date-time */
  createdAt: string;
}

export interface CreateUserPayload {
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  password?: string;
  hospitalId?: string;
  employeeId?: string;
  organization?: string;
}