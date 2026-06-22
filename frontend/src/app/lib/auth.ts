export type UserRole = "admin" | "staff" | "hod";

export interface SessionUser {
  _id: string;
  username: string;
  role: UserRole;
  departmentId?: string | null;
  departmentName?: string | null;
  serviceId?: string | null;
  serviceName?: string | null;
}

const SESSION_KEY = "feedback_auth_session";
const API_BASE_URL = import.meta.env.VITE_API_URL || "";

export async function login(
  username: string,
  password: string
): Promise<SessionUser | null> {
  try {
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
      departmentId: data.departmentId ?? null,
      departmentName: data.departmentName ?? null,
      serviceId: data.serviceId ?? null,
      serviceName: data.serviceName ?? null,
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  } catch {
    return null;
  }
}

export function getSession(): SessionUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export function logout(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function isInternalUser(session: SessionUser | null): boolean {
  return session?.role === "staff" || session?.role === "hod";
}
