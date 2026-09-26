export const RECOMMENDATION_EVENT_MIGRATION_V8 = `
  CREATE TABLE IF NOT EXISTS recommendation_event_outbox (
    user_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    payload_json TEXT NOT NULL CHECK (length(payload_json) <= 2048),
    created_at TEXT NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    next_attempt_at TEXT NOT NULL,
    PRIMARY KEY (user_id, profile_id, event_id),
    FOREIGN KEY (user_id, profile_id) REFERENCES profiles(user_id, profile_id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_recommendation_event_outbox_due
    ON recommendation_event_outbox(user_id, next_attempt_at);
`;
