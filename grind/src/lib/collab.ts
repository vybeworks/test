export type CollabCategory =
  | "verse_feature"
  | "cover_swap"
  | "challenge_partner"
  | "production_swap"
  | "feedback_exchange"
  | "other";

export const COLLAB_CATEGORIES: { key: CollabCategory; label: string }[] = [
  { key: "verse_feature", label: "Verse / Feature" },
  { key: "cover_swap", label: "Cover Swap" },
  { key: "challenge_partner", label: "Challenge Partner" },
  { key: "production_swap", label: "Production Swap" },
  { key: "feedback_exchange", label: "Feedback Exchange" },
  { key: "other", label: "Other" },
];

export type ContactMethod = "instagram" | "email" | "tiktok" | "discord" | "other";

export const CONTACT_METHODS: { key: ContactMethod; label: string }[] = [
  { key: "instagram", label: "Instagram" },
  { key: "email", label: "Email" },
  { key: "tiktok", label: "TikTok" },
  { key: "discord", label: "Discord" },
  { key: "other", label: "Other" },
];

/** Matches the trigger-enforced cap in 0018_collab_board.sql - kept in sync manually, not derived. */
export const MAX_OPEN_COLLAB_POSTS = 3;
