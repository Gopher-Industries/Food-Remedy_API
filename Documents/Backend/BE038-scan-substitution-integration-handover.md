# BE038 – Scan and Mobile Substitution Integration Handover

## Completed flow

The product lifecycle now owns substitution loading after a scan:

1. A scan sets the product barcode and opens the existing product screen.
2. When the flagged Compare tab mounts, it requires an authenticated account and
   an active profile.
3. The mobile client sends only the barcode, owned profile ID and result limit to
   `POST /api/recommendations/substitutions` using the v2 contract and Firebase
   bearer token.
4. The UI renders only validated backend results and backend safe-empty states.
5. Selecting a result sets its barcode in `ProductProvider` and reuses the
   existing product-detail navigation and loading lifecycle.

Scan, profile and account identifiers are effect dependencies. Changing any of
them cancels the active request, clears visible state immediately and prevents a
late response from publishing. The API client also has a six-second timeout.

## Before and after

Before, `database/local_backend/scanPipeline.js` returned the same three
chocolate records (`99901`–`99903`) for every scan and could fall back to that
static list after preference filtering. `RecommendationsTab.tsx` independently
rendered five fabricated products without calling the authenticated endpoint.

After, the local pipeline returns `alternatives: []` with
`requires_authenticated_request` metadata. The mobile tab calls the canonical
API and has explicit loading, offline, timeout, unavailable, incomplete-data and
no-eligible-candidate states. There is no local/static substitution fallback.

## Safety and privacy boundaries

- Allergy, additive and dietary constraints remain server-derived; the mobile
  request cannot override them.
- Profile ownership is checked against the verified token UID by the endpoint.
- Unknown or incomplete safety evidence remains a safe empty result.
- User-visible reason text is mapped from bounded backend reason codes. It does
  not expose the user's allergy or avoided-additive values.
- Every result asks the user to recheck the physical label because product data
  can change.

## Release and rollback

The `recommendationsTab` flag remains false by default. Deploy the authenticated
route first, enable its server canary for test accounts and complete the device
matrix in `mobile-app/docs/feature-flags.md` before enabling a preview build.

Rollback is fail closed: disable `SUBSTITUTIONS_ROLLOUT` server-side and keep or
set `EXPO_PUBLIC_FEATURE_RECOMMENDATIONS_TAB=false`. Do not restore the removed
chocolate catalogue or the legacy `/scan/alternatives` boundary.

## Known limitations

- Alternatives need connectivity and an authenticated, active profile.
- The UI deliberately shows no previous result while a new scan/profile/account
  request is loading or unavailable.
- The Compare tab remains release-gated until deployed-environment device smoke
  tests confirm authentication, latency and navigation.
