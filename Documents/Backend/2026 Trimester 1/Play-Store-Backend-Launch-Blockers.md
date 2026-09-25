# Play Store Backend Launch Blockers

**Status:** Draft for ticket creation<br>
**Prepared:** 19 August 2026<br>
**Audience:** Backend, mobile, QA, DevOps, privacy, and project leads<br>
**Scope:** Existing backend behaviour that must be corrected before a public Google Play launch; database product/enrichment improvements and new product features are out of scope

## Purpose

This document turns two launch-blocking findings into epics and independently claimable tickets:

1. **Issue 1 — Product safety decisions fail open when evidence is missing.**
2. **Issue 2 — Delete Account does not reliably delete all associated account data.**

These are not feature requests. They are correctness, safety, privacy, and release-readiness work for functionality the application already exposes and promises.

Ticket identifiers below use `[BE###]`, `[FE###]`, `[DV###]`, and `[DD###]` placeholders. Before copying a ticket into Planner, replace the placeholder with the next available identifier according to `Documents/Guides/Leadership/ticket-structure.md`.

## Launch decision summary

| Issue | Severity | Primary risk | Launch gate |
| --- | --- | --- | --- |
| Issue 1 — Fail-open safety decisions | **P0 / release blocker** | A product with missing evidence can be presented as suitable, green, or allergy-safe | No incomplete product may receive a reassuring safety or nutrition result |
| Issue 2 — Incomplete account deletion | **P0 / release blocker** | Account-linked data can remain after the authentication identity is deleted | A deletion request must be authenticated, complete, retryable, verifiable, and available outside the app |

The epics are independent and can begin in parallel. Neither epic is complete when only its mobile UI is changed.

---

# Issue 1 — Server-authoritative, fail-closed product suitability

## Problem statement

Food Remedy has several separate implementations for deciding whether a product is green, suitable, healthy, or safe for a profile. These implementations frequently treat absent data as evidence that no risk exists.

For example, a product without an `allergens` field is converted to an empty allergen list. If the same product has apparently acceptable nutrient levels, the classification API can return `green` with a score of `100` for a user who has recorded allergies. The absence of a detected conflict is therefore presented as positive evidence.

This is a **fail-open** safety model:

```text
missing evidence -> no warning found -> green / suitable / safe
```

The required model is **fail closed**:

```text
missing required evidence -> insufficient data -> check the package label
```

## Why this blocks launch

- A false negative for an allergen can cause physical harm.
- The defect affects the application's core personalised product-assessment promise.
- The same unsafe assumption appears in the API, local backend pipeline, recommendation logic, and active mobile screen.
- A disclaimer does not correct a result that actively represents missing evidence as reassuring evidence.
- Google Play prohibits misleading or potentially harmful health functionality. Nutrition and dietary-management functionality falls within its health-app declaration categories.

Food Standards Australia New Zealand states that food allergies can cause serious reactions, including anaphylaxis, and requires specified allergens to be declared when present as ingredients, additives, or processing aids, however small the amount.

## Confirmed evidence in the repository

Evidence was reviewed on 19 August 2026. Line numbers may move as the repository changes.

| Location | Current behaviour | Consequence |
| --- | --- | --- |
| `mobile-app/app/api/products/classify+api.ts:39-42` | A missing allergen list is normalised to `[]` | Unknown allergen status becomes “no matched allergens” |
| `mobile-app/app/api/products/classify+api.ts:52-73` | Only exact matches against `product.allergens` cause an allergen failure | Ingredients, traces, aliases, intolerances, and dietary preferences do not prevent a green result |
| `mobile-app/app/api/products/classify+api.ts:75-123` | A product with a non-empty, apparently acceptable nutrient-level object can score `100` and return `green` after no allergen match | Missing allergen evidence can be overridden by nutrition data |
| `database/local_backend/scanPipeline.js:25-41` | Cleaning preserves ingredients, additives, and nutrition but not the product's explicit allergens or traces | Important safety evidence is discarded before classification |
| `database/local_backend/scanPipeline.js:44-63` | Allergy warnings are inferred only by substring search in ingredients | Missing or incomplete ingredient text creates no warning |
| `database/local_backend/scanPipeline.js:140-147` | No warnings means `green` | No evidence is treated as a positive result |
| `database/local_backend/scanPipeline.js:328-348` | Every classification other than red is returned as `suitability.isSafe: true` | Grey and unknown-like results can be represented as safe |
| `mobile-app/services/recommendations.ts:23-40` | A missing Nutri-Score becomes `""`; JavaScript evaluates `"" <= "B"` as true | Missing Nutri-Score can be classified as green |
| `mobile-app/services/recommendations.ts:47-70` | Missing allergen, trace, and additive data defaults to empty values, followed by `return true` | Unknown evidence becomes “safe for profile” |
| `mobile-app/services/recommendations.ts:142-163` | A green result gains 40 points and a no-match result gains “Safe for your allergies” | Fail-open products can be promoted as alternatives |
| `mobile-app/app/(app)/ProductTabs/ForYouTab.tsx:152-190` | Missing sugar, sodium, and protein become numeric zero | Missing nutrition can appear low-sugar or low-sodium |
| `mobile-app/components/product/ProductCompareSection.tsx:205-219` | No matched allergens always produces a green “No conflict found” row | No distinction exists between complete evidence and absent evidence |
| `mobile-app/app/(app)/product.tsx:130-145` | The current “For you” tab renders this client-side comparison | The unsafe path is active, not merely unused code |
| `mobile-app/__tests__/db030_api_ui_flow.test.ts:45-75` | Tests cover a known milk match and invalid barcode only | Missing evidence, traces, aliases, and conflicting evidence are not protected by regression tests |

