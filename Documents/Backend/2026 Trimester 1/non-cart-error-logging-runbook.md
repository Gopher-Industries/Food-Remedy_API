# Non-cart error and logging runbook

Release-critical non-cart APIs return `{ error, message, requestId }` for failures and echo the identifier in the `x-request-id` response header. Clients may supply an identifier containing 8–128 letters, digits, `.`, `_`, or `-`; otherwise the backend creates one. Do not use emails, Firebase UIDs, or tokens as request IDs.

Search production logs by `requestId` and the stable event name (for example `meal_plan.failed`). Production entries are single-line structured JSON. Development entries remain console-readable. Never add request bodies, profiles, authorization headers, storage URLs, or provider response bodies to log fields. The shared logger redacts known sensitive keys and string patterns, but field minimisation is still required.

Stable codes currently covered are `INVALID_REQUEST`, `PRODUCT_NOT_FOUND`, `PRODUCT_DETAIL_FAILED`, `CLASSIFICATION_FAILED`, `MEAL_PLAN_FAILED`, `FEEDBACK_SUBMISSION_FAILED`, and `AVATAR_STORAGE_FAILED`. User-facing messages must remain generic. Add a code to `services/backend/safeErrors.ts` before using it.

Validate with `npm test -- --runInBand` from `mobile-app`. The `safeErrors` fixtures verify redaction and the product-detail contract verifies correlation propagation. This work intentionally does not modify `app/api/shopping-cart-api/route.ts`; coordinate any cart envelope work through BE019. Rebase carefully around BACKEND-NEXT-07 if it touches the same product or meal-plan handlers.
