-- List all allergens
SELECT id, name FROM allergens ORDER BY name;

-- Count total allergens
SELECT COUNT(*) AS total_allergens FROM allergens;

-- Check for duplicates (should return zero rows)
SELECT name, COUNT(*)
FROM allergens
GROUP BY name
HAVING COUNT(*) > 1;
