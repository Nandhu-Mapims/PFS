import {
  apiFetch,
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
} from "./apiClient";

export type UserRole = "admin" | "staff" | "hod";

export interface SessionUser {
  _id: string;
  username: string;
  role: UserRole;
  /** Bearer token issued by the API; sent on every authenticated request. */
  token?: string;
  /**
   * Capabilities granted to this role, as returned by the server at login.
   * These drive what the UI offers — the API re-derives and enforces them from
   * the token on every request, so tampering with them here changes nothing.
   */
  capabilities?: string[];
  departmentId?: string | null;
  departmentName?: string | null;
  serviceId?: string | null;
  serviceName?: string | null;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || "";

export async function login(
  username: string,
  password: string
): Promise<SessionUser | null> {
  try {
    // Deliberately a plain fetch: there is no token to attach yet.
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as SessionUser;
    const session: SessionUser = {
      _id: data._id,
      username: data.username,
      role: data.role,
      token: data.token,
      capabilities: data.capabilities ?? [],
      departmentId: data.departmentId ?? null,
      departmentName: data.departmentName ?? null,
      serviceId: data.serviceId ?? null,
      serviceName: data.serviceName ?? null,
    };
    writeStoredSession(session);
    return session;
  } catch {
    return null;
  }
}

export function getSession(): SessionUser | null {
  return readStoredSession() as SessionUser | null;
}

export function logout(): void {
  clearStoredSession();
}

/** True when the signed-in user holds the capability. UI hint only — the API enforces. */
export function hasCapability(capability: string): boolean {
  return Boolean(getSession()?.capabilities?.includes(capability));
}

export async function changeHodPassword(
  _userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  // The API derives the account from the bearer token, so no user id is sent —
  // passing one used to let a caller target somebody else's password.
  const response = await apiFetch(`${API_BASE_URL}/api/auth/change-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message || "Could not change password");
  }
}

export function isInternalUser(session: SessionUser | null): boolean {
  return session?.role === "staff" || session?.role === "hod";
}
