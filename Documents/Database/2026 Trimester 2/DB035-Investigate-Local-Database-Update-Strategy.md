# DB035 – Local Database Update Strategy Investigation Report

**Ticket ID:** DB035  
**Status:** Complete (Investigation Only)  
**Author:** ANJUM ASIYA  
**Target Application:** Food Remedy Mobile Application / Food Remedy API  
**Scope:** Architecture evaluation, update strategy design, versioning, network payload benchmarking, failure/rollback handling, and recommendations for updating on-device SQLite product catalogs post-release.

---

## 1. Executive Summary

This investigation evaluates post-release update strategies for the Food Remedy local SQLite product database on mobile devices. Because product catalogs evolve over time (new items added, allergen formulations updated, recalled products removed), mobile client databases require a reliable update mechanism.

### Key Takeaways
- **Evaluated Update Approaches:**
  1. **Incremental (Delta) Updates:** Server streams JSON delta payloads containing modified, added, and deleted barcode records.
  2. **Full Database Replacement:** Server builds and hosts complete pre-packaged SQLite database snapshots.
  3. **Hybrid Architecture (Recommended):** Client uses lightweight incremental updates for regular daily/weekly updates, with full database snapshot fallbacks for major release milestones or large version gaps (>50 versions behind).
- **Network Efficiency:** Incremental delta updates reduce network bandwidth usage by **~95%** (171.96 KB delta vs 3.32 MB for a 5,000 product sample, or ~40.68 MB for the full 61,373 catalog).
- **Update Safety:** Incremental updates use SQLite `SAVEPOINT` transactions to ensure 100% atomic execution. Failures trigger automatic rollback without corrupting the local catalog.
- **Non-Interference:** No production update pipeline was deployed in this ticket; all testing occurred in isolated test modules (`database/sqlite_investigation/local_db_update_strategy.py`).

---

## 2. Comprehensive Investigation Findings

### 2.1 How New Products Could Be Added
New products added to the OpenFoodFacts or Food Remedy backend catalog are assigned a normalized GTIN-14 barcode. In the local SQLite database:
- New records are included in the `added_or_updated` array of an incremental update payload.
- The client executes `INSERT OR REPLACE INTO local_products (...)` which inserts the new row along with scalar columns (`product_name`, `brand`, `category`) and serialized JSON attributes (`allergens_json`, `ingredients_json`, `nutriments_json`).

### 2.2 How Existing Products Could Be Updated
When a brand alters an ingredient list or allergen profile, or when data completeness improves:
- The backend assigns an incremented product `lastUpdated` timestamp.
- The incremental payload includes the updated `ProductDetail` record under its existing `barcode`.
- SQLite executes `INSERT OR REPLACE INTO local_products`, overwriting stale attribute columns while maintaining primary key integrity on `barcode`.

### 2.3 How Incorrect or Outdated Products Could Be Corrected
If a product is recalled, miscategorized, or removed from the catalog:
- Corrections are pushed via a dedicated `deleted_barcodes` array in the delta payload.
- The client executes `DELETE FROM local_products WHERE barcode IN (...)`.
- Tombstone records or version log entries ensure deleted products do not reappear in subsequent delta syncs.

### 2.4 Full Database Replacement vs Incremental Updates

| Comparison Dimension | Incremental (Delta) Updates | Full Database Replacement |
| :--- | :--- | :--- |
| **Network Payload Size** | **Extremely Low (~15–200 KB)** per weekly sync | **High (~40.68 MB)** for full 61.3k catalog |
| **Bandwidth Savings** | **94.94% bandwidth reduction** | 0% savings (re-downloads entire DB) |
| **Execution Speed** | **19.23 ms** for 150 record changes | **4.95 ms** for atomic file swap |
| **Client Storage Footprint** | Low (overwrites existing SQLite rows in-place) | Temporary 2x storage during file download |
| **Server Complexity** | Medium (requires tracking change log by version) | Low (serves static `.db` file via CDN) |
| **User Experience** | Seamless background update over cellular/WiFi | Requires WiFi or large download prompts |

### 2.5 Versioning of Local Product Data
Local databases track catalog state using a dedicated `catalog_metadata` key-value table:

