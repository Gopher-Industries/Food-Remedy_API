-- ========================================================
-- DB008: Allergen List for AU/NZ (14 Recognised Allergens)
-- Ready-to-use SQL script for assignment
-- ========================================================

-- 1️⃣ Create the database
CREATE DATABASE IF NOT EXISTS foodremedy_db;
USE foodremedy_db;

-- 2️⃣ Create the allergen table
CREATE TABLE IF NOT EXISTS allergens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    allergen_name VARCHAR(50) NOT NULL UNIQUE,
    synonyms TEXT,
    description TEXT
);

-- 3️⃣ Insert the 14 AU/NZ allergens
INSERT INTO allergens (allergen_name, synonyms, description) VALUES
('Gluten', 'wheat, barley, rye, oats', 'Found in wheat, barley, rye, oats.'),
('Crustaceans', 'crab, lobster, prawn', 'Includes crab, lobster, prawn.'),
('Eggs', 'chicken egg, egg whites, egg yolk', 'Egg products.'),
('Fish', 'salmon, tuna, cod', 'All types of edible fish.'),
('Peanuts', 'groundnut', 'Peanut products.'),
('Soybeans', 'soya, soy', 'Soy products.'),
('Milk', 'cow milk, dairy, lactose', 'Milk and dairy products.'),
('Tree Nuts', 'almond, cashew, walnut, pecan, hazelnut, macadamia', 'All tree nuts.'),
('Sesame Seeds', 'sesame, tahini, sesame oil', 'Sesame and sesame-based products.'),
('Sulphites', 'sulphur dioxide', 'Used as preservatives in foods and beverages.'),
('Molluscs', 'clam, mussel, oyster, squid, scallop', 'All molluscs.'),
('Mustard', 'mustard seeds, mustard powder, mustard oil', 'Mustard products.'),
('Celery', 'celeriac, celery seeds, celery stalk', 'Celery products.'),
('Lupin', 'lupin flour, lupin seeds', 'Used in baked goods and flour-based products.');

-- 4️⃣ Verify table creation and data
SELECT * FROM allergens;

-- 5️⃣ Optional: Simple keyword search example
-- This can help in detection logic for recipes or warnings
-- Example: Find allergens related to "nut"
SELECT * FROM allergens
WHERE synonyms LIKE '%nut%';


-- Script complete: DB008 database, table, and allergens ready
