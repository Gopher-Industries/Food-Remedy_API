# FE005 - T1 2026 Frontend Changes (Start to End)

**Ticket:** FE005 - Document all the new front end changes made  
**Trimester:** 2026 Trimester 1 (January–May 2026)  
**Repository:** Food-Remedy_API  
**Application path:** `mobile-app/` (Expo / React Native)  
**Last updated:** May 2026  
**Audience:** Frontend team, leadership, design, and anyone demoing or reviewing T1 progress  

---

## 1. Purpose of this document

This is the **single handover document** for everything the frontend team shipped in T1 2026. It lists:

- Numbered **FE tickets** merged to `main`
- **Supporting PRs** that changed the app without an `FE` prefix
- **Cross-team work** (BE / DB) that the UI depends on
- **Where to look in the repo** and **how to demo** each area

Use it in Planner stand-ups, trimester reviews, and onboarding so progress is visible without digging through dozens of PRs.

---

## 2. Executive summary

T1 2026 moved Food Remedy from a T3 2025 prototype toward a **coherent end-to-end mobile experience**:

| Area | What we delivered |
|------|-------------------|
| **Auth & onboarding** | Forgot/reset password, hCaptcha on web (Mac/browser), guest login removed, auth/profile gates stabilised |
| **Profiles & demographics** | Dedicated demographics flow, nutritional profiles UI fixes, SQLite-backed demographic details (FE026) |
| **Product detail** | Tabbed PDP (Nutrients, Ingredients, For you, Compare), richer ingredients, full recommendations tab with add-to-list |
| **Shopping journey** | Shopping cart page, planned-date calendar on lists, checkout-style **review** screen (items bought vs pending) |
| **Data contract** | UI aligned with **Product Detail v1** (DB037) via normalisers and API routes |
| **Polish** | Brand colour consistency, dark-mode / visibility pass (FE036), navigation and loop bug fixes |

The app still runs on **Firebase Auth + Firestore**, with **SQLite** for offline profile/list data and optional **backend** recommendation/product APIs via `EXPO_PUBLIC_*` env vars.

---

## 3. Timeline (chronological)

Dates are from `git log` on `mobile-app/` (merge dates to `main`).

