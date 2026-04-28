export type UserRole = "admin" | "staff";

export interface SessionUser {
  username: string;
  role: UserRole;
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
    const data = (await response.json()) as { username: string; role: UserRole };
    const session: SessionUser = {
      username: data.username,
      role: data.role,
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
