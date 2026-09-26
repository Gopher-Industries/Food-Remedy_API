# Personalization PR integration review — 2026-09-26

The BE058–BE070 personalization work is split into one-ticket PRs [#262](https://github.com/Gopher-Industries/Food-Remedy_API/pull/262) through [#274](https://github.com/Gopher-Industries/Food-Remedy_API/pull/274). The original branches were stacked. During integration, each ticket is restacked on the current `main`, tested, scanned against the existing secret-scan baseline, and merged in order. This review records the remaining release dependencies, rather than a snapshot of PR status.

## Resolved code integration

- The existing account-scoped SQLite history migration at `user_version = 6` is preserved before BE059/BE060 migrations v7/v8. Migration and history tests passed on the integrated code.
- The earlier backend category retrieval and BE064's bounded server hybrid retrieval coexist. The authenticated v2 path uses the server retrieval and keeps hard safety checks; BE067 allows safety-eligible cross-category candidates to compete only after semantic evaluation.
- Mobile Jest, TypeScript, the network-free BE069 release fixtures, and Firestore rules tests pass on the integrated backend stack. The release fixtures use synthetic, engineering-provisional labels and do not establish live Jev quality.

## Release dependencies

1. **Account deletion:** BE047 [#243](https://github.com/Gopher-Industries/Food-Remedy_API/pull/243) accepts an authenticated deletion request, but a server worker and completion evidence are still required before that flow replaces client cleanup. The worker must remove personalization preferences, saved intents, sessions and events alongside other account data.
2. **Server hosting:** The current Expo static web export skips API routes. A server-capable API host and `EXPO_PUBLIC_PERSONALIZATION_API_BASE_URL` must be configured before the v2 consumer can work outside tests. BE058 production configuration [#245](https://github.com/Gopher-Industries/Food-Remedy_API/pull/245) is a separate ticket from personalization BE058 #262.
3. **Semantic release:** BE069 labels, thresholds, live model run, provider prices and a QA/product approval reference remain outstanding. BE070 keeps Jev disabled without those inputs. Catalogue semantic attributes also need the documented product and data review before production upload.
4. **Mobile UI:** BE068 adds a backend integration boundary only. The dormant recommendations surface still has mock data and must not be enabled until mobile work replaces it. One-off intentions and feedback are prepared in the client service but are not a shipped screen.
5. **Other open PRs:** BE027 [#214](https://github.com/Gopher-Industries/Food-Remedy_API/pull/214) and BE057 [#244](https://github.com/Gopher-Industries/Food-Remedy_API/pull/244) touch migrations or profile sync. Re-run their affected tests if either is integrated. BE059 history secret scan [#250](https://github.com/Gopher-Industries/Food-Remedy_API/pull/250) is another unrelated ticket-number collision.

The full-history secret scan reports findings already present on `main`; each personalization PR's local scan is compared by finding ID and coverage gap so new issues are not mistaken for that baseline. No production feature flag, credential, Firestore control document or hosting setting is changed by these merges.
