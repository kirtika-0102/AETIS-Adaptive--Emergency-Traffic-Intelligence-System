import type { LatLng } from "../../types/route.types";
import type { VehicleType } from "../../types/vehicle.types";

export interface MockVehicle {
  id: string;
  label: string;
  type: VehicleType;
  registrationNumber: string;
  homeBase: string;
  /** Where the vehicle sits when it is not on a trip */
  base: LatLng;
  driverId: string | null;
  /** available, dispatched, en_route, arrived or offline */
  status: string;
  retired: boolean;
}

/**
 * Bases sit beside the demo hospitals and stations in mockEmergencies.ts.
 * Statuses match the seeded trips: AMB-01 is dispatched (not started yet),
 * AMB-02 and FIRE-01 are on live trips.
 */
export function seedVehicles(): MockVehicle[] {
  return [
    {
      id: "VEH-001",
      label: "AMB-01",
      type: "ambulance",
      registrationNumber: "UP14DM1001",
      homeBase: "Demo City Hospital",
      base: { lat: 28.6643, lng: 77.4262 },
      driverId: "U-R01",
      status: "dispatched",
      retired: false,
    },
    {
      id: "VEH-002",
      label: "AMB-02",
      type: "ambulance",
      registrationNumber: "UP14DM1002",
      homeBase: "Demo Riverside Hospital",
      base: { lat: 28.6441, lng: 77.3503 },
      driverId: "U-R02",
      status: "en_route",
      retired: false,
    },
    {
      id: "VEH-003",
      label: "AMB-03",
      type: "ambulance",
      registrationNumber: "UP14DM1003",
      homeBase: "Demo Riverside Hospital",
      base: { lat: 28.6439, lng: 77.3497 },
      driverId: "U-R03",
      status: "available",
      retired: false,
    },
    {
      id: "VEH-004",
      label: "AMB-04",
      type: "ambulance",
      registrationNumber: "UP14DM1004",
      homeBase: "Demo City Hospital",
      base: { lat: 28.6637, lng: 77.4258 },
      driverId: "U-R04",
      status: "available",
      retired: false,
    },
    {
      id: "VEH-005",
      label: "FIRE-01",
      type: "fire",
      registrationNumber: "UP14DM2001",
      homeBase: "Demo Fire Station, Vasundhara",
      base: { lat: 28.6502, lng: 77.3562 },
      driverId: "U-R05",
      status: "en_route",
      retired: false,
    },
    {
      id: "VEH-006",
      label: "FIRE-02",
      type: "fire",
      registrationNumber: "UP14DM2002",
      homeBase: "Demo Fire Station, Vasundhara",
      base: { lat: 28.6498, lng: 77.3558 },
      driverId: "U-R06",
      status: "available",
      retired: false,
    },
    {
      id: "VEH-007",
      label: "PCR-11",
      type: "police",
      registrationNumber: "UP14DM3011",
      homeBase: "Demo Police Station, Kavi Nagar",
      base: { lat: 28.6707, lng: 77.4342 },
      driverId: "U-R07",
      status: "available",
      retired: false,
    },
    {
      id: "VEH-008",
      label: "PCR-12",
      type: "police",
      registrationNumber: "UP14DM3012",
      homeBase: "Demo Police Station, Kavi Nagar",
      base: { lat: 28.6703, lng: 77.4338 },
      driverId: "U-R08",
      status: "offline",
      retired: false,
    },
    {
      id: "VEH-009",
      label: "AMB-05",
      type: "ambulance",
      registrationNumber: "UP14DM1005",
      homeBase: "Demo City Hospital",
      base: { lat: 28.6641, lng: 77.4255 },
      driverId: null,
      status: "offline",
      retired: true,
    },
  ];
}