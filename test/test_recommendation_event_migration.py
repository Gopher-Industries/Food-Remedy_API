"""BE060 SQLite event queue upgrade, idempotence and deletion checks."""

import re
import sqlite3
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
V8 = re.search(
    r"RECOMMENDATION_EVENT_MIGRATION_V8 = `([^`]*)`",
    (ROOT / "mobile-app/config/recommendationEventMigration.ts").read_text(), re.S,
).group(1)


class RecommendationEventMigrationTest(unittest.TestCase):
    def test_v7_to_v8_is_idempotent_and_profile_delete_cascades(self):
        db = sqlite3.connect(':memory:')
        db.execute('PRAGMA foreign_keys=ON')
        db.executescript("""
          CREATE TABLE profiles (
            profile_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, status INTEGER NOT NULL,
            allergies_json TEXT NOT NULL);
          CREATE UNIQUE INDEX idx_profiles_owner_profile ON profiles(user_id, profile_id);
          INSERT INTO profiles VALUES ('self', 'owner', 1, '["milk"]');
          INSERT INTO profiles VALUES ('child', 'owner', 1, '[]');
          INSERT INTO profiles VALUES ('foreign', 'attacker', 1, '[]');
          PRAGMA user_version=7;
        """)
        before = db.execute('SELECT * FROM profiles ORDER BY profile_id').fetchall()
        db.executescript(V8)
        db.executescript(V8)
        db.execute('PRAGMA user_version=8')
        self.assertEqual(db.execute('PRAGMA user_version').fetchone()[0], 8)
        self.assertEqual(db.execute('SELECT * FROM profiles ORDER BY profile_id').fetchall(), before)
        db.execute("INSERT INTO recommendation_event_outbox VALUES (?,?,?,?,?,?,?)", (
            'owner', 'child', 'event_1', '{}', '2026-09-26T00:00:00Z', 0, '2026-09-26T00:00:00Z'))
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("INSERT INTO recommendation_event_outbox VALUES (?,?,?,?,?,?,?)", (
                'attacker', 'child', 'event_1', '{}', '2026-09-26T00:00:00Z', 0, '2026-09-26T00:00:00Z'))
        db.execute("DELETE FROM profiles WHERE user_id='owner' AND profile_id='child'")
        self.assertEqual(db.execute('SELECT count(*) FROM recommendation_event_outbox').fetchone()[0], 0)
        self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])


if __name__ == '__main__':
    unittest.main()
