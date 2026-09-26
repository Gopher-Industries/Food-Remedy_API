# BE070 Jev operations and rollback

## Runtime control

The server Admin SDK reads `SERVER_CONFIG/jev` on every authenticated v2 substitution request. The existing Firestore catch-all rule denies all client reads and writes to that path; the emulator test checks owner, attacker and guest access. A missing, malformed or unreadable document disables only Jev. The overall `SUBSTITUTIONS_ROLLOUT` remains independent; keep it enabled to preserve deterministic substitutions.

Create the document only after BE069 QA/product approval, with fields:

```json
{
  "schemaVersion": 1,
  "mode": "disabled",
  "canaryPercent": 0,
  "modelVersion": "jev-1.13.0",
  "evaluationReference": "APPROVED_REPORT_ID",
  "maxCandidates": 8,
  "maxEstimatedCostUsd": 0.05,
  "inputUsdPerMillion": 1,
  "outputUsdPerMillion": 1
}
```

The rates and approval ID above are **placeholders**, not approved provider pricing or a release authorization. Replace them with verified values before enabling. `JEV_RANKING_ENABLED=true` is a server-only master allow flag. `JEV_POLICY_APPROVAL_REFERENCE` must match `evaluationReference` and `TYPESAFE_MODEL` must match `modelVersion`. Both are intentionally explicit configuration changes; no automatic model upgrade is allowed. Keep `TYPESAFE_API_KEY` and `JEV_CANARY_SALT` server-only. The document's `mode` can change from `disabled` to `shadow`, `canary`, or `enabled` without a redeploy. A canary percentage selects a stable in-memory UID hash and never logs the UID or cohort key.

| Mode | Model call | User-visible order |
| --- | --- | --- |
| `disabled` | None | Deterministic |
| `shadow` | Yes, within budget | Deterministic |
| `canary` | Selected users only | Semantic if confident; deterministic otherwise |
| `enabled` | Eligible v2 requests | Semantic if confident; deterministic otherwise |

The adapter uses a shared per-instance client with a concurrency cap of three and a per-request evaluator concurrency cap of two. The config limits eligible candidates to 1–20. Each request reserves two billable attempts using UTF-8 input bytes as a conservative token estimate and a 256-token output allowance per question. Requests above the configured estimate or candidate cap fall back before a Jev call. Reported usage above the cost ceiling also forces deterministic output, although it cannot undo a provider charge already incurred. Provider-side billing must be checked against the aggregate token and cost estimates before rollout.

## Aggregate metrics and alert queries

Every v2 substitution writes a `product_substitution` log metric with a `jev` block: mode, outcome, candidate and question counts, upstream elapsed time, confidence band, fallback reason, attempted rank-change count, pinned model version, token usage and estimated/actual cost. The console sink explicitly selects these fields. It excludes UID, profile ID, barcode, intention, preferences, allergy values, request body, exception details and model state. The privacy test injects those fields and verifies they are absent from output.

In the deployment log explorer, filter for `[substitution-metric]` and parse the attached JSON event. A Cloud Logging starting filter is:

```text
(textPayload:"[substitution-metric]" OR jsonPayload.message:"[substitution-metric]")
```

Build the **Jev v1** dashboard from 15-minute windows of the `jev` block: outcome and fallback-reason rates, p50/p95 upstream duration, candidates and questions per request, low/medium/high confidence share, attempted rank-change share, model-version distribution, total tokens, estimated cost and budget breaches. Exclude non-selected canary requests from model-call denominators. The pure `evaluateJevAlerts` policy and its tests define these alert triggers:

| Signal | Trigger |
| --- | --- |
| Budget breach | Any selected request; immediate alert |
| Upstream error | >5% in at least 100 selected requests / 15 min |
| Timeout | >2% in at least 100 selected requests / 15 min |
| Low confidence | >25% in at least 100 selected requests / 15 min |
| Fallback | >20% in at least 100 selected requests / 15 min |
| p95 upstream latency | >1,800 ms in at least 100 selected requests / 15 min |

Route critical alerts to backend on-call through the deployment platform. No cloud project, log export or alert destination is configured in this repository, so dashboard links and live alert delivery remain deployment tasks. The tests verify alert calculations and metric privacy, not cloud alert installation.

## Rollout and rollback checklist

1. Confirm BE069 approved labels, live report, thresholds, model/question/policy versions, rates and approval reference. Confirm the server-capable API host: Expo's static web export skips API routes.
2. Deploy with `JEV_RANKING_ENABLED=true`, the approved reference, the pinned model, provider key and a distinct canary salt. Leave `SERVER_CONFIG/jev.mode=disabled` until deterministic v2 health is confirmed.
3. Set `mode=shadow`, inspect at least one 15-minute aggregate window and verify unchanged response ordering. Then use `canaryPercent=5`, `25`, `50`, `100` with a complete window and alert review at each step before `enabled`.
4. To kill Jev immediately, change only `SERVER_CONFIG/jev.mode` to `disabled` using a privileged server/admin operator. The next request reads the document and returns deterministic substitutions; verify `jev.outcome=disabled` and a successful substitution response. Do not set `SUBSTITUTIONS_ROLLOUT=disabled`, which also turns off deterministic substitutions.
5. During provider outage or elevated errors, use the same kill switch. Preserve aggregate metrics, version IDs and the BE069 synthetic fixture report for investigation; do not attach raw requests or profiles.
6. Rotate `TYPESAFE_API_KEY` in the server secret store and restart instances so the shared client takes the new key. Keep the control document disabled during rotation and verify shadow before canary.
7. For a model-version change, run BE069 evaluation against the proposed pinned model, get a new approval reference, update `TYPESAFE_MODEL` and `JEV_POLICY_APPROVAL_REFERENCE` in server configuration and the control document's `modelVersion` and `evaluationReference`. Mismatch disables Jev automatically.

The local rehearsal in `jevRollout.test.ts` changes the control document through shadow, excluded canary, selected canary, enabled and disabled **without rebuilding the handler**. It verifies deterministic recovery, plus pre-call candidate/cost rejection, timeout fallback, usage-over-budget fallback and redacted metrics. The on-call operational window and a real deployed rollback drill still need agreement and evidence from the hosting environment.
