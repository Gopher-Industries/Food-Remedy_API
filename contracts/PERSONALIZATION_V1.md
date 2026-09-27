# Personalization v1: ownership and data dictionary (BE058)

The authoritative safety profile remains `NutritionalProfile`. Its allergies,
intolerances, additives and mandatory dietary forms are evaluated by deterministic
eligibility before any preference or semantic signal is considered. A preference
such as `like: creamy` cannot permit a product excluded by that check. A missing
personalization document means `entries: []` and the existing deterministic order.

The canonical TypeScript definitions are in `mobile-app/types/Personalization.ts`.
`personalization_v1.schema.json` contains the corresponding Draft-07 validation
definitions. `scripts/generate_personalization_contract.py` generates the schema.
New wire shapes require a new `schemaVersion`; v1 is `1.0.0`. Callers must reject
unsupported versions and additional fields rather than silently dropping them.

| Record / field | Meaning and validation | Owner and provenance | Retention / disclosure |
| --- | --- | --- | --- |
| `FoodPreferenceProfile.profileId` | Owned household profile path segment, 1–128 safe characters | Verified account owns profile; server checks path and active status | Client may read its own; never send UID or profile ID to Jev or analytics |
| `FoodPreferenceProfile.entries` | At most 32 typed dimension/value/sentiment declarations; `provenance=explicit`, `confidence=1` | Profile editor declares each entry; `sourceVersion` names editing source | Retain until edited, profile deletion or account deletion; pass only relevant preference values to Jev |
| `entries.updatedAt`, `profile.updatedAt` | UTC date-time, conflict/recency evidence | Editing client, bounded by server clock on write | Retain with record; never emit in analytics |
| `DerivedPreference` | Same controlled dimensions; `provenance=observed` or `inferred`, bounded confidence, observation and update times, optional expiry | Server evidence reducer or versioned model; never persisted as `FoodPreferenceProfile.entries` | Expires or is recalculated; only bounded, fresh summary may reach Jev; no client declaration API |
| `SavedShoppingIntent.intentId`, `profileId` | Stable owner-scoped ID | Profile editor explicitly saves | Retain until deletion; client may read its own; no IDs in Jev or analytics |
| `SavedShoppingIntent.text` | Nonempty text of at most 240 characters; control characters denied | User explicitly saved; `provenance=explicit` | Retain until intent/profile/account deletion; send only as current ranking context when selected; omit from event analytics and logs |
| `SavedShoppingIntent.occasion`, `convenience` | Optional bounded tags | User declared | Same as saved intent; ranking context only |
| `SavedShoppingIntent.deletedAt` | Optional UTC tombstone timestamp; hidden from active intent lists | Owner deletion action | Retain only through offline sync reconciliation, then purge; never send to Jev or analytics |
| `RecommendationEvent.eventId` | Stable idempotency key, 1–128 safe characters | Client creates; server verifies session and owner | Retain for 90 days unless deleted sooner; never send identifier to Jev or metrics |
| `RecommendationEvent.profileId`, `recommendationSessionId`, barcodes | Owned profile and a server-issued recommendation session with original/candidate pair | Verified ingestion server checks all references | Retain 90 days; export to owner; aggregate metrics omit all identifiers |
| `RecommendationEvent.action`, `rejectionReason`, `occurredAt`, `receivedAt` | Controlled action/reason, bounded timestamps; `receivedAt` is server assigned | Client reports action; server validates and timestamps | Retain 90 days; derive bounded observations, never medical restrictions; a `shown` event alone is never negative evidence |
| `ProductSemanticAttributes.*` | Optional evidenced property; absence is unknown, `not_applicable` is explicit; per-field source, source version, confidence and generated time | Trusted catalogue/server pipeline only | Catalogue lifetime; client may receive for explanation; Jev may receive ranking attributes; analytics aggregate coverage only |

Controlled dimensions are texture, flavour family and intensity, familiarity,
convenience and occasion. Product attributes also include food role, portability,
shareability, preparation, mess risk, melt risk and serving format. Rejection
reasons are `too_strong`, `wrong_texture`, `messy`, `unfamiliar`, `too_different`
and `other`. Enums are deliberately bounded; unknown values are absent, never
guessed into a supported value. `not_applicable` is separate from absent evidence.

## Processing boundaries

1. The authenticated server loads a safety profile only under
   `USERS/{verifiedUid}/PROFILES/{profileId}`. It rejects missing, inactive and
   foreign profiles with the same public error.
2. Deterministic allergen, intolerance, additive and dietary gates exclude
   conflicts. Jev receives only eligible candidates, one bounded current intent,
   relevant explicit preferences and a fresh bounded behavioral summary. It
   receives no raw restriction names, UID, profile ID or event history.
3. A one-off intention exists only for a request. It becomes a
   `SavedShoppingIntent` only after a separate explicit save action.
4. Observed and inferred signals never write to the explicit preference record.
   Explicit declarations win on conflict. Opens and list additions are weak
   evidence; impressions alone have zero negative weight.
5. Analytics may retain aggregate outcome counts, latency, coverage and cost
   bands. They omit text, identifiers, individual barcodes, preferences and
   safety data. No raw product or Jev state is logged.

## Household and consent policy

An account owner manages Self and child profiles. Child preference and outcome
data stay beneath the owner's household path and must not become public or
cross-profile evidence. Recording outcome events for a child profile requires
the account owner's product consent before ingestion is enabled. Revoking
consent stops new events and deletes retained child events and derived summaries.
Profile deletion must remove preferences, saved intents, events and any derived
summaries. Account deletion must remove all household personalization data.
Owner export includes declarations, saved intents and retained events, separated
by profile, with provenance and timestamps. Jev input is ephemeral and is not
part of the application's retained export. These are implementation requirements
for BE059–BE060; this contract ticket creates no storage or UI.

## Compatibility examples

Valid empty profile: `{"schemaVersion":"1.0.0","profileId":"self","entries":[],"updatedAt":"2026-09-26T00:00:00Z"}`.

Valid explicit declaration: `{"dimension":"texture","value":"crunchy","sentiment":"like","provenance":"explicit","confidence":1,"sourceVersion":"mobile-1","updatedAt":"2026-09-26T00:00:00Z"}`.

Invalid in an explicit profile: changing `provenance` to `inferred`, adding an
`allergies` field, or using `"texture":"very_crunchy"`. An observed signal
belongs in the separate `DerivedPreference` shape and cannot be serialized as a
user declaration. Existing safety profiles and v1 substitution responses are
unchanged by this contract.