## Minimal reproduction

Given a profile:

```json
{
  "allergies": ["milk"]
}
```

and a product:

```json
{
  "barcode": "example",
  "allergens": null,
  "nutrientLevels": {
    "sugars": "low"
  }
}
```

the current classification API can reach:

```json
{
  "colour": "green",
  "score": 100
}
```

The correct response is not “safe” or “unsafe.” It is **insufficient product evidence to assess this profile**.

## Required decision semantics

The new contract must separate evidence status from health or suitability conclusions. Suggested top-level states are:

| State | Meaning | Permitted user-facing treatment |
| --- | --- | --- |
| `CONFLICT_DETECTED` | Available evidence conflicts with a recorded allergy or hard dietary restriction | Red warning; name the matching evidence and advise checking the label |
| `NO_LISTED_CONFLICT` | The required evidence fields are present and no listed conflict was found | Neutral/cautious result; never claim that the product is universally safe |
| `INSUFFICIENT_DATA` | Required product evidence is absent, malformed, stale, or contradictory | Grey/amber “Check label” result; never green or recommended because of the missing fields |
| `NOT_APPLICABLE` | No relevant profile restriction exists for this decision dimension | Neutral result; do not imply an allergen check was performed for an empty profile |

Nutrition and allergen decisions must be distinct fields. A favourable nutrition result must never erase an allergen conflict or missing-allergen state.

Example response shape:

```json
{
  "engineVersion": "2.0.0",
  "barcode": "example",
  "overallStatus": "INSUFFICIENT_DATA",
  "allergenStatus": "INSUFFICIENT_DATA",
  "nutritionStatus": "NO_LISTED_CONFLICT",
  "evidence": {
    "allergensPresent": false,
    "ingredientsPresent": false,
    "tracesPresent": false,
    "nutritionPresent": true,
    "source": "open-food-facts",
    "sourceUpdatedAt": null
  },
  "reasons": [
    {
      "code": "ALLERGEN_EVIDENCE_MISSING",
      "severity": "warning"
    }
  ]
}
```

The precise field names should be locked in an API contract ticket before migration begins.

## Scope

### In scope

- One pure, versioned backend evaluator used by all backend/API decision paths.
- Explicit completeness and provenance checks.
- Separate allergen, diet, and nutrition decision dimensions.
- “Contains” and precautionary “may contain”/trace evidence.
- Controlled allergen normalization and aliases.
- Machine-readable reason codes; presentation copy remains a client responsibility.
- Removal or deactivation of divergent client-side decision logic.
- Contract, regression, invariant, and end-to-end tests.
- Safe rollout telemetry that does not log profile health information or other PII.

### Out of scope

- Adding more products to the source database.
- Claiming laboratory certainty or guaranteeing a product is safe to consume.
- Medical diagnosis or treatment advice.
- A new recommendation feature or redesign of the product screen.
- Rebuilding the data enrichment pipeline, except where adapters must preserve existing evidence passed to the evaluator.

## Non-negotiable safety rules

1. Missing evidence must never increase confidence or improve a classification.
2. An allergen conflict always overrides nutrition and preference results.
3. `null`, absent, empty, malformed, and explicitly verified-empty values must not be treated as the same state.
4. Missing nutrition values remain `null`; they must not become numeric zero.
5. `NO_LISTED_CONFLICT` means only that no conflict was found in sufficiently complete listed evidence. It does not mean “safe to eat.”
6. Trace or precautionary evidence must be preserved and surfaced separately from a confirmed ingredient.
7. Every decision must identify its engine version and machine-readable reasons.
8. The client displays the backend decision; it does not independently recompute it.

## Proposed tickets

### I1-T1 — `[BE###] Define the canonical product-suitability contract and architecture decision`

**Area:** Backend / solution design<br>
**Difficulty:** Level 3<br>
**Blocks:** I1-T2, I1-T3, I1-T4, I1-T5, and I1-T7

**Objective**

Define one contract and one ownership boundary for all product/profile decisions before implementation begins.

**Work**

- Inventory every current classification and recommendation entry point.
- Define input normalization, required evidence, decision states, reason codes, response versioning, and compatibility policy.
- Specify precedence between allergen, trace, dietary, additive, and nutrition outcomes.
- Decide how evidence provenance, freshness, and completeness are represented.
- Record the decision in an ADR and update/create the API contract.
- Provide fixtures demonstrating every top-level state.

**Acceptance criteria**

- [ ] The contract distinguishes `CONFLICT_DETECTED`, `NO_LISTED_CONFLICT`, `INSUFFICIENT_DATA`, and `NOT_APPLICABLE`.
- [ ] Allergen and nutrition outcomes are separate and have documented precedence.
- [ ] Missing, empty, verified-empty, malformed, and contradictory inputs have defined outcomes.
- [ ] Reason codes and versioning rules are documented.
- [ ] Backend, frontend, QA, and product leads approve the contract.
- [ ] No contract field uses `safe: boolean` as the only suitability representation.

### I1-T2 — `[BE###] Implement the pure fail-closed suitability evaluator`

