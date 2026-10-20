import type { SeverityLevel } from "../../styles/theme";
import type {
  Emergency,
  EmergencyType,
  PatientGender,
} from "../../types/emergency.types";
import type { LatLng } from "../../types/route.types";
import { createRng, hashString, haversineMeters } from "./mockTracking";

/* ==========================================================================
   Destinations (demo hospitals and stations)
   ========================================================================== */

export interface MockDestination {
  id: string;
  name: string;
  kind: "hospital" | "police" | "fire";
  location: LatLng;
}

export const MOCK_DESTINATIONS: MockDestination[] = [
  {
    id: "DEST-H1",
    name: "Demo City Hospital",
    kind: "hospital",
    location: { lat: 28.664, lng: 77.426 },
  },
  {
    id: "DEST-H2",
    name: "Demo Riverside Hospital",
    kind: "hospital",
    location: { lat: 28.644, lng: 77.35 },
  },
  {
    id: "DEST-P1",
    name: "Demo Police Station, Kavi Nagar",
    kind: "police",
    location: { lat: 28.6705, lng: 77.434 },
  },
  {
    id: "DEST-F1",
    name: "Demo Fire Station, Vasundhara",
    kind: "fire",
    location: { lat: 28.65, lng: 77.356 },
  },
];

const KIND_FOR_TYPE: Record<EmergencyType, MockDestination["kind"]> = {
  medical: "hospital",
  police: "police",
  fire: "fire",
};

/** The nearest hospital, police station or fire station for this type of emergency */
export function pickDestination(type: EmergencyType, from: LatLng): MockDestination {
  const pool = MOCK_DESTINATIONS.filter((d) => d.kind === KIND_FOR_TYPE[type]);

  return pool.reduce((best, d) =>
    haversineMeters(from, d.location) < haversineMeters(from, best.location)
      ? d
      : best
  );
}

/* ==========================================================================
   Pretend geocoding for addresses typed without coordinates
   ========================================================================== */

const AREA = { south: 28.636, north: 28.686, west: 77.325, east: 77.445 };

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

/**
 * The same address always lands on the same spot inside the demo area, so
 * routes and signals still work. A real backend would call a geocoding API.
 */
export function mockGeocode(address: string): LatLng {
  const rng = createRng(hashString(address.trim().toLowerCase()));

  return {
    lat: round5(AREA.south + rng() * (AREA.north - AREA.south)),
    lng: round5(AREA.west + rng() * (AREA.east - AREA.west)),
  };
}

/* ==========================================================================
   Records
   ========================================================================== */

export interface MockPatient {
  name?: string;
  age?: number;
  gender?: PatientGender;
  condition: string;
  vitals?: { label: string; value: string }[];
  notes?: string;
  requiredResources: string[];
}

/** An emergency as the mock server stores it: the public fields plus internal ones */
export interface MockEmergency extends Emergency {
  patient?: MockPatient;
  vehicleId?: string;
  destinationId?: string;
  dispatchedAt?: number;
  arrivedAt?: number;
  acknowledgedAt?: number;
  outcome?: string;
}

/** Only what any signed-in viewer of an emergency may see */
export function toPublicEmergency(e: MockEmergency): Emergency {
  return {
    id: e.id,
    type: e.type,
    severity: e.severity,
    status: e.status,
    callerName: e.callerName,
    callerPhone: e.callerPhone,
    description: e.description,
    location: {
      address: e.location.address,
      lat: e.location.lat,
      lng: e.location.lng,
    },
    createdAt: e.createdAt,
    responseSeconds: e.responseSeconds,
  };
}

/**
 * Hospitals, police and fire stations do not need the caller's identity, so
 * it is left out entirely, not just hidden on screen.
 */
export function toAlertEmergency(e: MockEmergency): Emergency {
  return { ...toPublicEmergency(e), callerName: "", callerPhone: "" };
}

/* ==========================================================================
   Seed data
   ========================================================================== */

/**
 * How long ago each seeded trip was started. Null means dispatched but the
 * driver has not pressed "Start trip" yet.
 */
export const MOCK_SEED_TRIP_STARTS: Record<string, number | null> = {
  "EM-1001": 90_000,
  "EM-1002": 40_000,
  "EM-1003": null,
};

const MIN = 60_000;

const PLACES: ReadonlyArray<{ address: string; lat: number; lng: number }> = [
  { address: "Shakti Khand 2 Market, Indirapuram", lat: 28.6428, lng: 77.3735 },
  { address: "Vaishali Sector 5 Main Road", lat: 28.647, lng: 77.342 },
  { address: "Near ISBT Crossing, Ghaziabad", lat: 28.6655, lng: 77.412 },
  { address: "Kavi Nagar Market", lat: 28.6742, lng: 77.4335 },
  { address: "Raj Nagar Extension Service Road", lat: 28.6805, lng: 77.439 },
  { address: "Mohan Nagar Flyover Service Lane", lat: 28.6725, lng: 77.3975 },
  { address: "Vasundhara Sector 1, Plot 14", lat: 28.6535, lng: 77.36 },
  { address: "Sahibabad Industrial Area, Site 4", lat: 28.67, lng: 77.365 },
  { address: "NH-9 Link Road near Crossings", lat: 28.6498, lng: 77.3935 },
  { address: "Kaushambi Bus Depot Road", lat: 28.646, lng: 77.324 },
];

