import { configureStore } from "@reduxjs/toolkit";

import authReducer from "../features/auth/authSlice";
import emergencyReducer from "../features/emergency/emergencySlice";
import notificationReducer from "../features/notificationSlice";
import signalReducer from "../features/signalSlice";
import trackingReducer from "../features/trackingSlice";
import vehicleReducer from "../features/vehicleSlice";

/**
 * The keys below must match the slice names: the hooks and the socket router
 * read state.auth, state.emergency, state.tracking, state.signals,
 * state.vehicles and state.notifications.
 */
export const store = configureStore({
  reducer: {
    auth: authReducer,
    emergency: emergencyReducer,
    tracking: trackingReducer,
    signals: signalReducer,
    vehicles: vehicleReducer,
    notifications: notificationReducer,
  },
  // The state holds caller and patient details. Redux DevTools shows all of it,
  // so it is available in development only.
  devTools: import.meta.env.DEV,
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;