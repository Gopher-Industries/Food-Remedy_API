// EPIC 5 - 7 Day Meal Plan Generator API

import { collection, getDocs, limit, query } from "firebase/firestore";
import { fdb } from "@/config/firebaseConfig";

type DietType = "omnivore" | "vegetarian" | "vegan";

type MealPlanRequest = {
    // profile info
    profileId?: string;
    profileName?: string;

    // Diet + restrictions
    dietType?: DietType;
    allergens?: string[];
    intolerances?: string[];
    dietaryPreferences?: string[];

    // Preferences for plan generation
    preferredCategories?: string[];

    // Safety limit so too much isn't read from firestore
    productLimit?: number;
};

type Profile = {
    id: string;
    name: string;
    dietType: DietType;
    allergies: string[];
    intolerances: string[];
    dietaryPreferences: string[];
    preferredCategories: string[];
};

type ProductDoc = {
    barcode: string;
    productName?: string | null;
    brand?: string | null;

    categories?: string[] | null;
    allergens?: string[] | null;
    additives?: string[] | null;

    // Useful for diet filtering
    ingredientsAnalysis?: string[] | null;

    // Useful for classification scoring
    nutrientLevels?: Record<string, string> | null;
    nutriscoreGrade?: string | null;

    traces?: string | null;

    [key: string]: any;
};

type MealProduct = {
    id: string; // barcode
    name: string; // productName fallback if missing

    // which meal slots this product can be used for
    mealCategories: Array<"breakfast" | "lunch" | "dinner" | "snack">;

     // EPIC 1 classification output
     classification: ClassificationResult;

    // extra tags
    extraTags: string[];

    // original Firestore doc (kept for filtering)
    db: ProductDoc;
};

type MealDto = {
    productId: string;
    name: string;
    colour: ClassificationColour;
    score: number;
    tags: string[];
    suitabilityNote?: string;
};

type DayPlan = {
    day: string;
    breakfast: MealDto | null;
    lunch: MealDto | null;
    dinner: MealDto | null;
    snacks: MealDto[];
};

type MealPlanResponse = {
    profileId: string;
    profileName: string;
    weekStart: string; // YYYY-MM-DD
    days: DayPlan[];
    warning?: string;
};

type ClassificationColour = "red" | "green" | "grey";

type ClassificationResult = {
    barcode: string;
    colour: ClassificationColour;
    score: number;
    reasons: string[];
    productName?: string;
    brand?: string;
};

// Function: getOriginFromRequest
// Purpose: Build a base URL (origin) so server-side fetch works reliably
function getOriginFromRequest(request: Request): string {
    const url = new URL(request.url);

    return url.origin;
}

