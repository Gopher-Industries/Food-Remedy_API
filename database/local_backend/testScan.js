const { buildScanResult } = require("./scanPipeline");

const testRaw = {
  barcode: "12345",
  productName: "Milk Chocolate",
  ingredientsText: "Milk, Cocoa, Sugar",
  additivesText: "621",
  nutrition: { sugarG: 25 }
};

const testUser = {
  allergies: ["milk"],
  avoidAdditives: ["621"],
  dietPreferences: ["vegan"]
};

console.log(JSON.stringify(buildScanResult(testRaw, testUser), null, 2));
