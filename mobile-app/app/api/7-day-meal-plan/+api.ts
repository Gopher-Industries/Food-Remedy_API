// EPIC 5 - 7 Day Meal Plan Generator API

import { collection, getDocs, limit, query } from "firebase/firestore";
import { fdb } from "@/config/firebaseConfig";
import { assessAllergenSafety } from "@/services/allergenSafety";

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
    tracesFromIngredients?: string | null;
    ingredients?: string[] | null;
    ingredientsText?: string | null;

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

/**
 * Resource limits for one meal-plan request. These are deliberately kept in
 * this route so the bound is applied consistently to Firestore and the
 * internal classification calls.
 */
export const MEAL_PLAN_LIMITS = {
    maxRequestBodyBytes: 10_000,
    maxProfileStringLength: 100,
    maxArrayItems: 25,
    maxArrayItemLength: 100,
    defaultProductLimit: 50,
    maxProductLimit: 100,
    classificationConcurrency: 4,
    classificationTimeoutMs: 2_000,
    requestTimeoutMs: 12_000,
} as const;

class InvalidMealPlanRequestError extends Error {}
class MealPlanRequestTimeoutError extends Error {}
class MealPlanRequestAbortedError extends Error {}
class ClassificationTimeoutError extends Error {}
class ClassificationFailureError extends Error {}
class ClassificationUnavailableError extends Error {}

type RequestControl = {
    signal: AbortSignal;
    abortError: () => MealPlanRequestTimeoutError | MealPlanRequestAbortedError;
    throwIfAborted: () => void;
    cleanup: () => void;
};

type ClassifiedProduct = {
    doc: ProductDoc;
    classification: ClassificationResult;
};

type ClassificationBatch = {
    successful: ClassifiedProduct[];
    failedCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedOptionalString(value: unknown, maxLength: number): boolean {
    return value === undefined || (
        typeof value === "string"
        && value.trim().length > 0
        && value.length <= maxLength
    );
}

function isBoundedOptionalStringArray(value: unknown): boolean {
    return value === undefined || (
        Array.isArray(value)
        && value.length <= MEAL_PLAN_LIMITS.maxArrayItems
        && value.every((item) => (
            typeof item === "string"
            && item.trim().length > 0
            && item.length <= MEAL_PLAN_LIMITS.maxArrayItemLength
        ))
    );
}

function isMealPlanRequest(value: unknown): value is MealPlanRequest {
    if (!isRecord(value)) return false;

    const allowedKeys = new Set([
        "profileId",
        "profileName",
        "dietType",
        "allergens",
        "intolerances",
        "dietaryPreferences",
        "preferredCategories",
        "productLimit",
    ]);

    if (Object.keys(value).some((key) => !allowedKeys.has(key))) return false;

    if (!isBoundedOptionalString(value.profileId, MEAL_PLAN_LIMITS.maxProfileStringLength)) return false;
    if (!isBoundedOptionalString(value.profileName, MEAL_PLAN_LIMITS.maxProfileStringLength)) return false;
    if (value.dietType !== undefined && !["omnivore", "vegetarian", "vegan"].includes(value.dietType as string)) return false;

    if (!isBoundedOptionalStringArray(value.allergens)) return false;
    if (!isBoundedOptionalStringArray(value.intolerances)) return false;
    if (!isBoundedOptionalStringArray(value.dietaryPreferences)) return false;
    if (!isBoundedOptionalStringArray(value.preferredCategories)) return false;

    return value.productLimit === undefined || (
        typeof value.productLimit === "number"
        && Number.isFinite(value.productLimit)
        && Number.isInteger(value.productLimit)
        && value.productLimit >= 1
        && value.productLimit <= MEAL_PLAN_LIMITS.maxProductLimit
    );
}

function createRequestControl(request: Request): RequestControl {
    const controller = new AbortController();
    let timedOut = false;

    const abortFromRequest = () => controller.abort();
    if (request.signal.aborted) {
        controller.abort();
    } else {
        request.signal.addEventListener("abort", abortFromRequest, { once: true });
    }

    const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, MEAL_PLAN_LIMITS.requestTimeoutMs);

    const abortError = () => (
        timedOut ? new MealPlanRequestTimeoutError() : new MealPlanRequestAbortedError()
    );

    return {
        signal: controller.signal,
        abortError,
        throwIfAborted: () => {
            if (controller.signal.aborted) throw abortError();
        },
        cleanup: () => {
            clearTimeout(timeout);
            request.signal.removeEventListener("abort", abortFromRequest);
        },
    };
}

