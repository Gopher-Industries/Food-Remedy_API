# DB030 Integration Testing

## Purpose

This test suite validates end-to-end integration between:

- SQLite database
- Persistence layer
- Scan pipeline
- Offline queue system
- Conflict resolution system

## Covered Components

### Database Integration
- saveUserProfile
- getUserProfile
- addShoppingItem
- updateShoppingItem
- deleteShoppingItem

### Scan Pipeline Integration
- cleanData
- getWarnings
- classifyProduct
- buildScanResult

### Queue Integration
- saveScanResult
- offline retry queue

### Conflict Resolution
- mergeScanResultWithRemote

## Run Tests

From project root:

```bash
node database/integration_tests/run_db030_tests.js
```

Or use npm script:

```bash
npm run test:db030
```

To validate DB030 backend + API/frontend data-flow checks:

```bash
npm run test:db030:full