**Area:** Backend<br>
**Difficulty:** Level 3<br>
**Depends on:** I1-T1

**Objective**

Implement the canonical decision engine as a deterministic, side-effect-free module.

**Work**

- Validate and normalize product and profile inputs without converting unknown values into positive evidence.
- Implement decision precedence from the approved contract.
- Keep allergen, diet, and nutrition sub-results independent.
- Return evidence completeness and reason codes with every result.
- Reject or mark malformed/contradictory data as insufficient rather than guessing.
- Ensure the module has no Firestore, UI, or network dependency so it can be tested exhaustively.

**Acceptance criteria**

- [ ] The minimal reproduction in this document returns `INSUFFICIENT_DATA`.
- [ ] Missing nutrients remain unknown and cannot produce low-sugar, low-sodium, or similar positive reasons.
- [ ] An allergen conflict cannot be overridden by a nutrition score.
- [ ] Less evidence cannot produce a more favourable status than the same product with more evidence.
- [ ] All results include the engine version and at least one reason code.
- [ ] The evaluator passes the approved fixture suite.

### I1-T3 — `[BE###] Implement allergen normalization, trace handling, and evidence matching`

**Area:** Backend<br>
**Difficulty:** Level 3<br>
**Depends on:** I1-T1

**Objective**

Replace exact-string-only matching with an auditable matcher that covers the application's supported allergen vocabulary without inventing certainty.

**Work**

- Define canonical names for all allergens Food Remedy supports.
- Map controlled aliases such as `soy`/`soya`/`soybean` and milk-derived terms such as `whey` and `casein` where approved.
- Preserve the source of each match: declared allergen, ingredient text, derived ingredient, or trace statement.
- Normalize case, prefixes, punctuation, and source-specific tags.
- Add safeguards for substring collisions, negation, translations currently supported by the product source, and malformed tokens.
- Document which relationships are exact aliases versus conservative related-term warnings.

**Acceptance criteria**

- [ ] Mandatory Australian/New Zealand declaration names are represented in the regression corpus.
- [ ] Confirmed ingredients and precautionary traces produce distinct reason codes.
- [ ] Approved aliases match consistently across every API path.
- [ ] Negative phrases such as “milk free” are not treated as confirmed “contains milk” without supporting evidence.
- [ ] Empty source fields do not produce a no-conflict result by themselves.
- [ ] Matcher changes are reviewable configuration/code changes with tests, not hidden heuristics.

### I1-T4 — `[BE###] Expose the canonical evaluator through the authenticated classification API`

**Area:** Backend / API<br>
**Difficulty:** Level 3<br>
**Depends on:** I1-T1 and I1-T2

**Objective**

Replace the current route-local classifier with the canonical evaluator and a stable API response.

**Work**

- Adapt product source records to the canonical input without discarding allergens, ingredients, traces, or provenance.
- Load the authenticated user's selected profile server-side or strictly validate an authorised profile reference.
- Do not trust a caller-supplied profile belonging to another account.
- Return appropriate 4xx responses for invalid requests and an `INSUFFICIENT_DATA` decision for valid but incomplete product evidence.
- Add API contract tests and backwards-compatibility handling for the migration period.

**Acceptance criteria**

- [ ] The API no longer contains independent scoring/classification rules.
- [ ] The authenticated caller cannot evaluate or retrieve another user's private profile by changing an identifier.
- [ ] Product adapters preserve explicit allergens, ingredients, and traces.
- [ ] Contract fixtures produce the same result through the API and direct evaluator.
- [ ] Unknown evidence returns a successful assessment response with `INSUFFICIENT_DATA`, not a fabricated green result.

### I1-T5 — `[BE###] Migrate scan and recommendation paths to the canonical evaluator`

**Area:** Backend<br>
**Difficulty:** Level 3<br>
**Depends on:** I1-T1, I1-T2, and I1-T3

**Objective**

Remove divergent safety decisions from `scanPipeline.js` and recommendation services.

**Work**

- Preserve source allergen and trace evidence during scan cleaning/adaptation.
- Replace `warnings.length === 0 -> green` behaviour.
- Replace `classification !== "red" -> isSafe` behaviour.
- Prevent incomplete candidates from receiving a positive safety boost or “Safe for your allergies” reason.
- Define how insufficient-evidence alternatives are filtered or demoted.
- Delete or clearly deprecate superseded classifiers after all consumers migrate.

**Acceptance criteria**

- [ ] Scan, classify, summary, and recommendation paths return identical safety states for the same fixture.
- [ ] No backend path infers safety from an empty warning list.
- [ ] Grey or insufficient results are never serialized as `isSafe: true`.
- [ ] Missing Nutri-Score is not green.
- [ ] Incomplete candidates are not promoted because their data is incomplete.
- [ ] A repository search finds no remaining production `safe` calculation that bypasses the canonical evaluator.

### I1-T6 — `[BE###] Build the product-safety regression and invariant test suite`

**Area:** Backend / QA automation<br>
**Difficulty:** Level 3<br>
**Depends on:** I1-T2 and I1-T3; can run in parallel with I1-T4 and I1-T5

**Objective**

Protect against false reassurance across unit, contract, and integration layers.

**Required test groups**

