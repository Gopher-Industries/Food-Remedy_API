"""
DB034 - Measure Local Database Size and Search Performance

This script creates a simple SQLite product database using the
existing product JSON files and checks its size and search speed
"""

import json
import os
import sqlite3
import time

# Product files used for the test
product_files = [
    "database/seeding/products_0k_10k.json",
    "database/seeding/products_10k_20k.json",
    "database/seeding/products_20k_30k.json",
    "database/seeding/products_30k_40k.json",
    "database/seeding/products_40k_50k.json",
    "database/seeding/products_50k+.json",
]

# Name of the temporary SQLite database
test_database = "database/db034_test_products.db"

# Delete the old test database if it already exists
if os.path.exists(test_database):
    os.remove(test_database)

# Create the SQLite database
connection = sqlite3.connect(test_database)

# Create a simple products table based on the existing bootstrap.ts file
connection.execute(
    """
    CREATE TABLE products (
        barcode TEXT PRIMARY KEY,
        name TEXT,
        brand TEXT,
        allergens TEXT,
        nutrientLevels TEXT
    )
    """
)

connection.commit()

print("\nDATABASE SIZE TEST")

# Load each JSON file one at a time
for file_name in product_files:

    # Open the product file
    with open(file_name, "r", encoding="utf-8") as file:
        products = json.load(file)

    # Add each product to the SQLite database
    for product in products:

        # Get the product barcode
        barcode = str(product.get("barcode", "")).strip()

        # Skip products that do not have a barcode
        if barcode == "":
            continue

        # Get the product fields
        name = product.get("productName")
        brand = product.get("brand")

        # Convert these fields to text so SQLite can store them
        allergens = json.dumps(product.get("allergens", []))
        nutrient_levels = json.dumps(product.get("nutrientLevels", {}))

        # Add the product to the database
        connection.execute(
            """
            INSERT OR REPLACE INTO products
            (barcode, name, brand, allergens, nutrientLevels)
            VALUES (?, ?, ?, ?, ?)
            """,
            (barcode, name, brand, allergens, nutrient_levels),
        )

    # Save the products added from this file
    connection.commit()

    # Count how many products are now in the database
    product_count = connection.execute(
        "SELECT COUNT(*) FROM products"
    ).fetchone()[0]

    # Get the current database size in MB
    database_size = os.path.getsize(test_database) / 1024 / 1024

    print(f"\nFile loaded: {file_name}")
    print(f"Products stored: {product_count}")
    print(f"Database size: {database_size:.2f} MB")

print("\nBARCODE LOOKUP TEST")

# Get 5 real barcodes from the database
barcodes = connection.execute(
    "SELECT barcode FROM products LIMIT 5"
).fetchall()

# Test each barcode lookup
for barcode in barcodes:

    barcode = barcode[0]

    # Record the time before the search
    start_time = time.time()

    connection.execute(
        "SELECT * FROM products WHERE barcode = ?",
        (barcode,),
    ).fetchone()

    # Record the time after the search
    end_time = time.time()

    # Convert the search time to milliseconds
    search_time = (end_time - start_time) * 1000

    print(f"Barcode: {barcode}")
    print(f"Lookup time: {search_time:.4f} ms")

print("\nPRODUCT SEARCH TEST")

# Simple product name searches
search_terms = [
    "milk",
    "bread",
    "chocolate",
]

for search_term in search_terms:

    # Record the time before the search
    start_time = time.time()

    results = connection.execute(
        """
        SELECT barcode, name, brand
        FROM products
        WHERE name LIKE ?
        """,
        ("%" + search_term + "%",),
    ).fetchall()

    # Record the time after the search
    end_time = time.time()

    # Convert the search time to milliseconds
    search_time = (end_time - start_time) * 1000

    print(f"\nSearch: {search_term}")
    print(f"Products found: {len(results)}")
    print(f"Search time: {search_time:.4f} ms")

# Close the database when finished
connection.close()