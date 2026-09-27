"""SQLite v5/v6 -> v7 integrity, owner separation and cascade checks."""

import re
import sqlite3
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "mobile-app/config/personalizationMigration.ts").read_text()
MIGRATION = re.search(r"PERSONALIZATION_MIGRATION_V7 = `([^`]*)`", SOURCE, re.S).group(1)


def existing_database(version):
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys=ON")
    db.executescript("""
      CREATE TABLE profiles (profile_id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
        status INTEGER NOT NULL, allergies_json TEXT, intolerances_json TEXT,
        additives_json TEXT, dietary_form_json TEXT);
      CREATE TABLE product_favourites (user_id TEXT, barcode TEXT, PRIMARY KEY(user_id, barcode));
      CREATE TABLE product_history (barcode TEXT PRIMARY KEY);
      CREATE TABLE shopping_lists (list_id TEXT PRIMARY KEY, user_id TEXT);
      INSERT INTO profiles VALUES ('self','owner',1,'["milk"]','[]','[]','[]');
      INSERT INTO profiles VALUES ('child','owner',1,'[]','[]','[]','["Vegetarian"]');
      INSERT INTO profiles VALUES ('foreign','attacker',1,'[]','[]','[]','[]');
      INSERT INTO product_favourites VALUES ('owner','12345678');
      INSERT INTO product_history VALUES ('12345678');
      INSERT INTO shopping_lists VALUES ('list_1','owner');
    """)
    db.execute(f"PRAGMA user_version={version}")
    return db


class PersonalizationMigrationTest(unittest.TestCase):
    def test_v5_and_v6_upgrade_is_idempotent_and_preserves_safety_data(self):
        for version in (5, 6):
            with self.subTest(version=version):
                db = existing_database(version)
                before = db.execute("SELECT * FROM profiles ORDER BY profile_id").fetchall()
                db.executescript(MIGRATION)
                db.executescript(MIGRATION)
                db.execute("PRAGMA user_version=7")
                self.assertEqual(db.execute("PRAGMA user_version").fetchone()[0], 7)
                self.assertEqual(db.execute("SELECT * FROM profiles ORDER BY profile_id").fetchall(), before)
                self.assertEqual(db.execute("SELECT count(*) FROM product_favourites").fetchone()[0], 1)
                self.assertEqual(db.execute("SELECT count(*) FROM product_history").fetchone()[0], 1)
                self.assertEqual(db.execute("SELECT count(*) FROM shopping_lists").fetchone()[0], 1)
                self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_owner_scoped_rows_and_cascade(self):
        db = existing_database(5)
        db.executescript(MIGRATION)
        db.execute("INSERT INTO profile_preferences VALUES (?,?,?,?,?)", ('owner', 'self', '1.0.0', '{}', '2026-09-26T00:00:00Z'))
        db.execute("INSERT INTO profile_preferences VALUES (?,?,?,?,?)", ('owner', 'child', '1.0.0', '{}', '2026-09-26T00:00:00Z'))
        db.execute("INSERT INTO saved_shopping_intents VALUES (?,?,?,?,?,?,?,?,?,?,?)", ('owner', 'child', 'intent_1', '1.0.0', 'Lunchbox snack', 'lunchbox', None, 'explicit', '2026-09-26T00:00:00Z', '2026-09-26T00:00:00Z', None))
        with self.assertRaises(sqlite3.IntegrityError):
            db.execute("INSERT INTO profile_preferences VALUES (?,?,?,?,?)", ('attacker', 'child', '1.0.0', '{}', '2026-09-26T00:00:00Z'))
        db.execute("DELETE FROM profiles WHERE user_id='owner' AND profile_id='child'")
        self.assertEqual(db.execute("SELECT profile_id FROM profile_preferences").fetchall(), [('self',)])
        self.assertEqual(db.execute("SELECT count(*) FROM saved_shopping_intents").fetchone()[0], 0)


if __name__ == "__main__":
    unittest.main()
