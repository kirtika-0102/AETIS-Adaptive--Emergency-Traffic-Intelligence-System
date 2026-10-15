import { ALL_ROLES } from "../../routes/routePaths";
import type { AuthUser, UserRole } from "../../types/user.types";
import {
  ApiError,
  badResponse,
  expectRecord,
  http,
  idOf,
  str,
} from "./axiosClient";

export interface LoginCredentials {
  email: string;
  password: string;
  role: UserRole;
}

function toAuthUser(raw: unknown): AuthUser {
  const r = expectRecord(raw, "user");
  const id = idOf(r.id);
  const role = r.role;

  if (!id || typeof role !== "string" || !ALL_ROLES.includes(role as UserRole)) {
    badResponse("user");
  }

  const email = str(r.email).trim();

  return {
    id,
    name: str(r.name).trim(),
    email: email || undefined,
    role: role as UserRole,
  };
}

/**
 * LoginForm shows messages by error code. This makes the cases it knows about
 * arrive with the right code even if the backend only sent a bare status.
 * Wrong password, unknown email and wrong role must all be INVALID_CREDENTIALS,
 * so the form cannot be used to find out which accounts exist.
 */
function toLoginError(err: unknown): unknown {
  if (!(err instanceof ApiError)) return err;

  if (err.status === 401 && err.code === "UNAUTHORIZED") {
    return new ApiError({
      code: "INVALID_CREDENTIALS",
      status: 401,
      message: "Incorrect email, password or role.",
    });
  }

  if (err.code === "TIMEOUT") {
    return new ApiError({ code: "NETWORK", message: err.message });
  }

  return err;
}

export const authApi = {
  /** The server sets the session cookie; the response is the user. */
  async login(credentials: LoginCredentials): Promise<AuthUser> {
    try {
      const data = await http.post<unknown>(
        "/auth/login",
        {
          email: credentials.email,
          password: credentials.password,
          role: credentials.role,
        },
        // A 401 here means bad credentials, not an expired session
        { skipAuthRedirect: true }
      );
      return toAuthUser(data);
    } catch (err) {
      throw toLoginError(err);
    }
  },

  /**
   * Ends the session on the server. A 401 means it is already gone, which is
   * the goal, so that is not an error. Any other failure is thrown: the
   * caller should still clear local state, but the session cookie may still
   * be valid on the server.
   */
  async logout(): Promise<void> {
    try {
      await http.post("/auth/logout", undefined, { skipAuthRedirect: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      throw err;
    }
  },

  /** The startup session check. Null means nobody is signed in. */
  async getCurrentUser(): Promise<AuthUser | null> {
    try {
      const data = await http.get<unknown>("/auth/me", { skipAuthRedirect: true });
      if (data === "" || data == null) return null;
      return toAuthUser(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return null;
      throw err;
    }
  },
};