- Missing, `null`, empty, malformed, and contradictory evidence.
- Every supported mandatory allergen and approved alias.
- Declared “contains,” ingredient-derived, and “may contain”/trace evidence.
- Negation and substring-collision cases.
- Missing nutrition, zero nutrition, unit mismatches, non-numeric values, and partial panels.
- Conflicts where nutrition is favourable but an allergen is present.
- Parity fixtures for direct evaluator, API, scan, and recommendation paths.
- Property/invariant tests, especially: **removing evidence cannot improve a decision**.

**Acceptance criteria**

- [ ] All critical fixtures pass in CI.
- [ ] At least one regression test fails against each confirmed unsafe behaviour listed in the evidence table.
- [ ] The suite asserts both machine state and reason codes.
- [ ] Contract parity tests cover every production adapter.
- [ ] A test failure blocks merge for changes to evaluator, adapters, or reason-code contract.

### I1-T7 — `[FE###] Remove client-side safety decisions and render authoritative states`

**Area:** Frontend / backend integration<br>
**Difficulty:** Level 2<br>
**Depends on:** I1-T1 and I1-T4

**Objective**

Make the active “For you” experience display the backend assessment without recomputing missing values or safety locally.

**Work**

- Remove missing-to-zero nutrient conversion from assessment display logic.
- Replace local allergen matching with the API sub-result and reason codes.
- Render `INSUFFICIENT_DATA` as “Check the package label” or approved equivalent.
- Render `NO_LISTED_CONFLICT` without using “Safe to eat” or an unconditional green safety claim.
- Preserve offline/error/loading states without defaulting to a reassuring result.

**Acceptance criteria**

- [ ] Missing nutrients are displayed as unavailable, not zero.
- [ ] Missing allergen evidence cannot display “No conflict found,” “Good fit,” “green,” or “safe.”
- [ ] Offline and API-error states do not reuse the previous product's assessment.
- [ ] Accessibility labels communicate warnings and insufficient evidence.
- [ ] UI integration tests cover all canonical top-level states.

### I1-T8 — `[BE###] Add safety-decision observability and controlled rollout`

**Area:** Backend / DevOps<br>
**Difficulty:** Level 2<br>
**Depends on:** I1-T4, I1-T5, and I1-T6

**Objective**

Detect adapter disagreement and unexpected unknown/conflict rates during rollout without collecting unnecessary sensitive profile data.

**Work**

- Add aggregate counters for decision state, reason code, adapter, and engine version.
- Do not log raw allergy profiles, emails, UIDs, tokens, or full product/profile payloads.
- If required, shadow the new evaluator against old behaviour in a non-user-facing environment and record aggregate disagreement only.
- Define alert thresholds for evaluator errors, adapter mismatch, and sudden changes in insufficient-data rate.
- Document rollback and engine-version compatibility.

**Acceptance criteria**

- [ ] Operators can identify the deployed engine version and error rate.
- [ ] Metrics distinguish conflicts, no-listed-conflict, insufficient-data, and not-applicable states.
- [ ] Logging review confirms no raw health profile or authentication data is emitted.
- [ ] Rollback procedure is tested before production rollout.

## Issue 1 dependency order

```text
I1-T1 contract/ADR
  |-- I1-T2 evaluator ---- I1-T4 API -------- I1-T7 mobile integration
  |          |              |
  |          |              `-------------- I1-T8 rollout
  |          |                                  ^
  `-- I1-T3 matcher ------ I1-T5 migrations ---|
             `----------- I1-T6 tests ----------|
