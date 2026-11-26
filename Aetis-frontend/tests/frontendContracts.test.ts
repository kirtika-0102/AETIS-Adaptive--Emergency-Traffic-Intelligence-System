import assert from "node:assert/strict";
import test from "node:test";
import { configureStore } from "@reduxjs/toolkit";

import emergencyReducer from "../src/features/emergency/emergencySlice";
import notificationReducer from "../src/features/notificationSlice";
import signalReducer from "../src/features/signalSlice";
import trackingReducer from "../src/features/trackingSlice";
import vehicleReducer from "../src/features/vehicleSlice";
import { ALL_ROLES, DESTINATION_ROLES, ROLE_HOME } from "../src/routes/routePaths";
import { apiClient } from "../src/services/api/axiosClient";
import { normalizeEmergency } from "../src/services/api/emergencyApi";
import { normalizeSignal } from "../src/services/api/signalApi";
import { normalizeEV } from "../src/services/api/trackingApi";
import { createSocketEventRouter, SOCKET_EVENTS } from "../src/services/websocket/socketEvents";

test("FE-002: canonical role surface contains all 6 backend roles", () => {
  assert.deepEqual([...ALL_ROLES].sort(), [
    "admin",
    "dispatcher",
    "driver",
    "fire",
    "hospital",
    "police",
  ]);
  assert.deepEqual([...DESTINATION_ROLES], ["hospital", "police", "fire"]);
  assert.equal(ROLE_HOME.hospital, "/hospital/dashboard");
  assert.equal(ROLE_HOME.police, "/hospital/dashboard");
  assert.equal(ROLE_HOME.fire, "/hospital/dashboard");
});

test("SEC-004: axios client enforces HttpOnly cookie + CSRF double-submit defaults", () => {
  assert.equal(apiClient.defaults.withCredentials, true);
  assert.equal(apiClient.defaults.xsrfCookieName, "csrf_token");
  assert.equal(apiClient.defaults.xsrfHeaderName, "X-CSRF-Token");
  assert.equal(apiClient.defaults.withXSRFToken, true);
});

test("INT-001: API normalizers handle canonical FastAPI payloads", () => {
  const emg = normalizeEmergency({
    id: "EMG-10",
    title: "Highway Crash",
    type: "medical",
    severity: "CRITICAL",
    status: "IN_TRANSIT",
    pickup_latitude: 28.66,
    pickup_longitude: 77.44,
    pickup_address: "NH-24",
    created_at: "2026-11-25T10:00:00Z",
    assigned_vehicle_id: "AMB-01",
    destination_hospital_id: "HOSP-CITY",
  });
  assert.equal(emg.status, "en_route");
  assert.equal(emg.severity, "critical");
  assert.equal(emg.location.address, "NH-24");
  assert.equal(emg.assignedVehicleId, "AMB-01");
  assert.equal(emg.destinationHospitalId, "HOSP-CITY");

  const sig = normalizeSignal({
    id: "SIG-101",
    name: "Central Crossing",
    latitude: 12.97,
    longitude: 77.59,
    current_phase: "GREEN",
    is_preempted: true,
    preemption_end_time: "2026-11-25T10:05:00Z",
  });
  assert.equal(sig.status, "priority");
  assert.equal(sig.location.lat, 12.97);
  assert.ok(Number.isFinite(sig.expectedArrivalAt));

  const ev = normalizeEV({
    emergency_id: "EMG-10",
    vehicle_id: "AMB-01",
    latitude: 12.971,
    longitude: 77.592,
    speed: 55,
    eta_seconds: 180,
  });
  assert.equal(ev.emergencyId, "EMG-10");
  assert.equal(ev.speedKmh, 55);
  assert.equal(ev.etaSeconds, 180);
});

test("INT-002: WebSocket event router accepts both canonical and backend event names", () => {
  const store = configureStore({
    reducer: {
      emergency: emergencyReducer,
      tracking: trackingReducer,
      signals: signalReducer,
      vehicles: vehicleReducer,
      notifications: notificationReducer,
    },
  });

  const router = createSocketEventRouter(store);

  router.handleMessage({
    type: SOCKET_EVENTS.EV_UPDATED,
    data: {
      emergencyId: "EMG-10",
      vehicleId: "AMB-01",
      vehicleLabel: "AMB-01",
      vehicleType: "ambulance",
      location: { lat: 12.97, lng: 77.59 },
      speedKmh: 40,
      etaSeconds: 200,
    },
  });
  router.handleMessage({
    type: "tracking:location_update",
    data: {
      emergency_id: "EMG-10",
      latitude: 12.972,
      longitude: 77.595,
      speed: 62,
      eta_seconds: 120,
    },
  });

  const ev = store.getState().tracking.entities["EMG-10"];
  assert.equal(ev.location.lat, 12.972);
  assert.equal(ev.speedKmh, 62);
  assert.equal(ev.etaSeconds, 120);

  router.handleMessage({
    type: SOCKET_EVENTS.SIGNAL_ROUTE,
    data: {
      emergencyId: "EMG-10",
      signals: [
        {
          id: "SIG-101",
          name: "Junction 4",
          latitude: 12.9716,
          longitude: 77.5946,
          current_phase: "RED",
          is_preempted: false,
        },
      ],
    },
  });
  assert.equal(store.getState().signals.routes["EMG-10"][0].signalId, "SIG-101");

  router.handleMessage({
    type: "signal:preemption_triggered",
    data: { signal_id: "SIG-101", is_preempted: true },
  });
  assert.equal(store.getState().signals.entities["SIG-101"].status, "priority");
  router.dispose();
});
