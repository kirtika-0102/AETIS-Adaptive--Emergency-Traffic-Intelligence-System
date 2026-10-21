/**
 * A point on the map. Always { lat, lng }, never a [lng, lat] array: routing
 * services often return GeoJSON order, and the api layer converts it.
 */
export interface LatLng {
  lat: number;
  lng: number;
}

/** One stretch of a trip, such as "to the scene" */
export interface RouteLeg {
  points: LatLng[];
  /** NaN when unknown */
  distanceMeters: number;
  /** NaN when unknown */
  durationSeconds: number;
}

export interface RoutePlan {
  emergencyId: string;
  /** Null once the vehicle has reached the scene */
  toScene: RouteLeg | null;
  /** Null for police and fire emergencies, which have no second stretch */
  toDestination: RouteLeg | null;
  destinationName?: string;
  /** Seconds until the end of the route. NaN when unknown. */
  etaSeconds: number;
  /** ISO date-time */
  calculatedAt?: string;
}