import type { FeedbackPayload } from "../api";

export type OutboxStatus =
  | "draft"
  | "pending_sync"
  | "text_synced"
  | "syncing"
  | "completed"
  | "failed";

export type OutboxPayload = Pick<
  FeedbackPayload,
  | "patientName"
  | "department"
  | "lookupDepartment"
  | "service"
  | "rating"
  | "comments"
  | "source"
  | "submissionMode"
  | "patientRegNo"
  | "patientEncounterType"
  | "ward"
  | "ipNo"
  | "visitOrAdmissionDate"
  | "staffRemarks"
>;

export interface FeedbackOutboxEntry {
  id: string;
  status: OutboxStatus;
  createdAt: number;
  updatedAt: number;
  attempts: number;
  lastError?: string;
  serverFeedbackId?: string;
  audioUploaded: boolean;
  payload: OutboxPayload;
  /** Present for voice submissions */
  hasAudio?: boolean;
  thankYouState?: {
    rating: number;
    fromStaffSession: boolean;
    aiSummary?: string;
    aiSentiment?: string;
    aiUrgency?: string;
    aiTopics?: string[];
  };
}

export type SyncOneResult =
  | { outcome: "completed"; entry: FeedbackOutboxEntry; response?: Record<string, unknown> }
  | { outcome: "text_synced"; entry: FeedbackOutboxEntry; response?: Record<string, unknown> }
  | { outcome: "retry"; entry: FeedbackOutboxEntry }
  | { outcome: "failed"; entry: FeedbackOutboxEntry };
