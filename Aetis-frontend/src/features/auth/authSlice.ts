import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

import type { AuthUser } from "../../types/user.types";

/**
 * "checking" is the starting state: the app is still asking the server whether
 * a session already exists (page reload, returning user). Route guards show a
 * loader during this time instead of redirecting to the login page too early.
 */
export type AuthStatus = "checking" | "authenticated" | "unauthenticated";

export interface AuthState {
  user: AuthUser | null;
  status: AuthStatus;
}

export const initialAuthState: AuthState = {
  user: null,
  status: "checking",
};

/** Only display fields can be edited on the client. id and role never change here. */
export type EditableProfile = Partial<Pick<AuthUser, "name" | "email">>;

const authSlice = createSlice({
  name: "auth",
  initialState: initialAuthState,
  reducers: {
    /** After a successful login, or after the startup session check finds a session */
    signedIn(state, action: PayloadAction<AuthUser>) {
      state.user = action.payload;
      state.status = "authenticated";
    },

    /** After logout, after the startup check finds no session, or after the server rejects the session (401) */
    signedOut(state) {
      state.user = null;
      state.status = "unauthenticated";
    },

    /** Display-only changes, such as a corrected name */
    profileUpdated(state, action: PayloadAction<EditableProfile>) {
      if (!state.user) return;

      const { name, email } = action.payload;
      if (name !== undefined) state.user.name = name;
      if (email !== undefined) state.user.email = email;
    },
  },
});

export const { signedIn, signedOut, profileUpdated } = authSlice.actions;

export const AUTH_STATE_KEY = authSlice.name;

export default authSlice.reducer;