const CALLERS = [
  "Anita Rao",
  "Sanjay Mehta",
  "Priya Nair",
  "Manoj Khanna",
  "Kavita Arora",
  "Rahul Saxena",
  "Suman Pillai",
  "Arjun Das",
];

const DESCRIPTIONS: Record<EmergencyType, string[]> = {
  medical: [
    "Person fell and cannot stand.",
    "Complaint of severe stomach pain.",
    "Road accident, one person injured.",
  ],
  fire: [
    "Small fire reported in a shop.",
    "Smoke coming from a building basement.",
    "Vehicle on fire at the roadside.",
  ],
  police: [
    "Argument between two groups on the road.",
    "Unattended bag reported near a bus stop.",
    "Minor road accident, traffic blocked.",
  ],
};

const CONDITIONS = [
  "Leg injury after a fall",
  "Abdominal pain",
  "Minor head injury",
];

const TYPES: EmergencyType[] = ["medical", "fire", "police"];
const SEVERITIES: SeverityLevel[] = ["high", "medium", "low", "critical"];

export function seedEmergencies(now: number): MockEmergency[] {
  const iso = (ms: number) => new Date(ms).toISOString();

  const active: MockEmergency[] = [
    {
      id: "EM-1001",
      type: "medical",
      severity: "high",
      status: "en_route",
      callerName: "Rohit Bansal",
      callerPhone: "9000000101",
      description:
        "Elderly man collapsed at a market stall, conscious but struggling to breathe.",
      location: { address: PLACES[0].address, lat: PLACES[0].lat, lng: PLACES[0].lng },
      createdAt: iso(now - 7 * MIN),
      patient: {
        name: "Not known",
        age: 68,
        gender: "male",
        condition: "Breathing difficulty and chest tightness",
        vitals: [
          { label: "Heart rate", value: "112 bpm" },
          { label: "Oxygen saturation", value: "91%" },
        ],
        requiredResources: ["Oxygen support", "Cardiac team"],
      },
      vehicleId: "VEH-002",
      destinationId: "DEST-H2",
      dispatchedAt: now - 6.5 * MIN,
    },
    {
      id: "EM-1002",
      type: "fire",
      severity: "critical",
      status: "en_route",
      callerName: "Meera Iyer",
      callerPhone: "9000000102",
      description: "Smoke visible from a warehouse, workers are evacuating.",
      location: { address: PLACES[7].address, lat: PLACES[7].lat, lng: PLACES[7].lng },
      createdAt: iso(now - 5 * MIN),
      vehicleId: "VEH-005",
      destinationId: "DEST-F1",
      dispatchedAt: now - 4.5 * MIN,
    },
    {
      id: "EM-1003",
      type: "medical",
      severity: "medium",
      status: "dispatched",
      callerName: "Deepa Menon",
      callerPhone: "9000000103",
      description: "Woman fell from a ladder while cleaning, cannot put weight on one leg.",
      location: { address: PLACES[3].address, lat: PLACES[3].lat, lng: PLACES[3].lng },
      createdAt: iso(now - 3 * MIN),
      patient: {
        name: "Not known",
        age: 34,
        gender: "female",
        condition: "Fall from a ladder, suspected leg fracture",
        requiredResources: ["Trauma team"],
      },
      vehicleId: "VEH-001",
      destinationId: "DEST-H1",
      dispatchedAt: now - 2 * MIN,
    },
    {
      id: "EM-1004",
      type: "police",
      severity: "low",
      status: "pending",
      callerName: "Harish Bhatia",
      callerPhone: "9000000104",
      description: "Argument between two drivers after a minor collision.",
      location: { address: PLACES[2].address, lat: PLACES[2].lat, lng: PLACES[2].lng },
      createdAt: iso(now - 90_000),
    },
    {
      id: "EM-1005",
      type: "medical",
      severity: "critical",
      status: "pending",
      callerName: "Unknown",
      callerPhone: "9000000105",
      description: "Two-wheeler collision, two people injured, one not responding.",
      location: { address: PLACES[8].address, lat: PLACES[8].lat, lng: PLACES[8].lng },
      createdAt: iso(now - 40_000),
      patient: {
        condition: "Two injured, one unconscious",
        requiredResources: ["Trauma team", "ICU bed", "Blood bank"],
      },
    },
  ];

  // Sixteen finished emergencies, oldest about five days ago
  const history: MockEmergency[] = [];

  for (let i = 0; i < 16; i++) {
    const rng = createRng(hashString(`history-${i}`));
    const type = TYPES[i % 3];
    const place = PLACES[i % PLACES.length];
    const cancelled = i % 9 === 4;
    const descriptions = DESCRIPTIONS[type];

    history.push({
      id: `EM-${String(985 + i).padStart(4, "0")}`,
      type,
      severity: SEVERITIES[(i + 1) % SEVERITIES.length],
      status: cancelled ? "cancelled" : "completed",
      callerName: CALLERS[i % CALLERS.length],
      callerPhone: `90000002${String(i).padStart(2, "0")}`,
      description: descriptions[i % descriptions.length],
      location: { address: place.address, lat: place.lat, lng: place.lng },
      createdAt: iso(now - (4 * 60 + i * 7 * 60) * MIN),
      responseSeconds: cancelled ? undefined : 280 + Math.floor(rng() * 520),
      patient:
        type === "medical"
          ? {
              condition: CONDITIONS[i % CONDITIONS.length],
              requiredResources: [],
            }
          : undefined,
    });
  }

  return [...active, ...history];
}