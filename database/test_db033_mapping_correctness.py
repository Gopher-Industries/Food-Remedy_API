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

if __name__ == "__main__":
    test_db033_reqs()