```sql
CREATE TABLE IF NOT EXISTS catalog_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

#### Tracked Version Parameters
1. `schema_version` (integer, e.g., `1`): Tracks SQLite table structure. A schema bump forces a full snapshot download.
2. `data_version` (integer, e.g., `100` -> `101`): Incrementing sequence counter for catalog updates.
3. `last_sync_timestamp` (ISO timestamp): Timestamp of the last successful synchronization.

### 2.6 When Internet / Cloud Access Is Required
- **Offline Mode:** Scanning barcodes, searching local products, and evaluating user profile allergen rules operate **100% offline** without internet.
- **Online Requirements:**
  1. Periodically checking the API endpoint (`GET /api/catalog/updates/check?current_version=100`).
  2. Downloading incremental delta JSON payloads or full snapshot files.
  3. Querying cloud Firestore fallback when a scanned barcode is missing from the local database.

### 2.7 How Updates Could Remain Lightweight for Users
1. **Background Syncing:** Fetch updates when the device is idle, connected to WiFi, or charging.
2. **Gzip / Brotli Compression:** Compress delta payloads (reducing 172 KB JSON to ~35 KB over HTTP).
3. **Batch Delta Chunking:** Cap delta payloads to a maximum of 500 changes per request.

---

## 3. Failure, Rollback & Safety Scenarios

### Scenario A: Network Interruption During Delta Download
- **Risk:** Incomplete JSON delta payload received by client.
- **Mitigation:** JSON parser validates payload integrity (`from_version`, `to_version`, array fields) before executing SQL statements.

### Scenario B: Database Write Error / Corrupt Payload
- **Risk:** Partial database update leaving catalog in an inconsistent state.
- **Mitigation:** Updates execute inside an explicit SQLite `SAVEPOINT delta_sp;`. Any exception triggers `ROLLBACK TO delta_sp;`, restoring the exact pre-update state:

```python
self.conn.execute("SAVEPOINT delta_sp;")
try:
    # 1. Apply product upserts
    # 2. Apply barcode deletions
    # 3. Update data_version metadata
    self.conn.execute("RELEASE delta_sp;")
except Exception:
    self.conn.execute("ROLLBACK TO delta_sp;")
    self.conn.execute("RELEASE delta_sp;")
    return False
```

### Scenario C: Version Mismatch (Client Out-of-Sync)
- **Risk:** Client at version 90 requests delta, but server only retains deltas from version 95 onwards.
- **Mitigation:** Server responds with `HTTP 409 Conflict` (Version Out of Range). Client falls back to a Full Database Snapshot replacement.

---

## 4. Empirical Testing & Benchmark Results

Empirical benchmarks were executed via `database/sqlite_investigation/benchmark_db035.py` and `database/test_db035_update_strategy.py`.

### Benchmark Results Summary

| Benchmark Metric | Strategy A: Incremental Delta | Strategy B: Full DB Replacement | Impact / Difference |
| :--- | :--- | :--- | :--- |
| **Payload Size (5k DB sample)** | **171.96 KB** | **3.32 MB** | **94.94% Network Bandwidth Savings** |
| **Payload Size (61.3k Full DB)** | **~250 KB (est)** | **~40.68 MB** | **99.38% Network Bandwidth Savings** |
| **Execution Duration** | 19.23 ms | 4.95 ms | Both complete in sub-20 ms |
| **Atomic Safety** | SQLite `SAVEPOINT` Rollback | Pre-check + `os.replace` swap | 100% rollback safe |

### Test Suite Verification
All **14 database tests** (5 DB035 tests + 9 DB033 tests) passed cleanly:
- `test_version_metadata_initialization`: PASSED
- `test_incremental_delta_add_update_delete`: PASSED
- `test_incremental_delta_version_mismatch`: PASSED
- `test_transaction_rollback_on_failure`: PASSED
- `test_full_replacement_atomic_swap`: PASSED

---

## 5. Implementation Recommendations

1. **Adopt a Hybrid Update Model:**
   - Use **Incremental Delta Sync** (`GET /api/catalog/deltas?since_version=X`) as the primary update path.
   - Use **Full Snapshot Download** as a fallback for app fresh installs, long-unupdated apps (>50 versions behind), or schema migrations (`schema_version` bump).
2. **Deploy Gzip Payload Compression:** Compress REST delta JSON payloads to minimize mobile data usage.
3. **Use SQLite Savepoints:** Always execute local client database updates within a `SAVEPOINT` transaction to guarantee zero data corruption.

---

*Report prepared for DB035 ticket completion.*
