export interface FeedbackPayload {
  patientName: string;
  department?: string;
  rating: number;
  comments: string;
  source?: "patient" | "staff" | "ai";
}

export interface BrandingSettings {
  primaryColor: string;
  pageBackgroundColor: string;
  logoDataUrl: string | null;
}

export interface CreateFeedbackResponse extends FeedbackItem {
  ticketRaised?: boolean;
}

export interface FeedbackItem extends FeedbackPayload {
  _id: string;
  status: "New" | "In Progress" | "Resolved";
  source: "patient" | "staff" | "ai";
  createdAt: string;
  updatedAt: string;
  ticketId?: string | null;
  aiSentiment?: "positive" | "neutral" | "negative" | null;
  aiUrgency?: "low" | "medium" | "high" | null;
  aiTopics?: string[];
  aiSummary?: string;
  aiAnalyzedAt?: string | null;
}

export interface FeedbackAnalytics {
  totals: {
    all: number;
    negative: number;
    aiTickets: number;
    averageRating: number;
  };
  byStatus: Array<{ status: FeedbackItem["status"]; count: number }>;
  negativeByDepartment: Array<{ department: string; count: number }>;
  submissionsByDay: Array<{ day: string; count: number }>;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || "";

export async function createFeedback(payload: FeedbackPayload): Promise<CreateFeedbackResponse> {
  const response = await fetch(`${API_BASE_URL}/api/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Could not save feedback");
  }

  return response.json();
}

export async function getFeedback(): Promise<FeedbackItem[]> {
  const response = await fetch(`${API_BASE_URL}/api/feedback`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Could not load feedback");
  }

  return response.json();
}

export async function getFeedbackById(id: string): Promise<FeedbackItem> {
  const rows = await getFeedback();
  const item = rows.find((row) => row._id === id || row.ticketId === id);
  if (!item) {
    throw new Error("Ticket not found");
  }
  return item;
}

export async function updateFeedbackStatus(
  id: string,
  status: FeedbackItem["status"]
): Promise<FeedbackItem> {
  const response = await fetch(`${API_BASE_URL}/api/feedback/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });

  if (!response.ok) {
    throw new Error("Could not update status");
  }

  return response.json();
}

export async function getFeedbackAnalytics(): Promise<FeedbackAnalytics> {
  const response = await fetch(`${API_BASE_URL}/api/analytics`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Could not load analytics");
  }

  return response.json();
}

export async function seedMockFeedback(): Promise<{
  inserted: number;
  totalFeedback: number;
}> {
  const response = await fetch(`${API_BASE_URL}/api/seed/mock-feedback`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error("Could not seed mock data");
  }
  return response.json();
}

export async function seedOpenNegativeTickets(): Promise<{
  updated: number;
  negativeWithTicket: number;
}> {
  const response = await fetch(`${API_BASE_URL}/api/seed/open-negative-tickets`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error("Could not open tickets for negative AI sentiment");
  }
  return response.json();
}

export interface Department {
  _id: string;
  name: string;
  description?: string;
  createdAt: string;
}

export async function getDepartments(): Promise<Department[]> {
  const response = await fetch(`${API_BASE_URL}/api/departments`);
  if (!response.ok) throw new Error("Could not load departments");
  return response.json();
}

export async function createDepartment(payload: {
  name: string;
  description?: string;
}): Promise<Department> {
  const response = await fetch(`${API_BASE_URL}/api/departments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || "Create failed");
  }
  return response.json();
}

export async function deleteDepartment(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/departments/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Delete failed");
}

export async function updateDepartment(
  id: string,
  payload: {
    name: string;
    description?: string;
  }
): Promise<Department> {
  const response = await fetch(`${API_BASE_URL}/api/departments/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || "Update failed");
  }
  return response.json();
}

export interface UserRow {
  _id: string;
  username: string;
  role: "admin" | "staff";
  departmentId?: { _id: string; name: string } | null;
}

export async function getUsers(): Promise<UserRow[]> {
  const response = await fetch(`${API_BASE_URL}/api/users`);
  if (!response.ok) throw new Error("Could not load users");
  return response.json();
}

export async function createUser(payload: {
  username: string;
  password: string;
  role: "admin" | "staff";
  departmentId?: string | null;
}): Promise<UserRow> {
  const response = await fetch(`${API_BASE_URL}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || "Create user failed");
  }
  return response.json();
}

export async function updateUser(
  id: string,
  payload: {
    username: string;
    role: "admin" | "staff";
    departmentId?: string | null;
    password?: string;
  }
): Promise<UserRow> {
  const response = await fetch(`${API_BASE_URL}/api/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || "Update user failed");
  }
  return response.json();
}

export async function deleteUser(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/users/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || "Delete user failed");
  }
}

export async function getBrandingSettingsApi(): Promise<BrandingSettings> {
  const response = await fetch(`${API_BASE_URL}/api/branding`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Could not load branding");
  }
  return response.json();
}

export async function saveBrandingSettingsApi(
  payload: BrandingSettings
): Promise<BrandingSettings> {
  const response = await fetch(`${API_BASE_URL}/api/branding`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || "Could not save branding");
  }
  return response.json();
}

export async function resetBrandingSettingsApi(): Promise<BrandingSettings> {
  const response = await fetch(`${API_BASE_URL}/api/branding`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || "Could not reset branding");
  }
  return response.json();
}
