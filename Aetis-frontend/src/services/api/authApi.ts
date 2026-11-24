import { ALL_ROLES } from "../../routes/routePaths";
import type { AuthUser, UserRole } from "../../types/user.types";
import {
  ApiError,
  badResponse,
  expectRecord,
  http,
  idOf,
  isRecord,
  setAuthToken,
  str,
} from "./axiosClient";

export interface LoginCredentials {
  email: string;
  password: string;
  role: UserRole;
}

function toAuthUser(raw: unknown): AuthUser {
  const record = expectRecord(raw, "user");
  // The user object may be at the root or under .user (e.g. in TokenResponse)
  const r = isRecord(record.user) ? (record.user as Record<string, unknown>) : record;

  const id = idOf(r.id) || idOf(record.id);
  const rawRole = str(r.role) || str(record.role);
  const role = rawRole.trim().toLowerCase();

  if (!id || !role || !ALL_ROLES.includes(role as UserRole)) {
    badResponse("user");
  }

  const rawName = str(r.name) || str(r.full_name) || str(record.name) || str(record.full_name);
  const rawEmail = str(r.email) || str(record.email);
  const email = rawEmail.trim();

  return {
    id,
    name: rawName.trim() || id,
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

  if (err.status === 401 && (err.code === "UNAUTHORIZED" || err.code === "INVALID_CREDENTIALS")) {
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
  /** The server sets the session cookie and/or returns access_token; response is the user. */
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
      if (isRecord(data) && typeof data.access_token === "string") {
        setAuthToken(data.access_token);
      }
      return toAuthUser(data);
    } catch (err) {
      throw toLoginError(err);
    }
  },

  /**
   * Ends the session on the server and clears local token storage. A 401 means
   * it is already gone, which is the goal, so that is not an error. Any other
   * failure is thrown: the caller should still clear local state, but the
   * session cookie may still be valid on the server.
   */
  async logout(): Promise<void> {
    try {
      await http.post("/auth/logout", undefined, { skipAuthRedirect: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      throw err;
    } finally {
      setAuthToken(null);
    }
  },

  /** The startup session check. Null means nobody is signed in. */
  async getCurrentUser(): Promise<AuthUser | null> {
    try {
      const data = await http.get<unknown>("/auth/me", { skipAuthRedirect: true });
      if (data === "" || data == null) return null;
      return toAuthUser(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAuthToken(null);
        return null;
      }
      throw err;
    }
  },
};
