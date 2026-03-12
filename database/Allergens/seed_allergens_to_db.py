import sqlite3
from pathlib import Path
from load_allergens import load_allergens

DB_PATH = Path(__file__).with_name("allergens.db")
SCHEMA_PATH = Path(__file__).with_name("allergens_schema.sql")

def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        with open(SCHEMA_PATH, "r") as f:
            conn.executescript(f.read())

def seed_allergens():
    allergens = load_allergens()

    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.cursor()

        for allergen in allergens:
            cur.execute(
                "INSERT OR IGNORE INTO allergens(name) VALUES (?)",
                (allergen["name"],)
            )
            allergen_id = cur.lastrowid or cur.execute(
                "SELECT id FROM allergens WHERE name = ?",
                (allergen["name"],)
            ).fetchone()[0]

            for kw in allergen["keywords"]:
                cur.execute(
                    "INSERT OR IGNORE INTO allergen_keywords(allergen_id, keyword) VALUES (?, ?)",
                    (allergen_id, kw.lower())
                )

        conn.commit()

if __name__ == "__main__":
    init_db()
    seed_allergens()
    print("Allergens and keywords successfully seeded.")
