import type { LatLng } from "../../types/route.types";

export interface MockSignal {
  id: string;
  name: string;
  controllerId: string;
  location: LatLng;
  enabled: boolean;
  /** A signal that has stopped responding */
  faulty: boolean;
  /**
   * Fixed time of the last heartbeat, for signals that have gone quiet.
   * Null means the controller is reporting live (computed when read).
   */
  lastHeartbeatAt: number | null;
}

/** The default the admin page shows. It can be changed there. */
export const MOCK_BUFFER_SECONDS = 60;

/** [id, name, controller, lat, lng] */
const SIGNALS = [
  ["S-101", "NH-24 / Kaushambi Crossing", "CTRL-0101", 28.6455, 77.3215],
  ["S-102", "Vaishali Metro Crossing", "CTRL-0102", 28.645, 77.34],
  ["S-103", "Vasundhara Chowk", "CTRL-0103", 28.652, 77.358],
  ["S-104", "Shakti Khand Crossing, Indirapuram", "CTRL-0104", 28.642, 77.37],
  ["S-105", "Sahibabad Industrial Crossing", "CTRL-0105", 28.669, 77.36],
  ["S-106", "Mohan Nagar Crossing", "CTRL-0106", 28.672, 77.395],
  ["S-107", "NH-9 Link Crossing", "CTRL-0107", 28.65, 77.39],
  ["S-108", "Ghaziabad ISBT Crossing", "CTRL-0108", 28.665, 77.415],
  ["S-109", "Kavi Nagar Crossing", "CTRL-0109", 28.67, 77.43],
  ["S-110", "Raj Nagar Crossing", "CTRL-0110", 28.679, 77.442],
  ["S-111", "Crossings Link Road", "CTRL-0111", 28.636, 77.412],
  ["S-112", "Meerut Road Crossing", "CTRL-0112", 28.685, 77.43],
] as const;

export function seedSignals(now: number): MockSignal[] {
  return SIGNALS.map(([id, name, controllerId, lat, lng]) => {
    // S-107 stopped reporting 21 minutes ago and is flagged as a fault
    const faulty = id === "S-107";
    // S-112 is switched off, to show the disabled state
    const enabled = id !== "S-112";

    return {
      id,
      name,
      controllerId,
      location: { lat, lng },
      enabled,
      faulty,
      lastHeartbeatAt: faulty ? now - 21 * 60_000 : null,
    };
  });
}