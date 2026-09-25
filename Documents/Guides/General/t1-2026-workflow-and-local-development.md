# Food Remedy T1 2026 Workflow and Local Development Guide

**Document type:** Team onboarding and day-to-day workflow  
**Trimester:** 2026 Trimester 1  
**Repository:** Food-Remedy_API  
**Last updated:** April 2026  

---

## Professional summary

This guide describes how contributors run the Food Remedy project locally in 2026 Trimester 1. It covers the mobile and web app entry points, authentication and captcha behaviour for development, where product data is prepared, and where to find deeper documentation. The format is plain and scannable for human readers and for applicant tracking or search systems that index project documentation.

---

## Keywords

Food Remedy, React Native, Expo, local development, Firebase authentication, hCaptcha, environment variables, Open Food Facts, database pipeline, clean enrich seed, Firestore, Python tooling, student project workflow, T1 2026

---

## Table of contents

1. [Repository layout at a glance](#repository-layout-at-a-glance)
2. [Mobile and web application workflow](#mobile-and-web-application-workflow)
3. [Authentication and captcha](#authentication-and-captcha)
4. [Database and data pipeline workflow](#database-and-data-pipeline-workflow)
5. [Python and backend utilities](#python-and-backend-utilities)
6. [Related documentation index](#related-documentation-index)

---

## Repository layout at a glance

| Area | Path | Role |
|------|------|------|
| Application | `mobile-app/` | React Native (Expo) user interface, services, Firebase client |
| Product data preparation | `database/` | Scraping, cleaning, enrichment pipeline, seeding to Firestore |
| Shared Python utilities | `utils/` | Allergen detection, conflict resolution, helpers used by pipeline and tests |
| API shape mapping | `mapping/` | Maps enriched product records toward the product detail contract |
| Project documentation | `Documents/` | Database notes by trimester, guides, leadership material |
| Automated tests | `test/` | Python tests for utilities and data behaviour |

---

## Mobile and web application workflow

**Prerequisites:** Node.js LTS, npm, and Expo tooling as described in the repository root `README.md` if present.

**Typical steps**

1. Open a terminal at the repository root.
2. Change directory to the app: `cd mobile-app`
3. Install dependencies: `npm install`
4. Start the development server: `npm start` (or use the scripts defined in `mobile-app/package.json` for web or native targets).

**Web browser:** Expo may serve the app on a local URL (for example port 8081). Use the link shown in the terminal after the server starts.

**Physical device:** Use Expo Go or a development build as documented in the main project README.

---

## Authentication and captcha

Login can use an hCaptcha security step. Behaviour depends on build mode and environment variables.

**Development mode (`__DEV__` is true, typical `npm start` flow):**  
Captcha is **disabled by default** so email and password login can proceed on localhost without registering localhost in the hCaptcha dashboard.

**Production builds:**  
Captcha is **enabled by default** unless you set `EXPO_PUBLIC_CAPTCHA_ENABLED` to the string `false`.

**Override in any environment**

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_CAPTCHA_ENABLED` | Set to `true` to force captcha on in development. Set to `false` to force captcha off in production builds. |
| `EXPO_PUBLIC_HCAPTCHA_SITE_KEY` | Your hCaptcha site key. Prefer this over hardcoding keys in the repository. |

**Configuration file:** `mobile-app/config/captchaConfig.ts`

**Web captcha component:** `mobile-app/components/security/CaptchaModal.web.tsx`  
If captcha is on and the widget fails to load (common when localhost is not allowed for the site key), the modal shows an explanatory message instead of only a generic error.

**Operational note:** Never commit production secrets. Use local env files that are listed in `.gitignore`.

---

## Database and data pipeline workflow

**Canonical cleaning package:** All cleaning and normalisation scripts for the database track live under **`database/clean_data/`** (underscore). Python imports use the form `database.clean_data...`. Do not recreate a second folder with a space in the name.

**High-level data flow**

1. **Scrape** optional raw Australian product data: `database/scraping/OpenFoodFacts-DataScrape.py`
2. **Clean** records: `database/clean_data/cleanProductData.py` and `database/clean_data/normalization/`
3. **Enrich** via pipeline modules: `database/pipeline/run_pipeline.py` with settings in `database/pipeline/pipeline.config.json`
4. **Seed** to Firestore: `database/seeding/seed_engine.py` (requires Firebase credentials outside the repo)

**Index document:** `database/DATABASE-README.md`

**Schema and deployment detail (T1):** `Documents/Database/2026 Trimester 1/DB015-Schema-DataFlow-Documentation.md`

**Status versus prior handover:** `Documents/Database/2026 Trimester 1/DATABASE_PROGRESS_AND_HANDOVER_ALIGNMENT.md`

---

## Python and backend utilities

**Install Python dependencies** from the repository root when working on database or test code:

```text
pip install -r requirements.txt
```

Run targeted tests from the repository root, for example:

```text
python -m pytest test/test_missing_values.py
```

Adjust the path for other test modules as needed.

---

## Related documentation index

| Topic | Document path |
|-------|----------------|
| Database folder map and quick links | `database/DATABASE-README.md` |
| Firestore product schema and deployment checklist | `Documents/Database/2026 Trimester 1/DB015-Schema-DataFlow-Documentation.md` |
| Database progress and handover alignment | `Documents/Database/2026 Trimester 1/DATABASE_PROGRESS_AND_HANDOVER_ALIGNMENT.md` |
| Firebase access (restricted) | `Documents/Guides/Leadership/Credentials/firebase-access.md` |
| Common setup issues template | `Documents/Guides/troubleshoot-setup.md` |
| Contribution and Planner workflow | `Documents/Guides/General/how-to-contribute.md` |
| T1 2026 frontend changes (FE005) | `Documents/Frontend/2026 Trimester 1/FE005-T1-2026-Frontend-Changes.md` |

---

## Document maintenance

When you change default captcha rules, default pipeline paths, or the canonical cleaning folder name, update this guide in the same section so T1 documentation stays consistent for the next contributor or handover.
