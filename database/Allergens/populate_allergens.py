import sqlite3
import json
from pathlib import Path
from load_allergens import load_allergens

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "allergens.db"


def create_table(conn):
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS allergens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            keywords_json TEXT NOT NULL
        );
        """
    )
    conn.commit()


def populate_database():
    allergens = load_allergens()  # validated data
    conn = sqlite3.connect(DB_PATH)

    try:
        create_table(conn)

        records = [
            (a["name"], json.dumps(a["keywords"], ensure_ascii=False))
            for a in allergens
        ]

        conn.executemany(
            """
            INSERT OR REPLACE INTO allergens (name, keywords_json)
            VALUES (?, ?);
            """,
            records,
        )

        conn.commit()
        print("Allergens successfully written to allergens.db")
    finally:
        conn.close()


if __name__ == "__main__":
    populate_database()




