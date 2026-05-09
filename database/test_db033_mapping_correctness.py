from database.clean_data.normalization.BarcodeNormalisation import BarcodeNormalisation
from mapping.map_enriched_to_product_detail import map_enriched_to_product_detail

def test_db033_reqs():
    # test barcode matching from scan payloads
    scan_variants = ["9300633714437", "09300633714437", " 9300-6337-1443-7 "]
    normalized_keys = [BarcodeNormalisation.barcode_normalise(s) for s in scan_variants]
    
    # assert all variants are in gtin-14 format
    assert len(set(normalized_keys)) == 1
    assert normalized_keys[0] == "09300633714437"
    print("Test passed for barcode matching: All scan variants are in the correct GTIN-14 format.")

    # test merged profile production
    raw_product = {
        "barcode": "9300633714437",
        "productName": "Woolworths Full Cream Milk",
        "tags": [
            {"tag": "highSugar", "confidence": 0.9}, # should be removed
            {"tag": "healthy", "confidence": 0.5}, 
            {"tag": "dairy", "confidence": 1.0}
        ]
    }
    
    # single merged profile per product
    merged_record = map_enriched_to_product_detail(raw_product)
    final_tags = merged_record["tags"]["final"]
    
    # Assert single merged profile is produced with correct mappings
    assert merged_record["barcode"] == "09300633714437"
    assert "highSugar" not in final_tags # conflict checked
    assert "healthy" in final_tags 
    assert "dairy" in final_tags
    print("Test passed for merged profile: Contradictory enrichments resolved into a single record.")

def test_db033_scan_to_seeded_record_resolution():
    # Simulate seeded/enriched catalog keyed by normalized GTIN-14.
    seeded_enriched_records = [
        {
            "barcode": "9300633714437",
            "productName": "Woolworths Full Cream Milk",
            "tags": [{"tag": "dairy", "confidence": 1.0}],
            "metadata": {"productId": "milk-001"},
        },
        {
            "barcode": "012345678905",
            "productName": "Sample UPC Product",
            "tags": [{"tag": "healthy", "confidence": 0.8}],
            "metadata": {"productId": "sample-002"},
        },
    ]

    mapped = [map_enriched_to_product_detail(p) for p in seeded_enriched_records]
    index_by_barcode = {p["barcode"]: p for p in mapped}

    # All payload variants must resolve to the exact same enriched product.
    scan_variants = [
        "9300633714437",
        "09300633714437",
        " 9300-6337-1443-7 ",
        9300633714437,
    ]
    resolved_ids = set()
    for scan in scan_variants:
        normalized = BarcodeNormalisation.barcode_normalise(scan)
        resolved = index_by_barcode.get(normalized)
        assert resolved is not None
        resolved_ids.add(resolved["metadata"]["productId"])

    assert resolved_ids == {"milk-001"}
    print("Test passed for seeded resolution: scan variants resolve to the same enriched record.")

def test_db033_barcode_edge_cases():
    assert BarcodeNormalisation.barcode_normalise("abc") == ""
    assert BarcodeNormalisation.barcode_normalise("123456789012345") == ""
    assert BarcodeNormalisation.barcode_normalise(None) == ""
    print("Test passed for barcode edge handling.")

def test_db033_mapper_missing_barcode_contract():
    mapped = map_enriched_to_product_detail({"productName": "No Barcode Product", "tags": []})
    assert mapped["barcode"] is None
    assert mapped["productName"] == "No Barcode Product"
    print("Test passed for missing barcode contract behavior.")

if __name__ == "__main__":
    test_db033_reqs()
    test_db033_scan_to_seeded_record_resolution()
    test_db033_barcode_edge_cases()
    test_db033_mapper_missing_barcode_contract()
