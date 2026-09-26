# BE065 — Server-only TypeSafe Jev adapter

The pinned dependency is `@typesafe-ai/sdk@0.6.0`, which requires Node 20+;
the local runtime used for verification is Node 22. The adapter uses the SDK's
`TypeSafeClient.systemOne` and `score` primitives. The versioned model default
is `jev-1.13.0`, not a moving alias. See the [JavaScript SDK](https://docs.typesafe.ai/sdk/javascript),
[client configuration](https://docs.typesafe.ai/sdk/javascript/api/interfaces/TypeSafeClientConfig),
and [model registry](https://docs.typesafe.ai/models).

The server environment accepts `TYPESAFE_API_KEY`, optional HTTPS
`TYPESAFE_BASE_URL`, pinned `TYPESAFE_MODEL`, and `TYPESAFE_TIMEOUT_MS` in
200–2,000 ms (default 1,200). The key must be provisioned only to the API
runtime by the deployment owner. It must never use an `EXPO_PUBLIC_` prefix or
be put in EAS public app configuration. The SDK logger is set to `off` because
debug-level request bodies would contain personal context. No vendor exception
or raw response is logged or returned to clients.

The local `SemanticFitClient` interface has disabled, mock, and TypeSafe
implementations. The real adapter accepts 1–5 named Score questions, validates
state and question bounds, rejects safety/identity keys, calls a pinned model,
and validates exact returned question IDs, score ranges, confidence,
probabilities, model ID, and usage. It maps failures to internal typed
`disabled`, `cancelled`, `timeout`, `rate_limited`, `authentication`,
`connection`, `upstream`, `malformed`, or `busy` outcomes. The SDK receives the
AbortSignal; an independent total deadline also bounds a transport that ignores
cancellation. There is at most one SDK retry and three concurrent calls per
server process through a shared adapter instance. Missing or invalid credentials yield a disabled client.

BE065 wires the adapter into the server route but does not invoke it or change
candidate order. BE066 supplies the food-fit questions and BE067 controls when
the evaluator may affect ranking. The deterministic v2 endpoint works when the
adapter is disabled.

## Verification

```sh
npm --prefix mobile-app ls @typesafe-ai/sdk
npm --prefix mobile-app test -- --runInBand --silent typesafeSemanticFitClient.test.ts productSubstitutionApi.test.ts
node mobile-app/scripts/checkTypesafeClientBoundary.cjs
TYPESAFE_API_KEY=BE065_BUNDLE_CANARY_NEVER_REAL npx expo export \
  --platform web --output-dir /tmp/foodremedy-be065-web
rg -l 'BE065_BUNDLE_CANARY_NEVER_REAL|TYPESAFE_API_KEY|@typesafe-ai/sdk' \
  /tmp/foodremedy-be065-web/_expo/static/js/web
```

The last `rg` returns no matches. This static client export omitted API routes,
and the canary value did not enter the generated web JavaScript. The local
`app.json` currently sets `web.output` to `static`, so that export does **not**
deploy API routes; the deployment owner must provide a server-capable runtime
before treating the endpoint as production available. This PR does not change
hosting mode or deploy credentials. Unit tests run without network access or a
real API key.
