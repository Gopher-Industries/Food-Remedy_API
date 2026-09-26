# BE068 backend integration boundary

The authenticated v2 consumer is `services/api/intentAwareRecommendations.ts`. Its request body contains only `version`, `barcode`, `profileId`, `limit`, and either bounded one-off `intention` or `savedIntentId`. The server resolves the owned profile and saved intent. A one-off intention is kept in the request and is absent from SQLite, feedback events and recommendation session records.

The response mapper keeps the server's safety rating, Nutri-Score and reason codes separate from the contextual-fit state. It omits raw semantic scores and confidence from display data. `SEMANTIC_FALLBACK` remains a valid result with deterministic substitutions. A missing recommendation session does not fabricate feedback.

The feedback helper queues only server-session-linked actions through the BE060 local outbox. Each queued action gets one stable event ID; the existing drain retries that ID and the server deduplicates it. Invalid candidate/session combinations are rejected before queueing, with server ownership checked again at ingestion.

The product screen, Compare tab, intention controls, feedback controls, accessibility states and screen recordings in the BE068 ticket are mobile UI work. They are deferred under the backend-only scope requested for this PR. The current dormant `RecommendationsTab` still contains mock data and must not be enabled as a shipped recommendation surface until the mobile implementation replaces it. This PR makes no claim that the complete BE068 user flow is live.

Verification: `npm test -- --runInBand --runTestsByPath __tests__/intentAwareRecommendations.test.ts` from `mobile-app` covers the authenticated request, bounded intention, saved-intent selection, fallback mapping, score omission, queued feedback and absent-session behavior. The BE060 outbox tests cover retry deduplication.
