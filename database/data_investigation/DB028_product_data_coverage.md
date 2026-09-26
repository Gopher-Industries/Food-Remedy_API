# DB028 – Investigate Product Data Coverage

## Objective

Investigate the coverage of the current product dataset and determine whether products available in Australian supermarkets may be missing from the database.

A real product reported by the Research Team was used as the main investigation example.

---

## Dataset Reviewed

Primary dataset:

- `database/seeding/products_enriched.json`

Current dataset statistics:

- Total products: 5,000
- Products with barcode: 5,000 (100%)
- Products with product name: 4,993 (99.86%)
- Products with brand: 3,915 (78.3%)

These results show that barcode coverage within the existing dataset is complete, while some product name and brand information is missing.

---

## Research Team Example

The Research Team reported that the following product returned "No record" in the mobile application:

**Cadbury Dairy Milk Biscoff Chocolate Block**

The current enriched dataset was searched for an exact product match using the product name and brand.

Result:

- Exact Cadbury + Biscoff matches: 0

Therefore, the reported product could not be identified in the current dataset using the available product name and brand information.

---

## Biscoff Product Comparison

To determine whether Biscoff products were generally missing from the dataset, all records containing "Biscoff" in the product name, brand, or generic name were searched.

Five products were identified:

| Barcode | Brand | Product |
|---|---|---|
| 9339687362448 | Woolworths | Biscoff Cheesecake |
| 5410126206944 | Lotus | Biscoff Crunchy |
| 9310645438481 | Coles | Biscoff Cupcake |
| 9300605156432 | Nestle | Biscoff Milkybar |
| 5410126296938 | Lotus | Biscoff Smooth |

This demonstrates that Biscoff-related products are represented in the dataset, but the specific Cadbury Dairy Milk Biscoff Chocolate Block reported by the Research Team is not present.

---

## Supermarket Coverage Testing

Representative supermarket brands were also reviewed to determine whether Coles and Woolworths products are represented in the dataset.

### Woolworths

Products with a brand containing "Woolworths":

- 168 records

Representative examples included:

- Chicken breast in a creamy mushroom sauce
- Sweet Chilli Chicken Tortilla Wrap
- Sunflower seeds
- White Sandwich Bread
- Brown sugar
- Almond Meal

### Coles

Products with a brand containing "Coles":

- 215 records

Representative examples included:

- Green Goddess Salad
- Tuna Snacks
- Cheese Triangles
- Sweet Potato Superfood Salad
- Mexican Style Salad
- Lamb Burgers

The results confirm that both major Australian supermarkets are represented in the dataset.

However, representation does not mean complete product coverage.

---

## Additional Data Quality Observations

During the investigation, some supermarket records were found with unclear or missing product names represented as `nan`.

Across the complete dataset:

- 7 of 5,000 products do not contain a usable product name.
- 1,085 of 5,000 products do not contain brand information.

These are data completeness observations and are separate from the main product coverage issue investigated in this ticket.

---

## Findings

1. The current enriched dataset contains 5,000 products.

2. Coles and Woolworths products are both represented in the dataset.

3. 215 Coles-branded records and 168 Woolworths-branded records were identified.

4. Five Biscoff-related products were found from several brands.

5. The exact Cadbury Dairy Milk Biscoff Chocolate Block reported by the Research Team was not found.

6. This provides evidence of a specific product coverage gap rather than a general inability to store or recognise Biscoff products.

7. The investigation also identified some incomplete product name and brand information.

---

## Recommendation

The current dataset should not be assumed to provide complete coverage of products available in Australian supermarkets.

Future database work should consider:

- expanding product coverage using reliable product data sources;
- validating real supermarket products against the dataset;
- recording products reported as "No record";
- using barcode-based comparison where barcode information is available;
- periodically reviewing coverage for major Australian supermarkets.

A future coverage process could use real examples reported by the Research Team to identify and prioritise missing products.

---

## Files Reviewed

- `database/seeding/products_enriched.json`

Relevant product data and existing database pipeline outputs were reviewed during the investigation.

---

## Conclusion

The investigation confirms that the current dataset contains products from major Australian supermarkets, including Coles and Woolworths, but does not provide complete product coverage.

The Cadbury Dairy Milk Biscoff Chocolate Block reported by the Research Team was not found, while five other Biscoff-related products were present.

This supports the conclusion that the reported "No record" case is consistent with a product data coverage gap in the current dataset.

No production Firestore data was modified during this investigation.