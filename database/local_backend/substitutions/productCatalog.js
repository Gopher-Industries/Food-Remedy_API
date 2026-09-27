const fs = require("fs");
const path = require("path");

const DEFAULT_PRODUCTS_PATH = path.join(__dirname, "../../seeding/products_enriched.json");
const DEFAULT_ALTERNATIVES_PATH = path.join(__dirname, "../../seeding/product_alternatives_index.json");

const BROAD_CATEGORIES = new Set([
  "food", "foods", "product", "products", "grocery", "groceries", "meal", "meals",
  "dish", "dishes", "prepared-foods", "prepared-meals", "plant-based-foods-and-beverages"
]);

function normalizeCategory(value) {
  return String(value || "").trim().toLowerCase().replace(/^([a-z]{2,3}):/, "").replace(/[_\s]+/g, "-");
}

function specificCategoryKeys(product) {
  const raw = [
    ...(Array.isArray(product?.categories) ? product.categories : []),
    ...(typeof product?.category === "string" ? [product.category] : [])
  ];
  return [...new Set(raw.map(normalizeCategory).filter((value) => value && !BROAD_CATEGORIES.has(value)))].slice(-3);
}

function createProductCatalog(options = {}) {
  const productsPath = options.productsPath || DEFAULT_PRODUCTS_PATH;
  const alternativesPath = options.alternativesPath || DEFAULT_ALTERNATIVES_PATH;
  let state;

  function load() {
    if (state) return state;
    const products = options.products || JSON.parse(fs.readFileSync(productsPath, "utf8"));
    const alternatives = options.alternatives || JSON.parse(fs.readFileSync(alternativesPath, "utf8"));
    const byBarcode = new Map();
    const byCategory = new Map();

    for (const product of products) {
      const barcode = String(product?.barcode || "").trim();
      if (!barcode) continue;
      byBarcode.set(barcode, product);
      for (const key of specificCategoryKeys(product)) {
        if (!byCategory.has(key)) byCategory.set(key, []);
        byCategory.get(key).push(barcode);
      }
    }
    state = { byBarcode, byCategory, alternatives };
    return state;
  }

  function getProduct(barcode) {
    return load().byBarcode.get(String(barcode || "").trim()) || null;
  }

  function getCandidates(source, maxCandidates = 60) {
    const loaded = load();
    const sourceBarcode = String(source?.barcode || "").trim();
    const sourceCategories = specificCategoryKeys(source);
    if (!sourceBarcode || !sourceCategories.length) return [];
    const relevanceKey = sourceCategories
      .slice()
      .reverse()
      .find((key) => (loaded.byCategory.get(key) || []).some((barcode) => barcode !== sourceBarcode));
    if (!relevanceKey) return [];

    const mapped = loaded.alternatives[sourceBarcode] || source?.enrichment?.alternatives || {};
    const mappedEntries = [
      ...(Array.isArray(mapped.healthier) ? mapped.healthier.map((item) => ({ ...item, mappingType: "healthier" })) : []),
      ...(Array.isArray(mapped.similar) ? mapped.similar.map((item) => ({ ...item, mappingType: "similar" })) : [])
    ];
    const mappedByBarcode = new Map(mappedEntries.map((item) => [String(item.barcode), item]));
    const candidateBarcodes = [];
    const seen = new Set([sourceBarcode]);

    const add = (barcode) => {
      const clean = String(barcode || "").trim();
      if (!clean || seen.has(clean) || candidateBarcodes.length >= maxCandidates) return;
      seen.add(clean);
      candidateBarcodes.push(clean);
    };
    mappedEntries.forEach((item) => add(item.barcode));
    for (const barcode of loaded.byCategory.get(relevanceKey) || []) add(barcode);

    return candidateBarcodes
      .map((barcode) => {
        const product = loaded.byBarcode.get(barcode);
        if (!product) return null;
        const productName = String(product.productName || product.name || "").trim();
        if (!productName || productName.toLowerCase() === "nan") return null;
        const candidateCategories = specificCategoryKeys(product);
        const categoryOverlap = sourceCategories.filter((key) => candidateCategories.includes(key));
        if (!categoryOverlap.includes(relevanceKey)) return null;
        return { product, categoryOverlap, mapping: mappedByBarcode.get(barcode) || null };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const aMapped = a.mapping ? 1 : 0;
        const bMapped = b.mapping ? 1 : 0;
        return bMapped - aMapped || b.categoryOverlap.length - a.categoryOverlap.length;
      });
  }

  return { getProduct, getCandidates, specificCategoryKeys };
}

module.exports = { createProductCatalog, normalizeCategory, specificCategoryKeys };
