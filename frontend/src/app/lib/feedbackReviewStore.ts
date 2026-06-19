import type { BotConversationAnswer, PatientLookupMatch } from "./api";
import type { OutboxPayload } from "./feedbackOutbox/types";
import type { IdentificationMode, PatientIdentitySubmitFields } from "./usePatientIdentity";

export type StandardFeedbackReviewDraft = {
  kind: "standard";
  outboxId: string;
  payload: OutboxPayload;
  audioBlob: Blob | null;
  inputKind: "voice" | "type";
  rating: number;
  ratingLabel: string;
  ratingEmoji: string;
  remark: string;
  identityMode: IdentificationMode;
  lookupMatch: PatientLookupMatch | null;
};

export type BotFeedbackReviewDraft = {
  kind: "bot";
  identityFields: PatientIdentitySubmitFields;
  answers: BotConversationAnswer[];
  blobs: Blob[];
  mergedComments: string;
  remark: string;
};

export type FeedbackReviewDraft = StandardFeedbackReviewDraft | BotFeedbackReviewDraft;

let draft: FeedbackReviewDraft | null = null;

export function setFeedbackReviewDraft(next: FeedbackReviewDraft): void {
  draft = next;
}

export function patchFeedbackReviewRemark(remark: string): void {
  if (!draft) return;
  draft = { ...draft, remark };
}

export function getFeedbackReviewDraft(): FeedbackReviewDraft | null {
  return draft;
}

export function clearFeedbackReviewDraft(): void {
  draft = null;
}
