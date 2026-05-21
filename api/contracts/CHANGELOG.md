# Product Detail contract changelog

Canonical schema: `contracts/product_detail_v1.schema.json`  
Legacy alias (same content): `api/contracts/product_v1.json`

## 1.0.0 — 2026-05-21 (DB037)

- **Frozen** Product Detail v1 field list for DB → BE → FE alignment.
- Documented mapping: `mapping/map_enriched_to_product_detail.py`.
- Validator: `mapping/validate_product_contract.py` (DB034 checks).
- Example payloads: `api/contracts/examples/*.json`.
- Sign-off record: `Documents/Database/2026 Trimester 1/DB037-API-LOCK.md`.

### Breaking change policy (after 1.0.0)

- Add optional fields only in a **minor** bump (e.g. 1.1.0) with FE/BE agreement.
- Rename or remove fields only in **v2** with migration notes.
- Run `python -m pytest test/test_db037_contract_lock.py` before merging contract edits.
