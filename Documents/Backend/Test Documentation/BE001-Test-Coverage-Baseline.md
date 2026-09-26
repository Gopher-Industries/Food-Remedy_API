# Backend Automated Test Coverage Baseline

**Ticket:** BE001 – Backend Automated Test Coverage Baseline
**Author:** Linda Ha

---

# Purpose

This document reviews the current backend automated tests for the key repository areas in the Food Remedy API project. It identifies what is already tested, highlights important areas with limited or no automated testing, and recommends follow-up testing tasks.

---

# Repository Area 1

## `mobile-app/__tests__/productDetailApi.test.ts`

### What is Tested

The current automated tests cover:

- Retrieving a product using its barcode.
- Product Detail API responses.
- Firestore document retrieval.
- Returning product information correctly.

### Related Backend Functionality

- Product Detail API
- Firestore product retrieval

### Current Coverage

The repository contains `mobile-app/__tests__/productDetailApi.test.ts`, which verifies product retrieval by barcode, Firestore document retrieval and Product Detail API responses.

---

# Repository Area 2

## `mobile-app/__tests__/profileSync.test.ts`

### Related Backend Service

`mobile-app/services/sync/syncProfilesServices.ts`

### Related Functions

- `fetchProfilesFromFirebase()`
- `fetchProfilesFromSQLite()`
- `saveProfilesToSQLite()`
- `syncProfilesToCloud()`
- `syncProfiles()`

### What is Tested

The current automated tests cover:

- Synchronising profiles from Firebase to SQLite.
- Synchronising profiles from SQLite to Firebase.
- Preventing duplicate profiles.
- Resolving profile conflicts.
- Handling timestamps during synchronisation.
- Keeping profile data consistent.
- Basic error handling during synchronisation.

### Current Coverage

The repository contains `mobile-app/__tests__/profileSync.test.ts`, which verifies profile synchronisation between Firebase and SQLite, duplicate prevention, conflict resolution and data consistency.

---

# Repository Area 3

## `mobile-app/services/authentication/`

### Files Reviewed

- `checkUserExists.ts`
- `registerWithEmail.ts`
- `sendPasswordReset.ts`
- `signInWithEmail.ts`
- `signOutUser.ts`
- `updatePassword.ts`

### Current Coverage

The repository contains several authentication service files. However, no dedicated automated test files were identified for these services within the `mobile-app/__tests__/` directory.

### Risk

Without dedicated automated tests, changes to the authentication services could introduce bugs in:

- User registration
- User login
- Password reset
- Password updates
- User logout

---

# Missing Test Coverage

| Priority | Repository Area | Repository Evidence | Risk |
|----------|-----------------|---------------------|------|
| **High** | Authentication Services | Authentication service files exist in `mobile-app/services/authentication/`, but no dedicated automated tests were identified. | Changes to authentication could introduce bugs in login, registration, password reset and logout functionality. |
| **Medium** | Recommendation Services | `mobile-app/services/api/recommendations.ts` exists, but no dedicated automated tests were identified. | Recommendation results may become unreliable if changes are introduced without automated testing. |
| **Medium** | SQLite Database Services | DAO files exist in `mobile-app/services/sqlDatabase/`, but no dedicated automated tests were identified. | Database operations could introduce regressions without automated testing. |

---

# Recommended Follow-up Tickets

## Priority 1 – Authentication Service Tests

Develop automated tests covering:

- User registration
- User login
- Password reset
- Password update
- User logout
- Invalid login credentials
- Duplicate email registration

---

## Priority 2 – Recommendation Service Tests

Develop automated tests covering:

- Recommendation API responses
- Valid recommendation requests
- Invalid recommendation requests
- Error handling

---

## Priority 3 – SQLite Database Service Tests

Develop automated tests covering:

- `profiles.dao.ts`
- `shoppingList.dao.ts`
- `history.dao.ts`
- `favourites.dao.ts`

---

# Summary

The repository currently includes automated backend tests for the Product Detail API and Profile Synchronisation services. These tests provide coverage for important backend functionality including product retrieval, Firestore integration and profile synchronisation.

The review also identified several areas with limited automated testing. Authentication services, Recommendation services and SQLite database services currently have no dedicated automated tests identified. Adding automated tests for these areas would improve backend reliability and reduce the risk of future regressions.

This document provides a baseline of the current backend test coverage and can be used to guide future testing work within the project.