const fs = require("fs");
const path = require("path");

// Load enriched dataset once (fast lookup approach)
const enrichedPath = path.join(
  __dirname,
  "../seeding/products_enriched.json"
);

let productIndex = null;

/**
 * Build barcode → product map
 */
function buildIndex() {
  if (productIndex) return productIndex;

  const raw = fs.readFileSync(enrichedPath, "utf-8");
  const products = JSON.parse(raw);

  productIndex = new Map();

  for (const product of products) {
    if (product.barcode) {
      productIndex.set(String(product.barcode).trim(), product);
    }
  }

  return productIndex;
}

/**
 * MAIN DB036 FUNCTION
 * Maps scanned barcode → enriched product
 */
function getProductByBarcode(barcode) {
  if (!barcode) return null;

  const index = buildIndex();
  return index.get(String(barcode).trim()) || null;
}

/**
 * Optional fallback search (if barcode missing or mismatch)
 */
function searchByName(name) {
  if (!name) return null;

  const index = buildIndex();

  const lower = name.toLowerCase();

  for (const product of index.values()) {
    if (
      product.productName &&
      product.productName.toLowerCase().includes(lower)
    ) {
      return product;
    }
  }

  return null;
}

module.exports = {
  getProductByBarcode,
  searchByName
};