// Function: classifyViaApi
// Purpose: Call EPIC 1 endpoint (/api/products/classify) and return classification result
async function classifyViaApi(
    request: Request,
    barcode: string,
    profile: {
        allergies?: string[];
        intolerances?: string[];
        dietaryPreferences?: string[];
    }
): Promise<{
    barcode: string;
    colour: "red" | "green" | "grey";
    score: number;
    reasons: string[];
    productName?: string;
    brand?: string;
}> {
    const origin = getOriginFromRequest(request);

    // Build absolute URL to endpoint
    const url = `${origin}/api/products/classify`;

    const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // endpoint { barcode, profile }
    body: JSON.stringify({ barcode, profile }),
    });

    // If classify endpoint fails, throw 
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Classification API failed (${res.status}): ${text}`);
    }

    // Parse classification result JSON
    return (await res.json()) as any;
}

// Function: toJsonResponse
// Purpose: Return JSON response with HTTP status
function toJsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body, null, 2), {
        status,
        headers: { "Content-Type": "application/json" },
        
    });
}

// Function: normaliseToken
// Purpose: Normalise strings for comparison
function normaliseToken(value: string): string {
    // Lowercase + trim + collapse multiple spaces
    return value.toLowerCase().trim().replace(/\s+/g, " ");
}

// Function: safeStringArray
// Purpose: Return a safe string[] from optional fields
function safeStringArray(value: unknown): string[] {
    // If not an array, return empty
    if (!Array.isArray(value)) return [];

    // Keep only strings, normalise them
    return value.filter((x) => typeof x === "string").map((x) => normaliseToken(x));
}

// Function: splitCommaList
// Purpose: Split comma-separated strings into normalised tokens
function splitCommaList(value: string | null | undefined): string[] {
    if (!value) return [];
    return value.split(",").map((x) => normaliseToken(x)).filter(Boolean);
}

// Function: yyyyMmDdToday
// Purpose: Produce YYYY-MM-DD string for today
function yyyyMmDdToday(): string {
  const d = new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Function: resolveProfile
// Purpose: Build profile object used by planner
function resolveProfile(body: MealPlanRequest): Profile {
    return {
        id: body.profileId ?? "profile-demo",
        name: body.profileName ?? "Demo Profile",
        dietType: body.dietType ?? "omnivore",
        allergies: body.allergens ?? [],
        intolerances: body.intolerances ?? [],
        dietaryPreferences: body.dietaryPreferences ?? [],
        preferredCategories: body.preferredCategories ?? [],
    };
}

// Function: loadProductsFromFirestore
// Purpose: Load ProductDoc list from Firestore PRODUCTS collection
async function loadProductsFromFirestore(productLimit: number): Promise<ProductDoc[]> {

    // Creating query: PRODUCTS collection limited to productLimit
    const q = query(collection(fdb, "PRODUCTS"), limit(productLimit));

    // Fetching docs
    const snap = await getDocs(q);

    // If none found, stop
    if (snap.empty) {
        throw new Error("Firestore PRODUCTS collection returned 0 documents.");
    }

    // Map Firestore docs -> ProductDoc
    return snap.docs.map((docSnap) => {
        const data = docSnap.data() as Partial<ProductDoc>;
        // Use barcode if present
        const barcode = String(data.barcode ?? docSnap.id);
        return {
            ...data,
            barcode,
        } as ProductDoc;
    });
}

// Function: inferMealCategories
// Purpose: Decide which meal slots a product can fit based on categories[]
function inferMealCategories(categories?: string[] | null): Array<"breakfast" | "lunch" | "dinner" | "snack"> {
    // Normalise categories to lowercase for matching
    const c = (categories ?? []).map((x) => x.toLowerCase());

    // Using a set to avoid duplicates
    const result = new Set<"breakfast" | "lunch" | "dinner" | "snack">();

    if (c.length === 0) {
        // Default: Assume lunch/dinner when categories missing
        return ["lunch", "dinner"];
    }

    // Breakfast signal
    if (c.some((t) => t.includes("breakfast"))) result.add("breakfast");

    // Snack signal
    if (c.some((t) => ["snacks", "sweet-snacks", "chocolates", "confectioneries"].some((k) => t.includes(k)))) {
    result.add("snack");
    }
    
    // Main-meal signal
    if (c.some((t) => ["meal-kits", "breads", "pastas", "noodles", "canned-foods", "seafood", "fishes"].some((k) => t.includes(k)))) {
    result.add("lunch");
    result.add("dinner");
    }

    // Fallback to lunch/dinner if nothing matched
    if (result.size === 0) {
        result.add("lunch");
        result.add("dinner");
    }

    return Array.from(result);
}

// Function: inferExtraTags
// Purpose: Add extra tags for metadata
function inferExtraTags(doc: ProductDoc): string[] {
    const tags: string[] =[];

    // Read categories safely
    const categories = safeStringArray(doc.categories);

    // Example: WHOLEFOOD tag heuristic
    if (categories.some((c) => c.includes("wholemeal") || c.includes("vegetable") || c.includes("fruit"))) {
        tags.push("WHOLEFOOD");
    }

    // Removing duplicates
    return Array.from(new Set(tags));
}

// Function: isDietCompatible
// Purpose: Deterministic diet filtering
function isDietCompatible(dietType: DietType, ingredientsAnalysis?: string[] | null): boolean {
    const tags = (ingredientsAnalysis ?? []).map((x) => x.toLowerCase());

    // If vegetarian: reject non-vegetarian
    if (dietType === "vegetarian") {
        return !tags.includes("non-vegetarian");
    }

    // If vegan: reject non-vegan OR non-vegetarian
    if (dietType === "vegan") {
    return !tags.includes("non-vegan") && !tags.includes("non-vegetarian");
    }

    // Omnivore: accept all
    return true;
}

// Function: conflictWithRestrictions
// Purpose: Extra allergen/intolerance filtering using allergens[] and traces string
function conflictsWithRestrictions(profile: Profile, product: ProductDoc): boolean {
    // Building restricted set from allergies + intolerances
    const restricted = new Set(
        [...profile.allergies, ...profile.intolerances].map(normaliseToken));
    
    // Get allergens list and traces list
    const allergens = safeStringArray(product.allergens);
    const traces = splitCommaList(product.traces);

    // If any restricted item appears, conflict = true
    for (const a of [...allergens, ...traces]) {
        if (restricted.has(a)) return true;
    }

    return false;
}

// Function: toMealProductFromApi
// Purpose: Convert ProductDoc + classification result into MealProduct
function toMealProductFromApi(
    doc: ProductDoc,
    classification: {
        barcode: string;
        colour: "red" | "green" | "grey";
        score: number;
        reasons: string[];
        productName?: string;
        brand?: string;
    }
):  MealProduct {
        const id = doc.barcode;
        const name = String(doc.productName ?? classification.productName ?? `Product ${id}`);

    return {
        id,
        name,
        mealCategories: inferMealCategories(doc.categories),
        classification, // already computed by teammate endpoint
        extraTags: inferExtraTags(doc),
        db: doc,
    };
}

// Function: mealColourScore
// Purpose: Sorting score for colour priority (green > grey > red)
function mealColourScore(colour: ClassificationColour): number {
    if (colour === "green") return 2;
    if (colour === "grey") return 1;
    return 0;
}

// Function toMealDto
// Purpose: Build response object with metadata (colour + reasons + tags)
function toMealDto(p: MealProduct): MealDto {
    const noteParts: string[] =[];

    // Use first two EPIC 1 reasons to keep it readable
    if (p.classification.reasons?.length) {
        noteParts.push(...p.classification.reasons.slice(0, 2));
    }
    
    // Adding metadata tags
    if (p.extraTags.includes("WHOLEFOOD")) {
        noteParts.push("Wholefood category signal");
    }

    return {
        productId: p.id,
        name: p.name,
        colour: p.classification.colour,
        score: p.classification.score,
        tags: [...p.extraTags],
        suitabilityNote: noteParts.length ? noteParts.join(". ") : undefined,
    };
}

// Function: pickMeal
// Purpose: Select a product for a meal slot deterministically
function pickMeal(
    poolSorted: MealProduct[],
    mealCategory: "breakfast" | "lunch" | "dinner" | "snack",
    preferredCategories: string[],
    dayIndex: number,
    usedIds: Set<string>,
    seedOffset: number
): MealDto | null {
    // Filtering products suitable for this meal slot
    const candidates = poolSorted.filter((p) => p.mealCategories.includes(mealCategory));

    // If no candidates, return null for that slot
    if (candidates.length === 0) return null;

    // Building preference set (normalised)
    const prefSet = new Set((preferredCategories ?? []).map(normaliseToken));

    // Default preferred pool = all candidates
    let preferred = candidates;
    
    // If user has preferences, try to filter candidates further
    if (prefSet.size > 0) {
        const preferredPool = candidates.filter((p) => {
            // Tag match
            const tagMatch = p.extraTags.some((t) => prefSet.has(normaliseToken(t)));
            // Slot match
            const slotMatch = prefSet.has(normaliseToken(mealCategory));
            return tagMatch || slotMatch;
        });
        
        // Only applied if it doesn't eliminate anything
        if (preferredPool.length > 0) preferred = preferredPool;
    }

    // Deterministic rotation seed
    const startIndex = (dayIndex + seedOffset) % preferred.length;

    // Trying to avoid duplicates within the same day
    for (let i = 0; i < preferred.length; i++) {
        const idx = (startIndex + i) % preferred.length;
        const chosen = preferred[idx];

        if (!usedIds.has(chosen.id)) {
            usedIds.add(chosen.id);
            return toMealDto(chosen);
        }
    }

    // If can't avoid duplicats, return deterministic choice anyway
    const fallback = preferred[startIndex];
    usedIds.add(fallback.id);
    return toMealDto(fallback);
}

// Function: countMissingMeals
// Purpose: Used to trigger fallback behaviour when options are limited
function countMissingMeals(plan: MealPlanResponse): number {
    let missing = 0;
    for (const d of plan.days) {
        if (!d.breakfast) missing ++;
        if (!d.lunch) missing ++;
        if (!d.dinner) missing ++;
        if (!d.snacks || d.snacks.length === 0) missing++;
    }
    return missing;
}

// Function: generate7dayMealPlan
// Purpose: Core EPIC 5 planner using EPIC 1 colour classification
function generate7DayMealPlan(profile: Profile, mealProducts: MealProduct[]): MealPlanResponse {
    const daysOfWeek = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

    // Filter by diet + allergens/intolerances
    const filtered = mealProducts.filter((p) => {
        if (!isDietCompatible(profile.dietType, p.db.ingredientsAnalysis)) return false;
        if (conflictsWithRestrictions(profile, p.db)) return false;
        return true;
    });

    // Exclude RED products
    const usable = filtered.filter((p) => p.classification.colour !== "red");

    // If nothing is usable, return empty plan with warning
    if (usable.length === 0) {
        return {
            profileId: profile.id,
            profileName: profile.name,
            weekStart: yyyyMmDdToday(),
            days: daysOfWeek.map((day) => ({
            day,
            breakfast: null,
            lunch: null,
            dinner: null,
            snacks: [],
        })),
    
        warning: "No suitable products found after applying diet/restrictions and excluding RED products.",
    };
  }

    // Sort: GREEN first, then GREY; use score as a tie-breaker; then id for determinism
    const poolSorted = [...usable].sort((a, b) => {
        const c = mealColourScore(b.classification.colour) - mealColourScore(a.classification.colour);
        if (c !== 0) return c;

        const s = (b.classification.score ?? 0) - (a.classification.score ?? 0);
        if (s !== 0) return s;

        return a.id.localeCompare(b.id);
    });

    // Starting to build the response object
    const plan: MealPlanResponse = {
        profileId: profile.id,
        profileName: profile.name,
        weekStart: yyyyMmDdToday(),
        days: [],
    };

    // Building 7 days with segmented meals
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        const usedIds = new Set<string>();

        // Pick each meal slot
        const breakfast = pickMeal(poolSorted, "breakfast", profile.preferredCategories, dayIndex, usedIds, 1);
        const lunch = pickMeal(poolSorted, "lunch", profile.preferredCategories, dayIndex, usedIds, 2);
        const dinner = pickMeal(poolSorted, "dinner", profile.preferredCategories, dayIndex, usedIds, 3);
        const snack = pickMeal(poolSorted, "snack", profile.preferredCategories, dayIndex, usedIds, 4);
        
        // Add to plan
        plan.days.push({
            day: daysOfWeek[dayIndex],
            breakfast,
            lunch,
            dinner,
            snacks: snack ? [snack]: [],
        });
    }

    // Fallback if too many missing slots, relax preferences (but still never includes RED)
    const missing = countMissingMeals(plan);

    if (missing > 5) {
        for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
            const day = plan.days[dayIndex];
            const usedIds = new Set<string>();

            // Re-seeding usedIds with existing choices
            if (day.lunch) usedIds.add(day.lunch.productId);
            if (day.dinner) usedIds.add(day.dinner.productId);
            for (const s of day.snacks) usedIds.add(s.productId);

            // Filling missing with NO preferences
            if (!day.breakfast) day.breakfast = pickMeal(poolSorted, "breakfast", [], dayIndex, usedIds, 11);
            if (!day.lunch) day.lunch = pickMeal(poolSorted, "lunch", [], dayIndex, usedIds, 12);
            if (!day.dinner) day.dinner = pickMeal(poolSorted, "dinner", [], dayIndex, usedIds, 13);

            if (!day.snacks || day.snacks.length === 0) {
                const snackFallback = pickMeal(poolSorted, "snack", [], dayIndex, usedIds, 14);
                day.snacks = snackFallback ? [snackFallback] : [];
            }
        }
        plan.warning = 
        "Limited options for this profile; preferences were relaxed to fill more meals."
    }

    return plan;
}

// Function: POST
// HTTP handler for /api/7-day meal plan
export async function POST(request: Request): Promise<Response> {
    try {
        const body = (await request.json()) as MealPlanRequest;

        // Resolve profile from request
        const profile = resolveProfile(body);

        const classifierProfile = {
            allergies: profile.allergies,
            intolerances: profile.intolerances,
            dietaryPreferences: profile.dietaryPreferences,
        };

        // Loading products from Firestore
        // Choosing how many products to read (default 200, max 500)
        const productLimit = Math.max(1, Math.min(500, Number(body.productLimit ?? 200)));
        const docs = await loadProductsFromFirestore(productLimit);

        // Calling EPIC 1 endpoint for each barcode to get colour/score/reasons
        const classified = await Promise.all(
            docs.map(async (d) => {
                const classification = await classifyViaApi(request, d.barcode, classifierProfile);
                return { doc: d, classification };
            })
        );

        // Converting to meal products 
        const mealProducts = classified.map(({ doc, classification }) => toMealProductFromApi(doc, classification));

        // Generating Plan
        const plan = generate7DayMealPlan(profile, mealProducts);

        return toJsonResponse(plan, 200);
    } catch (err: any) {
        console.error("Error in /api/7-day-meal-plan:", err);

        return toJsonResponse(
        {
            error: "SERVER_ERROR",
            message: err?.message ?? "Unexpected error while generating 7-day meal plan.",
            
        },
        500);
    }
}