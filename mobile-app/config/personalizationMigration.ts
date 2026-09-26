/** BE059. Version 6 is reserved by the history migration already on main. */
export const PERSONALIZATION_MIGRATION_V7 = `
  CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_owner_profile ON profiles(user_id, profile_id);

  CREATE TABLE IF NOT EXISTS profile_preferences (
    user_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    schema_version TEXT NOT NULL CHECK (schema_version = '1.0.0'),
    payload_json TEXT NOT NULL CHECK (length(payload_json) <= 8192),
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, profile_id),
    FOREIGN KEY (user_id, profile_id) REFERENCES profiles(user_id, profile_id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_preferences_owner_updated ON profile_preferences(user_id, updated_at);

  CREATE TABLE IF NOT EXISTS saved_shopping_intents (
    user_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    intent_id TEXT NOT NULL,
    schema_version TEXT NOT NULL CHECK (schema_version = '1.0.0'),
    text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 240),
    occasion TEXT,
    convenience TEXT,
    provenance TEXT NOT NULL CHECK (provenance = 'explicit'),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    PRIMARY KEY (user_id, profile_id, intent_id),
    FOREIGN KEY (user_id, profile_id) REFERENCES profiles(user_id, profile_id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_intents_owner_updated ON saved_shopping_intents(user_id, profile_id, updated_at);
`;