```

## Issue 1 epic definition of done

- [ ] Every production classification, scan, summary, and recommendation path uses the same evaluator and engine version.
- [ ] Incomplete allergen evidence never produces green, safe, suitable, “Good fit,” or “No conflict found.”
- [ ] Missing nutrition is never converted to zero or rewarded.
- [ ] Allergens override nutrition and preference scoring.
- [ ] Contains, trace, alias, missing, malformed, and contradiction fixtures pass in CI.
- [ ] The client renders canonical results without recomputing them.
- [ ] Safety decisions can be monitored without logging PII or health-profile content.
- [ ] The app's Play listing and in-app disclaimers accurately describe the result as informational and require users to verify the package label.
- [ ] QA and product owners sign off on the release corpus in a release-candidate build.

## Issue 1 launch test

The release candidate fails the launch gate if any of the following is possible:

- A user has an allergy and the product has no complete allergen/ingredient/trace evidence, but the app shows a positive result.
- A missing nutrient is displayed or scored as zero.
- The same product/profile fixture produces different states between scan, product details, and recommendations.
- An unauthenticated caller or a caller with another user's identifier can obtain a personalised profile assessment.
- A result uses “safe” as a synonym for “no match was detected.”

---

# Issue 2 — Complete, verifiable account and associated-data deletion

## Problem statement

The current Delete Account flow attempts to delete only:

1. profile-avatar objects targeted by `deleteUserProfilesStorage`,
2. direct documents in `USERS/{uid}/PROFILES`,
3. the parent `USERS/{uid}` document,
4. local SQLite profile rows through `ProfileProvider.clear`, and
5. the Firebase Authentication user.

Other known account-linked locations are not handled by `deleteUserAccountData`. Deleting a Firestore parent document does not delete its subcollections. The operation is also orchestrated by the mobile client, so network loss, permission errors, app termination, or authentication-state changes can leave a partially deleted account with no durable retry mechanism.

The in-app privacy text currently promises that a user can delete their account and **all associated data** and states that deleted data cannot be recovered. The implementation does not yet substantiate that promise.

## Why this blocks launch

- Google Play requires apps that allow account creation to provide an in-app deletion path and an external web resource where users can request account deletion.
- Google requires deletion of the associated user data, subject to clearly disclosed legitimate retention needs.
- The current repository contains no external account-deletion page or request flow.
- Authentication deletion can succeed even when some linked data remains.
- A client-only, multi-step destructive operation is not reliably retryable or auditable.

## Confirmed evidence in the repository

| Location | Current behaviour | Gap |
| --- | --- | --- |
| `mobile-app/services/database/user/deleteUserAccount.ts:5-30` | Deletes avatars, direct profile documents, and the `USERS/{uid}` parent only | Does not enumerate shopping lists/items, lowercase cart, feedback, or other stores |
| `mobile-app/services/database/user/shoppingLists.ts:24-29` | Stores lists at `USERS/{uid}/SHOPPING_LISTS` and items in nested `ITEMS` subcollections | These subcollections survive deletion of `USERS/{uid}` unless explicitly deleted |
| `mobile-app/app/api/shopping-cart-api/route.ts:52-68` | Reads a cart from `users/{userId}/cart` using a lowercase root | This separate account-linked collection is not part of deletion |
| `mobile-app/services/database/feedback/submitFeedback.ts:17-25` | Stores `uid` and `email` in `FEEDBACK` | Deletion/retention/anonymisation behaviour is not defined |
| `mobile-app/components/providers/ProfileProvider.tsx:252-256` | `clear()` deletes only local profile rows for the active user | Local favourites, lists/items, history, notes, active-profile keys, and other caches are not comprehensively purged |
| `mobile-app/services/sqlDatabase/favourites.dao.ts:127-135` | Provides a separate per-user favourites store and clear operation | Not called during account deletion |
| `mobile-app/config/sqlConfig.ts:50-87` | Creates history and shopping-list tables in addition to profiles and favourites | No account-deletion coordinator covers all local tables |
| `mobile-app/app/(app)/accountProfile.tsx:107-144` | The phone performs remote data deletion, local profile clear, and Auth deletion sequentially | Partial failure can leave inconsistent states; no durable job/status exists |
| `mobile-app/app/(app)/settings/privacy.tsx:92-97` | Promises deletion of the account and all associated data | Implementation and privacy promise are inconsistent |
| Repository-wide deletion-flow search | Finds only the in-app flow and privacy statement | No external web deletion request resource is implemented in this repository |

## Firestore cascade misconception

This hierarchy:

```text
USERS/{uid}
  PROFILES/{profileId}
  SHOPPING_LISTS/{listId}
    ITEMS/{barcode}
