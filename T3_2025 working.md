# Food Remedy — Trimester 3 (2025) Working Guide

This document explains **what the Food Remedy project is**, **what is inside this repo**, **what was done in and around it during Trimester 3 (2025)**, and **how to run the project**. Everything is written in simple words for users and the next team.

---

## 1. What is Food Remedy?

**Food Remedy** is a **mobile app** that helps people in Australia make better food choices when they shop.

- Users can **scan** supermarket products (by barcode or search).
- The app shows things like:
  - **Nutrition summary** (e.g. energy, protein, sugar)
  - **Nutri-score style** guidance (e.g. Red / Grey / Green)
  - **Allergen warnings** (e.g. nuts, gluten)
  - **Dietary suitability** (e.g. vegan, vegetarian)
  - **Ingredients and traces**
  - **Personalised recommendations** and **alternatives** (especially if the user has allergies)

So: **scan → get clear, personalised info and warnings**.

---

## 2. What This Repo Contains (In Simple Words)

This **GitHub repo** holds almost everything for Food Remedy: the **mobile app**, the **data pipeline** (getting and preparing product data), and **docs/guides**. There is **no separate “Food Remedy API” repo** described in the handover; the “backend” used by the app is a mix of **Firebase (Auth + Firestore)** and, optionally, a **REST API** you can run elsewhere.

Roughly:

| Part | What it is |
|------|------------|
| **mobile-app/** | The actual app (Expo / React Native). This is what users install or run. |
| **database/** | Scripts and data to **scrape**, **clean**, **enrich**, and **seed** product data into Firestore. |
| **Documents/** | Guides (how to contribute, leadership, design, database docs, project overview). |
| **.github/** | GitHub templates (e.g. for pull requests). |

There are also some **Python utilities** (e.g. conflict resolver, category normaliser) used by or alongside the database pipeline.

---

## 3. What Happened in Trimester 3 (2025) — In and Out of the Repo

The **Trimester 3 Handover** document describes what the team did **inside this repo** and **outside it** (e.g. Figma, task boards, demo app).

### 3.1 Big picture

- The trimester focused on making the product **ready for a real end-to-end demo**:  
  **Clean data → Enrich (tags, scores) → API contract → UI screens → working Android demo app.**
- **Inside the repo**: frontend app, database pipeline, seeding, enrichment logic, and docs.
- **Outside the repo**: Figma designs, Trello/Planner board, demo video (Panopto), and a built **Android APK** (“food remedy 1.apk”) for demos.

### 3.2 Main achievements (summary)

- **UI/UX**: Full high-fidelity redesign; **55+ screens**; consistent design system; flows for onboarding, auth, scan/search, product detail, profile, history, settings, and shopping/cart.
- **Workflow**: Structured delivery with ticket prefixes (FE / BE / DB / UI) and coordination between teams.
- **Backend + Database**:  
  - Product classification (Red/Grey/Green), user persistence, scan pipeline, meal plan foundations, Product Detail API contract (in progress).  
  - Data pipeline and enrichment (tags, scoring, dietary rules, risk scoring) implemented via pull requests.
- **Android demo**: A working Android app was built (Android only; no Mac/iOS build this trimester).

So: the **repo** holds the **source code and data pipeline**; **Figma, task board, and APK** are the main “outside” artefacts.

---

## 4. Database — What It Is and Where It Lives

### 4.1 Role of the database

The “database” work in this repo is about **product data**: getting Australian food products, cleaning them, adding tags and scores, and putting them where the app can use them (**Firestore** and/or seed files).

### 4.2 Data flow (simple)

1. **Scraping**  
   - Script: `database/scraping/OpenFoodFacts-DataScrape.py`  
   - Gets **Australian** products from Open Food Facts (streaming, no full download).  
   - Saves as something like `openfoodfacts-australia.jsonl`.

2. **Cleaning**  
   - Script: `database/clean data/cleanProductData.py` (and there is also `database/clean_data/` with normalisation).  
   - Removes duplicates, fixes names and numbers, keeps important nutrients, cleans tags, builds image URLs, renames fields (e.g. `code` → `barcode`).  
   - Output: cleaned JSON ready for the next step.

3. **Enrichment**  
   - Pipeline: `database/pipeline/` (e.g. `run_pipeline.py` with clean → enrich → seed stages).  
   - Enrichment adds things like:  
     - Category harmonisation, nutrient unit normalisation  
     - Nutrition scoring (e.g. high protein, low sugar)  
     - Mood/health tags, dietary/lifestyle tags  
     - Ingredient risk and processing level  
   - Config: `database/pipeline/pipeline.config.json` (clean input/output, enrich modules, optional seed).  
   - Some enrichment logic also lives in the **mobile-app** (e.g. `mobile-app/services/nutrition/`).

4. **Seeding**  
   - Scripts under `database/seeding/` (e.g. `seed_firestore.py`, `seed_engine.py`).  
   - Upload cleaned/enriched product data to **Firebase Firestore** in batches (e.g. 500 per batch), with retries.  
   - Products are stored in a **PRODUCTS** collection, often keyed by **barcode**.  
   - Data is also split into chunk files (e.g. `products_0k_10k.json`, `products_10k_20k.json`, …) for batch uploads and to stay within Firestore write limits.

### 4.3 Other database-related pieces in the repo

- **Allergens**: `database/Allergens/` — allergen lists, config, and scripts to load allergens into the DB.  
- **QA & validation**: `database/QA/`, `database/Validation/`, `database/Reports/` — quality checks and reports.  
- **Data investigation**: `database/data_investigation/` — exploring and validating data.  
- **Docs**: `Documents/Database/2025 Trimester 3/` — e.g. data architecture, clean schema, enrichment, pipeline, allergen engine.

So: **database** in this repo = **scraping → cleaning → enrichment → seeding into Firestore** (and related QA/docs).

---

## 5. Backend — What the App Uses

The handover and repo describe **two** backend-style parts:

### 5.1 Firebase (always used by the app)

- **Firebase Authentication**: sign up, login, forgot password, password update, account deletion.  
- **Firestore**:  
  - **PRODUCTS** — product documents (barcode, name, brand, nutrients, tags, etc.).  
  - User/profile data (e.g. profiles, shopping lists, history).  
- **Firebase Storage**: e.g. profile avatars.

The app reads Firebase config from **environment variables** (e.g. `EXPO_PUBLIC_FIREBASE_*`) in `mobile-app/.env`.  
Config code: `mobile-app/config/firebaseConfig.ts`.

### 5.2 Optional REST API (backend server)

- The app can call a **REST API** (e.g. `http://127.0.0.1:8000`) for products, scan, alternatives, recommendations, etc.  
- This is controlled by:  
  - `EXPO_PUBLIC_API_BASE_URL` — base URL of the backend.  
  - `EXPO_PUBLIC_API_SOURCE` — `backend` vs `firestore` (use API vs use Firestore only).  
- If you set `EXPO_PUBLIC_API_SOURCE=firestore` and do not set a base URL, the app can run **without** that separate server and use **Firestore (and local logic)** only.

So: **backend** = **Firebase (Auth + Firestore + Storage)** + optional **external REST API**; both are “outside” the repo in the sense that Firebase is in the cloud and the REST API is a separate service (e.g. Node/Express) not included in this repo.

---

## 6. Frontend and Design — What Is in the Repo

### 6.1 Frontend (mobile app)

- **Technology**: **Expo** (React Native).  
- **Location**: `mobile-app/`.  
- **Entry**: `mobile-app/app/_layout.tsx` (root layout, fonts, onboarding check).  
- **Main flows**:  
  - **Auth**: login, register, forgot password (`app/login.tsx`, `app/register.tsx`, `app/forgotPassword.tsx`).  
  - **Onboarding**: first-time setup (`app/onboarding.tsx`, `app/(app)/onboarding.tsx`).  
  - **Tabs**: Home, Scan, Profiles, Cart, Settings (`app/(app)/(tabs)/`).  
  - **Screens**: search, product detail, scan history, profile, account profile, members edit, nutritional profiles, settings (password, terms, privacy, notifications, feedback, contact, about), lists.  
- **State/data**: Uses Firebase/Firestore, optional REST API, local SQLite (e.g. for caching), and hooks (e.g. `useAuthUserId`, `useProfileGate`, `useShoppingList`, `useHistory`, `useFavourites`).  
- **Design**: Uses **NativeWind** (Tailwind-style) and **Inter** font; design rules (colours, typography) are documented in `Documents/Designs/README-DESIGNS.md`.

### 6.2 Design (outside repo, referenced in handover)

- **Figma**: Full UI/UX design (55+ screens), prototypes, design system.  
- Link is in the handover PDF (Figma workspace for FOOD-REMEDY-API-T3).  
- **Design standards** (typography, colours, icons) are summarised in `Documents/Designs/README-DESIGNS.md` (e.g. Inter, brand red `#FF3D3D`).

So: **frontend** = the **Expo app in `mobile-app/`**; **design** = **Figma** (external) + **design docs** in `Documents/Designs/`.

---

## 7. How to Run This Project

Below is a **step-by-step** way to run the app and (optionally) the data pipeline. No changes to the repo are required for this guide; it only explains how things are meant to be run.

### 7.1 What you need installed

- **Node.js**  
- **npm** (comes with Node)  
- **Expo Go** on your phone (Android or iOS), or an Android emulator / iOS simulator (iOS needs Mac)  
- For **database pipeline**: **Python 3**  
- For **Firebase**: the project must be set up in Firebase Console and you need the config values (see below).

### 7.2 Running the mobile app

1. **Clone the repo** (if you have not already):
   ```bash
   git clone https://github.com/Gopher-Industries/FoodRemedy
   cd FoodRemedy
   ```

2. **Go into the mobile app folder**:
   ```bash
   cd mobile-app
   ```

3. **Install dependencies** (first time only):
   ```bash
   npm install
   ```

4. **Create a `.env` file** in `mobile-app/` (copy from a template if there is one, or create one).  
   You need at least the **Firebase** variables so the app can log in and read Firestore:
   - `EXPO_PUBLIC_FIREBASE_API_KEY`
   - `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
   - `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`
   - `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `EXPO_PUBLIC_FIREBASE_APP_ID`
   - (optional) `EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID`

   If you want to use **Firestore only** (no separate backend):
   - Do **not** set `EXPO_PUBLIC_API_BASE_URL`, or set:
   - `EXPO_PUBLIC_API_SOURCE=firestore`
   - `EXPO_PUBLIC_RECOMMENDATION_SOURCE=firestore`

   If you have a **backend server** running (e.g. on your machine):
   - Set `EXPO_PUBLIC_API_BASE_URL=http://YOUR_IP:8000` (use your machine’s IP if testing on a real device).
   - See `mobile-app/README.md` for more on these variables.

   **Important**: Firebase credentials are not in the repo for security. You get them from the Firebase Console (or from the team lead; see `Documents/Guides/Leadership/firebase-access.md`).

5. **Start the app**:
   ```bash
   npm start
   ```
   A QR code and menu will appear.

6. **Open the app on a device or simulator**:
   - **Phone**: Same Wi‑Fi as your computer, then scan the QR code with Expo Go (Android) or Camera (iOS).  
   - **Android emulator**: Press `a` in the terminal.  
   - **iOS simulator** (Mac only): Press `i`.  
   - **Web (browser)**: Press `w` to open the app at `http://localhost:8081` (e.g. login at `http://localhost:8081/login`).

After that, you can register/login and use the app. If Firestore is empty, product search/scan may return no results until product data is seeded.

#### ⚠️ Common issue: "Missing script: start" / npm errors

**What happens:** If you run `npm start` or `npm run` from the **project root** (the `FoodRemedy-main` folder, not inside `mobile-app`), you will see errors like:
- `Missing script: "start"`
- `Did you mean one of these? npm star / npm stars`
- `To see a list of scripts, run: npm run`

**Why:** The `start` script is defined only in `mobile-app/package.json`. The repo root has no `start` script, so npm fails there.

**Fix:**
1. Make sure you are in the **mobile-app** folder before running any npm commands for the app:
   ```bash
   cd mobile-app
   npm start
   ```
2. **Windows (PowerShell):** Use a semicolon or run the commands one by one:
   ```powershell
   cd mobile-app; npm start
   ```
   Or first `cd mobile-app`, then in the same terminal run `npm start`.

**If the app is already running:** If you see the Food Remedy login page in your browser at `http://localhost:8081/login`, the app is already running. You do not need to run `npm start` again. The npm errors you see are from running a command in the **wrong folder** (root). Use the browser or phone to use the app; to restart the server later, run `npm start` from inside `mobile-app` only.

**Rule of thumb:** For the mobile app, **always run `npm install` and `npm start` from inside the `mobile-app` folder**, never from the repo root.

### 7.3 Running the database pipeline (optional)

This is for **preparing and seeding product data** (scraping, cleaning, enriching, uploading to Firestore).

1. **Python environment** (recommended):
   ```bash
   cd FoodRemedy
   python -m venv .venv
   .venv\Scripts\activate   # Windows
   # or: source .venv/bin/activate   # Mac/Linux
   pip install -r requirements.txt   # if there is one in repo root or database/
   ```

2. **Scraping** (Australian products from Open Food Facts):
   - Run `database/scraping/OpenFoodFacts-DataScrape.py` (see `database/DATABASE-README.md`).  
   - Output is a `.jsonl` file (e.g. `openfoodfacts-australia.jsonl`).

3. **Cleaning**:
   - Run the cleaning script (e.g. `database/clean data/cleanProductData.py`) with the scraped file as input.  
   - Output is cleaned JSON (often then split into chunks like `products_0k_10k.json` in `database/seeding/`).

4. **Pipeline (clean → enrich → seed)**:
   - Config: `database/pipeline/pipeline.config.json`.  
   - Run from repo root, e.g.:
     ```bash
     python -m database.pipeline.run_pipeline
     ```
   - Or use the script mentioned in the repo (e.g. `scripts/run_pipeline_ci.sh` if you use Bash).  
   - The config can turn **seed** on or off; if seed is on, you need **Firebase service account** credentials (see `database/DATABASE-README.md` and `Documents/Guides/Leadership/firebase-access.md`).

5. **Seeding Firestore manually**:
   - Use `database/seeding/seed_firestore.py` (or `seed_engine.py`) with the correct JSON input and a `serviceAccountKey.json` in the right place.  
   - Details are in `database/DATABASE-README.md`.

So: **to run the project** you mainly **run the mobile app** (steps 7.2); **running the pipeline** is for filling/updating product data (steps 7.3).

---

## 8. Repo Structure (Quick Reference)

```
FoodRemedy/
├── .github/              # GitHub templates
├── database/             # Scraping, cleaning, pipeline, seeding, QA, allergens
│   ├── scraping/         # Open Food Facts Australian data
│   ├── clean data/       # cleanProductData.py and normalisation
│   ├── clean_data/       # Alternative clean + normalisation
│   ├── pipeline/         # run_pipeline.py, clean/enrich/seed stages, config
│   ├── seeding/         # Seed scripts and product JSON chunks
│   ├── Allergens/       # Allergen lists and DB seeding
│   ├── QA/, Validation/, Reports/, data_investigation/
│   └── ...
├── Documents/            # Guides, leadership, design, database docs
│   ├── Guides/          # How to contribute, troubleshoot, leadership
│   ├── Designs/         # Design README
│   ├── Database/        # T2/T3 database docs
│   └── Project/         # project-overview.md
├── mobile-app/           # Expo (React Native) app
│   ├── app/             # Screens and routes (_layout, login, tabs, etc.)
│   ├── components/      # Reusable UI
│   ├── config/          # Firebase config
│   ├── services/        # API, auth, database, nutrition, recommendations
│   ├── hooks/           # useAuthUserId, useShoppingList, etc.
│   └── ...
├── README.md
├── mobile-app/README.md
├── database/DATABASE-README.md
└── T3_2025 working.md   # This file
```

---

## 9. Important Links (From the Handover)

- **Main GitHub repo**: https://github.com/Gopher-Industries/FoodRemedy  
- **Figma**: Link in handover PDF (FOOD-REMEDY-API-T3 workspace).  
- **Task board**: Food Remedy T3/2025 (e.g. Trello/Planner).  
- **Demo video (Panopto)**: Link in handover PDF.  
- **Android APK**: “food remedy 1.apk” (Android only).

---

## 10. Summary for Users

- **Food Remedy** = mobile app to scan/search products and get nutrition, allergens, and personalised recommendations.  
- **This repo** = the **app** (`mobile-app/`) + **data pipeline** (`database/`) + **docs** (`Documents/`).  
- **Backend** = **Firebase** (Auth, Firestore, Storage) + optional **REST API**.  
- **Database** = **Open Food Facts → scrape → clean → enrich → seed to Firestore**.  
- **Frontend** = **Expo app** in `mobile-app/`; **design** = **Figma** (external) + design docs in repo.  
- **To run**: install Node, set up `mobile-app/.env` with Firebase (and optional API) variables, then **from inside `mobile-app`** run `npm install` and `npm start`, and open the app on device or simulator (or press `w` for web). If you run `npm start` from the repo root you will get "Missing script: start"—see **§7.2 Common issue** for the fix.  
- **To run pipeline**: use Python, run scraping → cleaning → pipeline (and optionally seed) as in `database/DATABASE-README.md`.

This document only **explains** what is in the repo and how to run it; it does **not** change any code or config.