function awaitWithAbort<T>(
    work: Promise<T>,
    signal: AbortSignal,
    abortError: () => Error
): Promise<T> {
    if (signal.aborted) return Promise.reject(abortError());

    return new Promise<T>((resolve, reject) => {
        const onAbort = () => {
            cleanup();
            reject(abortError());
        };
        const cleanup = () => signal.removeEventListener("abort", onAbort);

        signal.addEventListener("abort", onAbort, { once: true });
        work.then(
            (value) => {
                cleanup();
                resolve(value);
            },
            (error) => {
                cleanup();
                reject(error);
            }
        );
    });
}

async function readMealPlanRequest(request: Request, control: RequestControl): Promise<MealPlanRequest> {
    const declaredLength = request.headers.get("content-length");
    if (declaredLength !== null && Number(declaredLength) > MEAL_PLAN_LIMITS.maxRequestBodyBytes) {
        throw new InvalidMealPlanRequestError();
    }

    let rawBody: string;
    try {
        control.throwIfAborted();
        rawBody = await awaitWithAbort(request.text(), control.signal, control.abortError);
    } catch (error) {
        if (error instanceof MealPlanRequestTimeoutError || error instanceof MealPlanRequestAbortedError) {
            throw error;
        }
        throw new InvalidMealPlanRequestError();
    }

    if (rawBody.length > MEAL_PLAN_LIMITS.maxRequestBodyBytes) {
        throw new InvalidMealPlanRequestError();
    }

    let body: unknown;
    try {
        body = JSON.parse(rawBody);
    } catch {
        throw new InvalidMealPlanRequestError();
    }

    if (!isMealPlanRequest(body)) throw new InvalidMealPlanRequestError();
    return body;
}

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
    },
    requestControl: RequestControl
): Promise<ClassificationResult> {
    const origin = getOriginFromRequest(request);
    const url = `${origin}/api/products/classify`;
    const controller = new AbortController();
    let classificationTimedOut = false;

    const abortForRequest = () => controller.abort();
    if (requestControl.signal.aborted) {
        controller.abort();
    } else {
        requestControl.signal.addEventListener("abort", abortForRequest, { once: true });
    }

    const timeout = setTimeout(() => {
        classificationTimedOut = true;
        controller.abort();
    }, MEAL_PLAN_LIMITS.classificationTimeoutMs);

    const abortError = () => {
        if (classificationTimedOut) return new ClassificationTimeoutError();
        return requestControl.abortError();
    };

    try {
        requestControl.throwIfAborted();

        const res = await awaitWithAbort(fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ barcode, profile }),
            signal: controller.signal,
        }), controller.signal, abortError);

        // Do not read or surface a failed provider response. It may contain
        // infrastructure details that must not be returned by this endpoint.
        if (!res.ok) throw new ClassificationFailureError();

        const classification = await awaitWithAbort(res.json(), controller.signal, abortError);
        if (!isClassificationResult(classification)) throw new ClassificationFailureError();

        return classification;
    } catch (error) {
        if (
            error instanceof MealPlanRequestTimeoutError
            || error instanceof MealPlanRequestAbortedError
            || error instanceof ClassificationTimeoutError
            || error instanceof ClassificationFailureError
        ) {
            throw error;
        }
        throw new ClassificationFailureError();
    } finally {
        clearTimeout(timeout);
        requestControl.signal.removeEventListener("abort", abortForRequest);
    }
}