```

does not cascade merely because `USERS/{uid}` is deleted. Firestore documents and their subcollections have independent lifecycles. Each known descendant collection must be explicitly erased using a trusted recursive deletion mechanism.

## Preliminary account-data inventory

This inventory is a starting point, not permission to delete every row without an approved retention policy.

| Store | Known account key | Current deletion status | Required decision/action |
| --- | --- | --- | --- |
| Firebase Authentication | Auth UID, email | Deleted by client | Move to trusted orchestration; delete only after request is durable |
| Firestore `USERS/{uid}` | UID | Deleted | Retain in erasure manifest |
| Firestore `USERS/{uid}/PROFILES/*` | UID | Deleted directly | Retain; verify all nested descendants/storage references |
| Firestore `USERS/{uid}/SHOPPING_LISTS/*/ITEMS/*` | UID | **Not deleted** | Recursively delete items and lists |
| Firestore `users/{uid}/cart/*` | UID | **Not deleted** | Delete all cart documents; decide whether uppercase/lowercase user roots should coexist |
| Firestore `FEEDBACK/*` | UID and email fields | **Not handled** | Decide delete vs retain-and-anonymise; document lawful/product reason and retention period |
| Firebase Storage profile avatars | UID/profile IDs | Deletion attempted first | Move into idempotent executor; verify every object prefix and variant |
| SQLite `profiles` | UID | Deleted by `clear()` | Retain in local purge coordinator |
| SQLite `product_favourites` | UID | **Not deleted** | Delete rows for UID |
| SQLite `shopping_lists` and `shopping_list_items` | UID/list ID | **Not deleted by account flow** | Delete the user's lists and cascaded items |
| SQLite `product_history` | No UID in current schema | **Not deleted** | Decide whether device-wide history is associated data; purge on account deletion if the app represents it as the user's history |
| AsyncStorage active-profile key | User-scoped key | **Not deleted by `clear()`** | Remove user-scoped keys and cached assessment state |
| Firebase Auth persistence in AsyncStorage | Firebase-managed | Auth user deleted | Verify session/token state is cleared on success and failure recovery |
| Local barcode notes | Barcode key | **Not assessed** | Decide association and purge requirements |
| Analytics, crash reports, server logs, backups, exports, support tools | To be discovered | **Not evidenced in repository** | Inventory processors, identifiers, retention, deletion/anonymisation, and exceptions |

## Required deletion properties

1. **Authenticated:** the server verifies the Firebase ID token and enforces recent authentication or an approved reauthentication proof.
2. **Authoritative:** the server derives the UID from the verified token; the client cannot submit a different UID.
3. **Durable:** once accepted, the deletion request survives app termination and loss of the user's Auth identity.
4. **Idempotent:** retrying a step or the entire operation is safe.
5. **Complete:** every store in the approved erasure manifest is deleted, anonymised, or explicitly retained under policy.
6. **Ordered:** the Auth identity is not destroyed until a durable request exists and the backend can continue without the user's credentials.
7. **Observable:** operators can detect failed/stuck deletions without placing deleted PII in logs.
8. **Verifiable:** automated tests and an administrative verification procedure demonstrate that no unapproved linked data remains.
9. **Accessible:** users can start deletion in the app and through the external web resource required for the Play listing.
10. **Honest:** privacy copy and status messages match actual retention, delay, and recovery behaviour.

## Scope

### In scope

- A complete data/processor inventory and retention decision matrix.
- Trusted backend deletion request and execution.
- Firebase Auth token verification, ownership enforcement, and reauthentication requirements.
- Recursive deletion across known Firestore paths and Storage prefixes.
- Delete/anonymise actions for account-linked feedback according to approved policy.
- On-device purge of account-scoped data and caches.
- External web request flow and Play Console deletion URL.
- Retry, reconciliation, monitoring, fault injection, and verification tests.
- Updated privacy copy and an operational runbook.

### Out of scope

- Deleting shared/public product catalogue data.
- Database schema redesign unrelated to erasure.
- Data export/portability unless separately prioritised.
- Silent deletion of records that must legitimately be retained; such exceptions require an approved purpose, retention period, access restriction, and disclosure.

## Proposed tickets

### I2-T1 — `[BE###] Create the account-data inventory and erasure manifest`

**Area:** Backend / privacy engineering<br>
**Difficulty:** Level 2 if delivered with executable manifest/verification tooling; otherwise Level 1 documentation<br>
**Blocks:** I2-T2, I2-T3, I2-T4, I2-T5, I2-T6, and I2-T8

**Objective**

Establish the complete list of first-party and third-party data linked to an account and the approved action for each store.

**Work**

- Trace UID, email, profile IDs, device IDs, and other account identifiers through backend, mobile, logging, analytics, crash reporting, storage, backups, exports, and support systems.
- For each store, record owner, identifier, delete method, retention exception, maximum completion time, verification method, and failure owner.
- Resolve the uppercase `USERS` and lowercase `users` namespaces.
- Define delete vs anonymise behaviour for feedback/support records.
- Check actual deployed environments, not only repository source.
- Produce a machine-readable erasure manifest if feasible, plus the human-readable matrix.

**Acceptance criteria**

- [ ] Every known store in the preliminary inventory has an owner and approved action.
- [ ] Production services and third-party processors are included.
- [ ] Retention exceptions have purpose, duration, access control, and privacy-copy requirements.
- [ ] No store is marked “not applicable” without evidence.
- [ ] Backend, mobile, DevOps, and privacy/product owners approve the inventory.
- [ ] The manifest can drive implementation and post-deletion verification.

### I2-T2 — `[BE###] Implement the authenticated account-deletion request endpoint`

**Area:** Backend / API security<br>
**Difficulty:** Level 3<br>
**Depends on:** I2-T1

**Objective**

Accept deletion from an authenticated user without trusting client-supplied identity and persist enough state for backend completion.

**Work**

- Verify Firebase ID tokens with the Admin SDK.
- Derive the target UID from the verified token; do not accept a target UID from request body/query.
- Enforce recent authentication or the approved reauthentication flow.
- Rate-limit requests and make duplicate requests idempotent.
- Persist/queue a durable deletion request before invalidating the Auth identity.
- Return a non-sensitive request identifier and documented status semantics.
- Define cancellation policy, if any, before implementation; do not imply cancellation after irreversible deletion starts.

**Acceptance criteria**

- [ ] Unauthenticated, expired, revoked, and wrong-user requests are rejected.
- [ ] A caller cannot delete another account by changing request data.
- [ ] Duplicate submissions do not create conflicting jobs or repeated side effects.
- [ ] An accepted request continues if the app closes immediately.
- [ ] Request/response/error shapes have contract tests.
- [ ] Logs contain no raw tokens, email addresses, or profile health data.

### I2-T3 — `[BE###] Implement the idempotent account-data erasure executor`

**Area:** Backend<br>
**Difficulty:** Level 3<br>
**Depends on:** I2-T1 and I2-T2

**Objective**

Execute every approved action in the erasure manifest with Admin privileges, bounded retries, and safe step ordering.

**Work**

- Delete all direct and nested `USERS/{uid}` data, including shopping-list items before/with list deletion.
- Delete lowercase `users/{uid}/cart` data.
- Delete every approved Firebase Storage prefix/object for the account.
- Delete or anonymise feedback/support records as specified by I2-T1.
- Add adapters for any additional first-party/third-party stores found during discovery.
- Make each adapter and the overall job idempotent.
- Record step status using non-sensitive identifiers.
- Delete/disable the Firebase Authentication identity according to the approved ordering.

**Acceptance criteria**

- [ ] Every erasure-manifest entry has implemented behaviour or an explicitly approved retention adapter.
- [ ] Nested Firestore subcollections are verified empty after deletion.
- [ ] Re-running any step and the whole executor succeeds safely.
- [ ] A failure in one adapter is retryable and does not incorrectly mark the request complete.
- [ ] Auth deletion cannot prevent the backend from completing already accepted work.
- [ ] Completion is recorded only after every required adapter verifies success.

### I2-T4 — `[BE###] Add deletion status, retry, reconciliation, and monitoring`

**Area:** Backend / DevOps<br>
**Difficulty:** Level 3<br>
**Depends on:** I2-T2 and I2-T3

**Objective**

Ensure partial failures are detected and completed instead of silently leaving orphaned account data.

**Work**

- Define states such as accepted, in progress, completed, completed-with-approved-retention, and failed/retrying.
- Add bounded exponential retry and dead-letter/escalation behaviour.
- Add a scheduled reconciler for stuck or partially completed requests.
- Alert on age, repeated adapter failure, and verification mismatch.
- Define deletion service-level objective and escalation owner.
- Keep operational records pseudonymous and delete them after their approved retention window.

**Acceptance criteria**

- [ ] Killing the worker between any two steps does not lose the request.
- [ ] Stuck requests are automatically retried or escalated.
- [ ] Operators can identify the failing adapter without seeing deleted user PII.
- [ ] Completion-time and failure-rate metrics exist.
- [ ] Reconciliation detects intentionally injected orphaned data.
- [ ] The runbook explains recovery for every terminal/non-terminal state.

### I2-T5 — `[FE###] Integrate backend deletion and purge all account-scoped device data`

**Area:** Frontend / backend integration<br>
**Difficulty:** Level 3<br>
**Depends on:** I2-T1 and I2-T2

**Objective**

Replace client-orchestrated remote deletion with one authenticated backend request, then remove account-scoped data from the device.

**Work**

- Preserve the existing confirmation and reauthentication UX.
- Submit the authenticated deletion request once; do not independently delete remote collections from the client.
- Purge profiles, favourites, shopping lists/items, account-associated history, user-scoped AsyncStorage, cached assessments/recommendations, and any other approved local stores.
- Clear Firebase session persistence and prevent deleted-user data from flashing after navigation to login.
- Handle accepted-but-in-progress, offline-before-acceptance, and retryable failure states honestly.
- Do not report “Account deleted” until the contract's approved completion/acceptance point.

**Acceptance criteria**

- [ ] The client never sends a target UID that the server trusts.
- [ ] Remote deletion is not performed through direct client Firestore iteration.
- [ ] All local stores in the erasure manifest are purged for the deleted account.
- [ ] A second account on the same device does not see the deleted account's data.
- [ ] Closing/reopening the app after acceptance cannot restore the deleted session.
- [ ] Offline and partial-failure messages match actual server state.

### I2-T6 — `[DV###] Provide the external account-deletion web flow required by Google Play`

**Area:** DevOps / backend / web integration<br>
**Difficulty:** Level 3<br>
**Depends on:** I2-T1 and I2-T2

**Objective**

Publish a stable, public, non-geofenced HTTPS resource that lets a user request deletion without reinstalling the app.

**Work**

- Decide the approved identity-verification/recovery flow for web requests.
- Reuse the same backend deletion service and erasure manifest as the in-app flow.
- Protect against account-enumeration, CSRF, replay, and automated abuse.
- State what is deleted, what may be retained, the reason, and expected completion time.
- Publish the stable URL and provide it for the Play Console account-deletion field.
- Add uptime/route monitoring and an ownership/runbook entry.

**Acceptance criteria**

- [ ] The resource works without an installed app and without a pre-existing browser session.
- [ ] The requester must prove control of the account without exposing whether arbitrary emails are registered.
- [ ] It invokes the same deletion service as the app.
- [ ] It is publicly accessible over HTTPS and is not a PDF or dead-end contact statement.
- [ ] Abuse, CSRF, and replay protections have tests/review.
- [ ] The final URL is recorded in Play Console and release documentation.

### I2-T7 — `[BE###] Build account-deletion integration and fault-injection tests`

**Area:** Backend / QA automation<br>
**Difficulty:** Level 3<br>
**Depends on:** I2-T2 and I2-T3; can run in parallel with I2-T4 through I2-T6

**Objective**

Prove deletion completeness, security, idempotency, and recovery in Firebase emulators or an isolated test environment.

**Required scenarios**

- Fully populated user with profiles, nested shopping-list items, cart, feedback, avatars, and all local stores.
- Empty/minimal account.
- Duplicate deletion request.
- Wrong-user UID/body manipulation.
- Expired/revoked token and stale reauthentication.
- Worker termination before and after every adapter.
- Storage/Firestore/third-party transient and permanent failures.
- Data written during deletion and reconciliation of late/orphaned records.
- Verification that approved retention is anonymised/restricted exactly as documented.

**Acceptance criteria**

- [ ] Tests prove nested descendants are gone, not only their parent documents.
- [ ] Security tests prove cross-account deletion is impossible.
- [ ] Fault injection proves retries do not lose or falsely complete requests.
- [ ] Completion verification covers every erasure-manifest entry.
- [ ] Tests run in CI without using production accounts or credentials.
- [ ] A failed completeness assertion blocks release.

### I2-T8 — `[DD###] Align privacy disclosures, Play Console metadata, and the deletion runbook`

**Area:** Documentation / compliance coordination<br>
**Difficulty:** Level 1<br>
**Depends on:** I2-T1, I2-T4, and I2-T6

**Objective**

Make user promises and operational documentation accurately reflect implemented deletion behaviour.

**Work**

- Update in-app and hosted privacy disclosures with deletion scope, approved retention, and expected timing.
- Remove claims such as immediate deletion or irrecoverability unless they are technically true at the stated point.
- Complete the Play Console account-deletion and Data safety disclosures using the approved inventory.
- Document user-support and operational verification procedures.
- Define what evidence is retained to prove fulfilment without retaining deleted PII.

**Acceptance criteria**

- [ ] In-app and hosted privacy text matches the implemented manifest and timing.
- [ ] Play Console contains the tested external deletion URL.
- [ ] Data safety answers are reconciled with the account-data inventory.
- [ ] Support can identify request status without requesting sensitive profile information.
- [ ] The runbook covers failure, escalation, verification, and approved retention.
- [ ] Privacy/product owner approval is recorded before launch.

## Issue 2 dependency order

```text
I2-T1 inventory/manifest
  `-- I2-T2 request API
        |-- I2-T3 erasure executor -- I2-T4 retry/reconciliation
        |            |                  |
        |            `-- I2-T7 tests ---|
        |                               |
        |-- I2-T5 mobile integration    |
        `-- I2-T6 external web flow ---- I2-T8 disclosures/runbook
```

## Issue 2 epic definition of done

- [ ] The deployed data inventory and erasure manifest are approved and current.
- [ ] The in-app flow submits one authenticated, server-authoritative request.
- [ ] The server never trusts a caller-provided target UID.
- [ ] Every required store is deleted/anonymised and verified; every retention exception is documented.
- [ ] Firestore subcollections and Storage objects are explicitly erased.
- [ ] Local account data and cached session state are purged.
- [ ] Requests survive client termination and Auth identity deletion.
- [ ] Retries, reconciliation, monitoring, and fault-injection tests pass.
- [ ] The external HTTPS deletion resource works and is entered in Play Console.
- [ ] Privacy text and Data safety declarations match deployed behaviour.
- [ ] A release-candidate deletion of a fully populated test account passes the administrative verification checklist.

## Issue 2 launch test

Create a test user populated in every erasure-manifest store, request deletion through the release-candidate app, interrupt the worker once during the run, allow reconciliation to complete, and verify:

- authentication can no longer be used,
- all required Firestore documents and nested subcollections are absent,
- all required Storage objects are absent,
- retained records contain no prohibited direct identifiers and match approved retention,
- the same device contains no account-scoped profiles, lists, favourites, history, notes, or session cache,
- a second account cannot see any deleted-account data,
- the request has a non-PII completion record,
- repeating the deletion request/executor is harmless, and
- the external web flow produces the same backend outcome.

The release fails this gate if any required adapter is skipped, unverifiable, or falsely reported complete.

---

# Recommended execution order

## Immediate release freeze actions

Until Issue 1 is complete:

- Do not describe incomplete assessments as “safe.”
- Do not launch a build that can turn missing allergen/nutrition evidence into a positive result.

Until Issue 2 is complete:

- Do not claim that the current button deletes all associated data.
- Do not submit the current in-app-only deletion implementation as the complete Play account-deletion flow.

## Parallel workstreams

| Workstream | Start first | Can proceed in parallel |
| --- | --- | --- |
| Product safety | I1-T1 contract/ADR | Evidence corpus planning for I1-T6 |
| Account deletion | I2-T1 inventory/manifest | Emulator fixture planning for I2-T7 |
| Cross-team release | Health/privacy copy review | Play Console declaration inventory |

After the two foundation tickets are approved, the implementation tickets inside both epics can proceed concurrently according to their dependency diagrams.

# Ticket creation checklist

For each proposed ticket:

1. Replace the placeholder with the next available Planner code.
2. Copy the objective, work, and acceptance criteria without weakening the epic safety rules.
3. Link back to this document and the parent epic.
4. Add the difficulty and area labels.
5. Assign dependencies/blockers explicitly.
6. Require tests and documentation in the same PR where practical.
7. Reject a ticket as complete if it merely changes UI wording while unsafe backend behaviour remains.
8. Re-run the relevant epic launch test before closing the final ticket.

# External references

- [Google Play — Account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en-EN)
- [Google Play — Health Content and Services policy](https://support.google.com/googleplay/android-developer/answer/16679511?hl=en)
- [Google Play — Health apps declaration](https://support.google.com/googleplay/android-developer/answer/14738291?hl=en)
- [Firebase — Delete data: deleting a document does not delete its subcollections](https://firebase.google.com/docs/firestore/manage-data/delete-data)
- [Firebase — Verify ID tokens with the Admin SDK](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
- [Food Standards Australia New Zealand — Food allergies](https://www.foodstandards.gov.au/consumer/foodallergies)
- [Food Standards Australia New Zealand — Allergen labelling for food businesses](https://www.foodstandards.gov.au/business/labelling/allergen-labelling)

# Repository references

- `Documents/Guides/Leadership/writing-and-reviewing-tickets.md`
- `Documents/Guides/Leadership/ticket-structure.md`
- `Documents/Database/2026 Trimester 1/DB038-Source-Data-Gaps-And-Limitations.md`
- `mobile-app/app/api/products/classify+api.ts`
- `database/local_backend/scanPipeline.js`
- `mobile-app/services/recommendations.ts`
- `mobile-app/app/(app)/ProductTabs/ForYouTab.tsx`
- `mobile-app/components/product/ProductCompareSection.tsx`
- `mobile-app/services/database/user/deleteUserAccount.ts`
- `mobile-app/app/(app)/accountProfile.tsx`
- `mobile-app/app/(app)/settings/privacy.tsx`
