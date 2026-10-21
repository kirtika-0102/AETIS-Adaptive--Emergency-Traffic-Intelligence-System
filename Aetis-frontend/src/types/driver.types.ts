/**
 * The two states a driver can set for their own vehicle. A vehicle on an
 * emergency cannot be switched off duty.
 *
 * Nothing imports this file yet. DriverHome.tsx and vehicleApi.ts declare the
 * same type locally and can switch to this one in a tidy-up pass.
 */
export type DutyStatus = "available" | "offline";

/**
 * The trip steps a driver reports. "dispatched" is set by the dispatcher, and
 * "completed" by closing the emergency, so neither is allowed here.
 * (emergencyApi.ts declares this locally as DriverStatus.)
 */
export type DriverTripStatus = "en_route" | "arrived";