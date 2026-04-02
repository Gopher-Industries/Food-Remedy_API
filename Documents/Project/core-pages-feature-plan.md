# Core pages: features to add, references, and alignment

This file is a practical handover-style plan for **recommendations**, **shopping lists / cart**, and the **end of the shopping journey** (review step). It is written so design, frontend, database, and backend leads can stay aligned.

## 1. What “checkout” means in this project

Food Remedy is **not** an e-commerce app in the handover scope. The journey is: **scan → product detail → warnings → alternatives → profile → shopping list / cart**.

- **In scope:** Saving products to lists, reviewing lists, and a clear **“final review”** step before shopping (if the design defines one).
- **Out of scope unless the product owner adds it:** **Payment checkout**, orders, delivery, and merchant integration.

If stakeholders ask for a “checkout page,” clarify whether they mean **review my list before I go to the store** or **pay inside the app**. The rest of this document assumes the **list / planning** meaning unless that decision changes.

## 2. Product detail and recommendations (including “recommendation section”)

Recommendations are shown in context on the **product screen** (unsuitable warnings + alternative products). There may or may not be a separate route named “Recommendations”; the **feature** is the full block: warning + scored alternatives + actions.

### Features to add or finish

| Feature | Why it matters |
|--------|----------------|
| **Unsuitable state** | Clear message when the product conflicts with allergies, intolerances, diet, or risk rules. |
| **Alternatives list** | Ranked substitutes with short reasons (safety, category fit, nutrition). |
| **Loading and empty states** | User trusts the app when the API is slow or no alternatives exist. |
| **Profile-aware logic** | Uses the **active nutritional profile** (family mode) consistently. |
| **Add alternative to list** | Same “add to shopping list” behaviour as the main product, so the journey continues. |
| **Consistent product identity** | One stable id (e.g. barcode) from scan through recommendations and lists. |

### Where to take reference