function isClassificationResult(value: unknown): value is ClassificationResult {
    if (!isRecord(value)) return false;

    return (
        typeof value.barcode === "string"
        && ["red", "green", "grey"].includes(value.colour as string)
        && typeof value.score === "number"
        && Number.isFinite(value.score)
        && Array.isArray(value.reasons)
        && value.reasons.every((reason) => typeof reason === "string")
        && (value.productName === undefined || typeof value.productName === "string")
        && (value.brand === undefined || typeof value.brand === "string")
    );
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
async function loadProductsFromFirestore(
    productLimit: number,
    requestControl: RequestControl
): Promise<ProductDoc[]> {

    // Creating query: PRODUCTS collection limited to productLimit
    const q = query(collection(fdb, "PRODUCTS"), limit(productLimit));

    // Fetching docs. Firestore does not accept an AbortSignal, so race the
    // route's deadline and stop waiting as soon as the request is cancelled.
    requestControl.throwIfAborted();
    const snap = await awaitWithAbort(getDocs(q), requestControl.signal, requestControl.abortError);

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

// Function: classifyProductsWithLimit
// Purpose: Bound internal classifier work and keep document order deterministic.
async function classifyProductsWithLimit(
    request: Request,
    docs: ProductDoc[],
    profile: {
        allergies?: string[];
        intolerances?: string[];
        dietaryPreferences?: string[];
    },
    requestControl: RequestControl
): Promise<ClassificationBatch> {
    const successful: Array<ClassifiedProduct | undefined> = new Array(docs.length);
    let failedCount = 0;
    let nextIndex = 0;

    const worker = async () => {
        while (true) {
            requestControl.throwIfAborted();
            const index = nextIndex;
            nextIndex += 1;
            if (index >= docs.length) return;

            const doc = docs[index];
            try {
                const classification = await classifyViaApi(request, doc.barcode, profile, requestControl);
                successful[index] = { doc, classification };
            } catch (error) {
                if (error instanceof MealPlanRequestTimeoutError || error instanceof MealPlanRequestAbortedError) {
                    throw error;
                }

                // Partial-failure policy: exclude a product whose classifier
                // cannot provide a valid result. A plan can still be generated
                // from the successfully classified products.
                failedCount += 1;
            }
        }
    };

    const workerCount = Math.min(MEAL_PLAN_LIMITS.classificationConcurrency, docs.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    const completed = successful.filter((item): item is ClassifiedProduct => item !== undefined);
    if (completed.length === 0) throw new ClassificationUnavailableError();

    return { successful: completed, failedCount };
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

// Function: conflictsWithRestrictions
// Purpose: Apply the same conservative matcher as classify/recommendations.
export function conflictsWithRestrictions(profile: Profile, product: ProductDoc): boolean {
    const restrictions = [...profile.allergies, ...profile.intolerances];

    // With no restrictions there is no user-specific conflict to evaluate.
    if (restrictions.length === 0) return false;

    const assessment = assessAllergenSafety(product, restrictions);

    // A meal plan is a safety-sensitive recommendation: an explicit match and
    // incomplete/unsupported evidence must both be kept out of the plan.
    return assessment.status !== "safe";
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
    const requestControl = createRequestControl(request);

    try {
        const body = await readMealPlanRequest(request, requestControl);

        // Resolve profile from request
        const profile = resolveProfile(body);

        const classifierProfile = {
            allergies: profile.allergies,
            intolerances: profile.intolerances,
            dietaryPreferences: profile.dietaryPreferences,
        };

        // productLimit has already been validated as a bounded integer.
        const productLimit = body.productLimit ?? MEAL_PLAN_LIMITS.defaultProductLimit;
        const docs = await loadProductsFromFirestore(productLimit, requestControl);

        const classificationBatch = await classifyProductsWithLimit(
            request,
            docs,
            classifierProfile,
            requestControl
        );

        // Converting to meal products 
        const mealProducts = classificationBatch.successful.map(({ doc, classification }) => (
            toMealProductFromApi(doc, classification)
        ));

        // Generating Plan
        const plan = generate7DayMealPlan(profile, mealProducts);
        if (classificationBatch.failedCount > 0) {
            const partialFailureWarning = `${classificationBatch.failedCount} products could not be classified and were excluded from this plan.`;
            plan.warning = plan.warning
                ? `${plan.warning} ${partialFailureWarning}`
                : partialFailureWarning;
        }

        return toJsonResponse(plan, 200);
    } catch (error) {
        // Responses intentionally contain only stable public errors. Detailed
        // infrastructure and provider failures remain in server logs.
        if (error instanceof InvalidMealPlanRequestError) {
            return toJsonResponse({
                error: "INVALID_REQUEST",
                message: "Request body does not match the meal-plan schema.",
            }, 400);
        }

        if (error instanceof MealPlanRequestTimeoutError) {
            return toJsonResponse({
                error: "REQUEST_TIMEOUT",
                message: "Meal-plan generation timed out. Please try again.",
            }, 504);
        }

        if (error instanceof MealPlanRequestAbortedError) {
            return toJsonResponse({
                error: "REQUEST_ABORTED",
                message: "Meal-plan generation was cancelled.",
            }, 408);
        }

        if (error instanceof ClassificationUnavailableError) {
            return toJsonResponse({
                error: "CLASSIFICATION_UNAVAILABLE",
                message: "Meal-plan generation is temporarily unavailable. Please try again.",
            }, 503);
        }

        console.error("Error in /api/7-day-meal-plan:", error);
        return toJsonResponse({
            error: "SERVER_ERROR",
            message: "Unexpected error while generating 7-day meal plan.",
        }, 500);
    } finally {
        requestControl.cleanup();
    }
}