| Date | ID / PR | Summary |
|------|---------|---------|
| 2026-03-12 | - | Project baseline (`mobile-app/` in repo) |
| 2026-03-24 | **FE001** (#12) | Forgot / reset password flow |
| 2026-03-24 | **FE003** (#13) | hCaptcha modal for web / Mac browser |
| 2026-03-28 | DB016 (#23) | Firebase + Expo environment setup (enables FE dev) |
| 2026-03-30 | BE003 (#19) | Shopping cart API routes (FE consumes) |
| 2026-04-01 | BE005 (#27) | Firebase ↔ SQLite sync (profiles, lists) |
| 2026-04-12 | - | T1 docs: captcha **off by default in `__DEV__`** |
| 2026-04-20 | #47 | Add to cart, calendar / planned date on list items |
| 2026-04-23 | #49 | New shopping cart hub page |
| 2026-04-24 | **FE007** (#50) | Product detail refactored into tabs + compare section |
| 2026-04-26–27 | **FE018** (#53–54) | Demographics form + profile gate |
| 2026-04-28 | **FE019** (#59) | Ingredients tab (allergen-aware display) |
| 2026-04-28 | **FE022** (#58) | Recommendations tab, cards, add-to-list modals |
| 2026-04-30 | #66 | Product detail back button behaviour |
| 2026-05-01 | **FE023** (#67) | Checkout / shopping review page |
| 2026-05-04 | BE007 (#33), DB026 | Profile sync verification; Firestore `PRODUCTS` alignment |
| 2026-05-07–11 | DB030, DB040, BE018, BE020 | Integration testing, data remediation, recommendation engine + PDP API |
| 2026-05-09 | #76 | Fix demographic loop for new users |
| 2026-05-14 | **FE035** (#91) | Nutritional profile display and count fixes |
| 2026-05-15 | **FE036** (#92), #93 | Visibility / dark mode; remove guest login |
| 2026-05-17–18 | #96–97 | Auth gate fix; product detail back navigation |
| 2026-05-19 | **FE026** (#98) | Load demographic details from SQLite for “For you” tab |

---

## 4. FE tickets (detailed)

### FE001 - Forgot / reset password link

**Merged:** 2026-03-24 (#12)

**User-facing change:** Users can request a password reset email from the app and complete reset via Firebase Auth.

**Key paths:**

- `mobile-app/app/forgotPassword.tsx`
- `mobile-app/app/login.tsx` (link to forgot password)

**Demo:** Login → “Forgot password?” → enter email → follow Firebase email link.

---

### FE003 - Web browser / Mac support (hCaptcha)

**Merged:** 2026-03-24 (#13)

**User-facing change:** Login captcha works on **Expo web** (including Mac browsers) via a dedicated web modal.

**Key paths:**

- `mobile-app/components/security/CaptchaModal.web.tsx`
- `mobile-app/config/captchaConfig.ts`
- `Documents/Guides/General/t1-2026-workflow-and-local-development.md` (captcha dev rules)

**Note:** In development (`__DEV__`), captcha defaults **off** unless `EXPO_PUBLIC_CAPTCHA_ENABLED=true`, so localhost login is not blocked.

---

### FE007 - Integrate product detail tabs

**Merged:** 2026-04-24 (#50)

**User-facing change:** Product detail is no longer one long scroll; it uses **four tabs**:

| Tab | Component | Role |
|-----|-----------|------|
| Nutrients | `ProductTabs/NutrientsTab.tsx` | Nutriments table, levels |
| Ingredients | `ProductTabs/IngredientsTab.tsx` | Ingredients + traces (expanded in FE019) |
| For you | `ProductTabs/ForYouTab.tsx` | Profile-aware summary (uses demographics in FE026) |
| Compare | `ProductTabs/RecommendationsTab.tsx` | Alternatives / recommendations (expanded in FE022) |

**Key paths:**

- `mobile-app/app/(app)/product.tsx` - tab shell, header, image fallback
- `mobile-app/app/(app)/product_old.tsx` - preserved legacy screen (includes FE014 TTS/allergen code)
- `mobile-app/components/product/ProductCompareSection.tsx`

**Demo:** Scan or open a product → switch tabs → back returns to home tabs.

---

### FE018 - Demographic form page

**Merged:** 2026-04-26–27 (#53–54)

**User-facing change:** New users complete a **demographics** profile (age, sex, etc.) before full app access. Gate logic ties onboarding → demographics → main tabs.

**Key paths:**

- `mobile-app/app/(app)/demographics.tsx`
- `mobile-app/app/(app)/nutritionalProfiles.tsx`
- `mobile-app/hooks/useProfileGate.ts`
- `mobile-app/app/(app)/_layout.tsx` (redirects)

**Gate states:** `loading` → `needs-onboarding` → `needs-demographics` → `ready`.

**Demo:** Register new user → onboarding → demographics save → land on main tabs.

---

### FE019 - Enhance product page ingredients

**Merged:** 2026-04-28 (#59)

**User-facing change:** Ingredients tab shows structured ingredients/traces with clearer layout and profile-context hooks on the profiles tab.

**Key paths:**

- `mobile-app/app/(app)/ProductTabs/IngredientsTab.tsx`
- `mobile-app/app/(app)/(tabs)/profiles.tsx`

---

### FE022 - Enhance product detail (recommendations)

**Merged:** 2026-04-28 (#58)

**User-facing change:** Full **recommendations / alternatives** experience: unsuitable warnings, scored suggestion cards, swap warnings, add-to-list from recommendations.

**Key paths:**

- `mobile-app/app/(app)/ProductTabs/RecommendationsTab.tsx`
- `mobile-app/components/product/RecommendationCard.tsx`
- `mobile-app/components/product/SuggestedProductCard.tsx`
- `mobile-app/components/modals/SwapWarningModal.tsx`
- `mobile-app/components/modals/AddToListModal.tsx`
- `mobile-app/components/providers/RecommendationAddToListProvider.tsx`
- `mobile-app/types/SuggestedProduct.ts`
- `mobile-app/services/recommendations.ts` (local / Firestore mode)

**Env:** `EXPO_PUBLIC_RECOMMENDATION_SOURCE=backend` (default) or `firestore` - see `mobile-app/README.md`.

**Demo:** Open product unsuitable for active profile → see warning → browse alternatives → add to list.

---

### FE023 - Checkout page (shopping review)

**Merged:** 2026-05-01 (#67)

**User-facing change:** **Review screen** after shopping (not payment checkout). Split into **Items Bought** (marked shopped in cart) and **Items Pending**.

**Key paths:**

- `mobile-app/app/(app)/checkout.tsx`
- `mobile-app/app/(app)/lists/shopping-cart.tsx` (navigation into checkout)

**Clarification:** See `Documents/Project/core-pages-feature-plan.md` - “checkout” means **list review before the store**, not e-commerce payment.

**Separate FE023 comment in code:** `PersonalNoteSection.tsx` and `src/api/notes.ts` are tagged FE023 for **personal notes on a product** (local/API notes). Same ticket number was reused in code comments; functionally distinct from the checkout page PR.

---

### FE035 - Rectifying nutritional profile

**Merged:** 2026-05-14 (#91)

**User-facing change:** Fixes profile **count**, selector behaviour, and demographics ↔ nutritional profiles consistency.

**Key paths:**

- `mobile-app/app/(app)/nutritionalProfiles.tsx`
- `mobile-app/app/(app)/demographics.tsx`
- `mobile-app/components/ui/ActiveProfileBadge.tsx`
- `mobile-app/components/ui/ProfileSelector.tsx`

---

### FE036 - Improve visibility (dark mode / contrast)

**Merged:** 2026-05-15 (#92)

**User-facing change:** Dark-mode and high-contrast styling across PDP tabs, checkout, demographics, compare section, and suggestion cards.

**Key paths:** Same tab/checkout/profile files as above; uses `PreferencesProvider` / `highContrast` where applicable.

**Related:** `mobile-app/COLOR_CHANGES.md` documents the brand red / neutral palette standardisation.

---

### FE026 - Pull demographics detail of user

**Merged:** 2026-05-19 (#98)

**User-facing change:** **For you** tab and demographics screen read stored demographic fields from **SQLite** (`profiles.dao`) so personalised copy matches saved data.

**Key paths:**

- `mobile-app/services/sqlDatabase/profiles.dao.ts`
- `mobile-app/config/sqlConfig.ts`
- `mobile-app/app/(app)/ProductTabs/ForYouTab.tsx`
- `mobile-app/app/(app)/demographics.tsx`

---

## 5. Other frontend PRs (no FE prefix)

| PR / theme | What changed |
|------------|----------------|
| **#47** - Add to cart & calendar | `ShoppingListPlannedDateModal`, richer `lists/[listId].tsx`, row actions |
| **#49** - Shopping cart page | `lists/shopping-cart.tsx` hub |
| **#66, #97** - Back navigation | Product screen returns to tab home reliably |
| **#76** - Demographic loop | New users no longer stuck in redirect loop |
| **#93** - Remove guest login | `OnboardingScreen1.tsx` - guest path disabled |
| **#96** - Auth gate fix | `useProfileGate` + `_layout.tsx` redirect stability |
| **#68** - Product code error | Barcode / product id handling fix on PDP |

---

## 6. Cross-team dependencies (BE / DB → FE)

Frontend T1 work assumes these backend/database deliverables:

| Ticket | Impact on UI |
|--------|----------------|
| **DB011 / DB026** | `PRODUCTS` collection shape; scan/search/detail fields |
| **DB016** | Firebase + Expo env so app builds and authenticates |
| **DB037 / DB034** | Frozen **Product Detail v1** - `productDetail.ts`, `Product.d.ts`, API route |
| **DB030 / DB038** | Integration tests + gap docs for demo data quality |
| **BE003** | `/api/shopping-cart-api` CRUD |
| **BE005 / BE007 / BE010** | Profile + list SQLite ↔ Firestore sync |
| **BE018 / BE020** | Server recommendations + enhanced PDP payload |
| **BE001** | Product detail API matches contract |

**Contract docs:**

- `Documents/Database/2026 Trimester 1/DB037-API-LOCK.md`
- `api/contracts/CHANGELOG.md`
- `Documents/Backend/2026 Trimester 1/API-documentation.md`

**FE normalisation layer:**

- `mobile-app/services/utils/productDetail.ts`
- `mobile-app/services/utils/normaliseProduct.ts`
- `mobile-app/types/Product.d.ts`

---

## 7. Screen & route map (T1 2026)

```
app/
├── login.tsx, register.tsx, forgotPassword.tsx, onboarding.tsx
└── (app)/
    ├── (tabs)/          scan, home, cart, profiles, settings
    ├── product.tsx      ← tabbed PDP (FE007+)
    ├── demographics.tsx ← FE018, FE026
    ├── nutritionalProfiles.tsx
    ├── checkout.tsx     ← FE023 review
    ├── lists/
    │   ├── shopping-cart.tsx
    │   └── [listId].tsx
    └── ProductTabs/
        ├── NutrientsTab.tsx
        ├── IngredientsTab.tsx
        ├── ForYouTab.tsx
        └── RecommendationsTab.tsx
```

**Providers / gates:** `AuthProvider`, `ProfileProvider`, `SQLiteDatabaseProvider`, `useProfileGate`, `ProductProvider`.

---

## 8. Environment variables (frontend)

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_API_BASE_URL` | Backend base URL |
| `EXPO_PUBLIC_API_SOURCE` | `backend` or `firestore` for product fetch |
| `EXPO_PUBLIC_RECOMMENDATION_SOURCE` | `backend` or `firestore` for alternatives |
| `EXPO_PUBLIC_CAPTCHA_ENABLED` | Force captcha on/off |
| `EXPO_PUBLIC_HCAPTCHA_SITE_KEY` | hCaptcha site key |

Full setup: `mobile-app/README.md` and `Documents/Guides/General/t1-2026-workflow-and-local-development.md`.

---

## 9. How to demo progress (checklist)

Use this list in reviews or videos:

- [ ] **Auth:** Register, login, forgot password (FE001); captcha on web if enabled (FE003)
- [ ] **Onboarding:** New user → profiles → demographics (FE018) → main app
- [ ] **Scan / search:** Open product → all four tabs (FE007, FE019, FE022, FE026)
- [ ] **Recommendations:** Unsuitable product → alternatives → add to list (FE022)
- [ ] **Cart:** Create list, add items, set planned date (#47), open shopping cart (#49)
- [ ] **Review:** Mark items shopped → checkout shows Bought vs Pending (FE023)
- [ ] **Profiles:** Switch nutritional profile; badge/count correct (FE035)
- [ ] **Accessibility:** Toggle dark/high contrast - UI readable (FE036)

**Run app:**

```bash
cd mobile-app
npm install
npm start
```

---

## 10. Tests & quality

| Test area | Path |
|-----------|------|
| Product detail normalisation | `mobile-app/__tests__/productDetail.test.ts` |
| DB030 API ↔ UI flow | `mobile-app/__tests__/db030_api_ui_flow.test.ts` |
| Contract lock (repo) | `test/test_db037_contract_lock.py` |

---

## 11. Known limitations & deferred items

- **Guest login** removed for T1 (#93); may return when auth strategy is decided.
- **Demographics gate** redirect in `_layout.tsx` is partially commented; gate still enforced via `useProfileGate` for `needs-demographics`.
- **FE014** (voice summary TTS, allergen banner in `product_old.tsx`) remains on legacy screen; tabbed `product.tsx` uses `useScanVoiceSummary` hook - confirm which build you demo.
- **Payment checkout** is out of scope per `core-pages-feature-plan.md`.
- **iOS production build** may still be Android-focused from T3 handover; Expo web + Android are primary dev targets in T1.

---

## 12. Related documentation index

| Topic | Document |
|-------|----------|
| Run app locally | `mobile-app/README.md` |
| T1 workflow (captcha, pipeline) | `Documents/Guides/General/t1-2026-workflow-and-local-development.md` |
| Core pages / checkout meaning | `Documents/Project/core-pages-feature-plan.md` |
| API routes (cart, classify, meal plan) | `Documents/Backend/2026 Trimester 1/API-documentation.md` |
| Product JSON contract | `Documents/Database/2026 Trimester 1/DB037-API-LOCK.md` |
| Colour palette | `mobile-app/COLOR_CHANGES.md` |
| T3 baseline / history | `T3_2025 working.md` |
| Figma | `Documents/Designs/README-DESIGNS.md` |

---

## 13. Ticket FE005 completion

| Item | Status |
|------|--------|
| All FE tickets FE001–FE003, FE007, FE018–FE019, FE022–FE023, FE035–FE036, FE026 documented | Done |
| Supporting PRs and fixes listed | Done |
| Cross-team BE/DB links documented | Done |
| Demo checklist for leadership | Done |

**Maintainers:** When merging new FE PRs, add a row to **Section 3** and a subsection under **Section 4** in the same format.