| Source | What to use it for |
|--------|-------------------|
| **Figma** — [Food Remedy API T3](https://www.figma.com/design/ELDhGDpGE3Xb3TXPCJBPgF/FOOD-REMEDY-API-T3?node-id=0-1&p=f) | Layout, typography, colours, warning severity, card layout for alternatives, empty/error states. |
| **Handover PDF** (Trimester 3) | Stakeholder story: scan → detail → warnings → recommendations → profile → shopping. |
| **Product API contract** — `api/contracts/product_v1.json` | Field names and shapes for product detail (allergens, categories, nutriments, etc.). |
| **Recommendation engine notes** — `EPIC3-EPIC4-SUMMARY.md` | Scoring idea, component list, intended API shape (`POST /recommendations`). |
| **Implementation** — `mobile-app/app/(app)/product.tsx` | Current integration (server alternatives + Firestore/local fallback). |
| **Components** — `mobile-app/components/product/RecommendationList.tsx`, `AlternativeProductCard.tsx`, `UnsuitableWarning.tsx` | What is already built vs what needs design polish. |
| **Services** — `mobile-app/services/recommendations.ts`, `mobile-app/services/api/recommendations.ts` | Local scoring and API wiring. |

### What else is required (alignment)

- **Single source of truth** for the **product detail JSON** between database output, backend, and UI (handover calls this out as a main risk).
- **Final field list** for **alternatives** responses (reasons, scores, product summary fields) documented next to `product_v1.json` once frozen.
- **End-to-end test data** so designers and developers see real “green / grey / red” and allergen cases, not only happy paths.

## 3. Shopping cart tab and shopping lists

The app’s **Cart** tab is the **shopping lists hub** (multiple lists, dates, grouping). Individual lists live under list detail routes.

### Features to add or finish

| Feature | Why it matters |
|--------|----------------|
| **List lifecycle** | Create, rename, delete, and open lists without confusion. |
| **Item rows** | Product name, optional image, quantity, remove, and tap-through to product detail where possible. |
| **Sync and offline behaviour** | Lists should feel reliable (Firestore / SQLite strategy per backend docs). |
| **Grouping by planned date** | Matches current `cart.tsx` behaviour (today, tomorrow, week, etc.) — design should match. |
| **Bulk actions** (if in Figma) | e.g. select multiple items to remove or move — only if design specifies. |
| **Deep link from product** | “Add to list” from product and recommendation cards lands in the correct list. |
| **Empty and error states** | Clear guidance when there are no lists or sync fails. |

### Where to take reference

| Source | What to use it for |
|--------|-------------------|
| **Figma** — same T3 file, flows for **shopping / cart** | Remaining sub-pages and micro-interactions called out in the handover. |
| **Navigation** — `Documents/Guides/General/navigation-guide.md` | Route structure, tabs, and known incomplete routes. |
| **Screens** — `mobile-app/app/(app)/(tabs)/cart.tsx`, `mobile-app/app/(app)/lists/[listId].tsx` | Actual behaviour to align with Figma. |
| **Hooks / state** — `mobile-app/hooks/useShoppingList.ts` (and related) | How lists are stored and refreshed. |
| **Modals** — `mobile-app/components/modals/AddToListModal.tsx`, `CreateListModal.tsx` | Add-to-list UX. |
| **Design standards** — `Documents/Designs/README-DESIGNS.md` | Inter font, colour rules, export practices. |

### What else is required (alignment)

- **Identifiers:** Confirm whether list items use **barcode**, Firestore **product id**, or both — **same id** as product detail and cart API.
- **Firestore rules and collections** must match what the app writes (see shopping cart API below).
- **Product Owner sign-off** on cart flow before large design changes (handover: avoid rework).

## 4. Cart API and server routes (shopping data)

This supports **persistent cart / list** behaviour and must stay aligned with the UI.

### Features to add or finish

| Feature | Why it matters |
|--------|----------------|
| **CRUD for cart items** | Add, update quantity, remove, list by user. |
| **Validate product exists** | Only real catalogue products can be added (already described in route comments). |
| **Consistent response shape** | Frontend can render without one-off parsing. |

### Where to take reference

| Source | What to use it for |
|--------|-------------------|
| **Route implementation** — `mobile-app/app/api/shopping-cart-api/route.ts` | GET/POST/PATCH/DELETE behaviour and Firestore paths (`users/{userId}/cart/{productId}`). |
| **Backend / Firebase docs** — `Documents/Guides/Leadership/Credentials/firebase-access.md` | Access and environment setup. |
| **Data architecture** — `Documents/Database/2025 Trimester 3/data-architecture-overview.md` | How product and user data relate (high level). |

### What else is required

- Wire the **mobile client** to these endpoints (or to the chosen **Firebase-first** path) so there is **one** clear pattern, not duplicate logic.
- Document the **request/response JSON** next to `api/contracts/` if it is not already formalised (parity with `product_v1.json`).

## 5. “Checkout” / final review page (if you add it)

Only add a dedicated screen if Figma and the product owner define it. Typical **in-scope** content:

- Summary of **one active list** (or merged view): line items, quantities, optional notes.
- **No payment**; primary actions might be: **Share**, **Mark shopped**, **Clear**, or **Back to lists**.

### References

- **Figma** — final step in the **shopping** flow (if present).
- **Existing list detail** — `lists/[listId].tsx` may already cover most of this; avoid duplicating two “summary” screens unless design separates them.

### What else is required

- Explicit **user story** from PO: “As a user, I want to … before I leave for the shop.”
- **Analytics or logging** (optional): only if the team agrees it is worth the privacy review.

## 6. Database and enrichment (what pages depend on)

These pages only feel “impactful” if underlying data is stable.

| Need | Detail |
|------|--------|
| **Unified product profile** | Merged enrichment (allergens, tags, categories, nutrients) with conflict rules resolved. |
| **Stable field names** | Same names in Firestore/API as in `product_v1.json` and UI code. |
| **Scale validation** | Large samples (handover mentions 5k+ / 50k+ validation goals) so lists and recommendations do not break on edge products. |
| **Candidate pool for alternatives** | Category and filter logic needs enough clean products in AU-relevant data. |

References: `database/DATABASE-README.md`, `Documents/Database/2025 Trimester 3/` (clean schema, tagging, pipeline docs).

## 7. Alignment checklist (short)

Use this before marking a milestone done:

1. **Figma** ↔ **Implemented screens** — same steps, same labels for allergens and actions.
2. **`product_v1.json`** ↔ **API responses** ↔ **UI fields** — no silent renames.
3. **Product id / barcode** — consistent from **scan → detail → recommendations → list → cart API**.
4. **Demo script** — scan → product → warning → alternatives → add to list → open cart tab (matches handover demo story).
5. **PO review** — sign-off on shopping/cart changes recorded (handover risk: design vs PO timing).

## 8. Document control

| Item | Note |
|------|------|
| **Purpose** | Onboarding and sprint planning for recommendation + shopping journeys. |
| **Related repo** | `Food-Remedy_API` (mobile app under `mobile-app/`). |
| **External handover** | Trimester 3 PDF (stakeholders, Figma link, demo flow). |
| **Main org repo (handover)** | https://github.com/Gopher-Industries/FoodRemedy — confirm with your team which repo is canonical for releases. |

When contracts or Figma structure change, update **Section 2–4** and the **checklist** so this file stays the single plain-language map for these pages.
