// Product Page - Refined UI with improved hierarchy, spacing, and typography

import IconGeneral from "@/components/icons/IconGeneral";
import Header from "@/components/layout/Header";
import Screen from "@/components/layout/Screen";
import ImagePanel from "@/components/product/ImagePanel";
import NutrientLevels from "@/components/product/NutrientLevels";
import NutrimentsTable from "@/components/product/NutrimentsTable";
import ProfileProductCheck from "@/components/product/ProfileProductCheck";
import IngredientSearch from "@/components/product/IngredientSearch";
import { useProduct } from "@/components/providers/ProductProvider";
import Tt from "@/components/ui/UIText";
import { toSimpleProduct } from "@/services/utils/toSimpleProduct";
import { router } from "expo-router";
import { useMemo, useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useProfile } from "@/components/providers/ProfileProvider";
import { useModalManager } from "@/components/providers/ModalManagerProvider";
import SkeletonLoading from "../errorHandling/skeletonLoading";
import ErrorState from "../errorHandling/errorState";
import EmptyState from "../errorHandling/emptyState";
import { color, spacing } from "../design/token";
import UnsuitableWarning from "@/components/product/UnsuitableWarning";
import RecommendationList from "@/components/product/RecommendationList";
import { fetchAlternatives } from "@/services/alternatives";
import type {
  AlternativeItem,
  AlternativesResponse,
} from "@/services/alternatives";
import type { RecommendationScore } from "@/services/recommendations";
import {
  getAlternatives,
  isUnsuitableForProfile,
} from "@/services/recommendations";
import type { NutritionalProfile } from "@/types/NutritionalProfile";
import { getCandidatesForRecommendations } from "@/services/database/products/getCandidatesForRecommendations";
import ProductCategoryTags from "@/components/product/ProductCategoryTags";
import { handleContainsPress } from "@/components/product/ProfileProductCheck";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { useSessionPreferences } from "@/components/providers/SessionPreferencesProvider";
import { getProductAllergens } from "@/types/allergens";
import AllergenSummaryBanner from "@/components/product/AllergenSummaryBanner";
import AllergenHighlighter from "@/components/product/AllergenHighlighter";
import {
  useScanVoiceSummary,
  speakProductSummary,
} from "@/hooks/useScanVoiceSummary";

import { ProductTag } from "@/components/shared/ProductTag";
import { getProductTags } from "@/services/utils/productTags";


const COMPLETENESS_BOUND = 0.7;

function formatUnsuitableReason(reasons?: string[] | null): string {
  const rs = Array.isArray(reasons) ? reasons : [];
  if (rs.length === 0)
    return "This product may not be suitable for your profile.";

  // Prefer showing a clear primary reason for the warning card.
  if (rs.includes("INSUFFICIENT_ALLERGEN_DATA")) {
    return "Allergen or ingredient information is incomplete. Please check the product packaging.";
  }

  // If the backend detected specific allergens, show them.
  const contains = rs.filter(
    (x) => typeof x === "string" && x.toLowerCase().startsWith("contains "),
  );
  if (contains.length > 0) {
    return "Not suitable: " + contains.join(", ");
  }

  if (rs.includes("INSUFFICIENT_CATEGORY_DATA")) {
    return "Product category information is incomplete. Reliable alternatives cannot be generated.";
  }

  return "This product may not be suitable. Please review the information on the packaging.";
}

function formatAlternativesEmptyMessage(reasons?: string[] | null): string {
  const rs = Array.isArray(reasons) ? reasons : [];

  if (rs.includes("INSUFFICIENT_CATEGORY_DATA")) {
    return "Not enough product category information to suggest alternatives.";
  }
  if (rs.includes("INSUFFICIENT_ALLERGEN_DATA")) {
    return "Not enough allergen or ingredient information to find safe alternatives.";
  }
  if (rs.includes("NO_ALTERNATIVES_FOUND")) {
    return "No suitable alternatives are currently available.";
  }

  return "No alternatives available at the moment.";
}

function mapAlternativesToRecommendationScores(
  items: AlternativeItem[],
): RecommendationScore[] {
  return (items || []).map((it) => {
    const reasons = (it.reasonTags || []).map((t) => `✓ ${t}`);

    // Minimal product shape required by RecommendationList UI.
    const product: any = {
      barcode: it.barcode,
      productName: it.productName ?? "",
      brand: it.brand ?? "",
      nutriscoreGrade: (it.nutriScore ?? "").toLowerCase() || undefined,
      images: { root: "", primary: "front", variants: {} },
    };

    return {
      product,
      score: 0,
      reasons,
      safetyRating: "green",
    } as RecommendationScore;
  });
}

export default function ProductPage() {
  const { currentProduct, loading, error } = useProduct();
  const { profiles, activeProfile } = useProfile();
  const { openModal } = useModalManager();
  const [unsuitable, setUnsuitable] = useState<{
    unsuitable: boolean;
    reason: string;
    reasons: string[];
  } | null>(null);

  const [recommendations, setRecommendations] = useState<RecommendationScore[]>(
    [],
  );
  const [altChecked, setAltChecked] = useState(false);
  const [altAvoidAllergens, setAltAvoidAllergens] = useState<string[]>([]);

  const simpleProduct = useMemo(
    () => toSimpleProduct(currentProduct),
    [currentProduct],
  );

  // === FE014: Voice summary (TTS) ===
  const { ttsEnabled, highContrast } = usePreferences();

  {
    /* TOGGLE SHOW CONTAINS AND HIGHLIGHTER FROM SESSION PREFERENCES */
  }
  const {
    showContainsBadges,
    toggleShowContains,
    allergenHighlightEnabled,
    toggleAllergenHighlight,
  } = useSessionPreferences();

  // Call hook safely: it will only speak when product + enabled are valid.
  useScanVoiceSummary({
    product: currentProduct ?? null,
    enabled: ttsEnabled && !loading && !error && !!currentProduct,
  });

  // ---------- UI helpers (High Contrast) ----------
  const pageBg = highContrast
    ? "bg-white dark:bg-hsl15"
    : "bg-hsl95 dark:bg-hsl10";
  const titleText = highContrast ? "text-black" : "text-hsl20";
  const bodyText = highContrast ? "text-black" : "text-hsl30 dark:text-hsl90";
  const iconDefault = highContrast ? "#000000" : "hsl(0, 0%, 30%)";
  const cardBase = highContrast
    ? "bg-white dark:bg-hsl15 border border-black"
    : "bg-white dark:bg-hsl15";
  const primaryBtn = highContrast
    ? "bg-black border border-black"
    : "bg-primary";
  const primaryBtnText = highContrast ? "text-white" : "text-white";

  // === FE014: product-level allergens for banner + highlighter ===
  const productAllergens = useMemo(
    () => (currentProduct ? getProductAllergens(currentProduct) : []),
    [currentProduct],
  );

  const productTags = useMemo(
    () => (currentProduct ? getProductTags(currentProduct) : []),
    [currentProduct],
  );

  // Backend-driven: fetch unsuitable + alternatives from backend (dataset-driven)
  useEffect(() => {
    if (!currentProduct?.barcode) return;

    // Collect avoid-allergens from the user's profiles.
    // NOTE: ProfileProductCheck may use different profile shapes; keep this resilient.
    const extractAvoidAllergens = (p: any): string[] => {
      if (!p) return [];

      // Most common shapes
      const direct = p?.avoidAllergens;
      const nested = p?.preferences?.avoidAllergens;

      // Other shapes we have seen across versions
      const alt1 = p?.allergens; // sometimes a string[]
      const alt2 = p?.allergensToAvoid;
      const alt3 = p?.allergenAvoid;
      const alt4 = p?.allergenPreferences?.avoidAllergens;
      const alt5 = p?.allergenPreferences?.avoid;
      const alt6 = p?.dietaryPreferences?.avoidAllergens;
      const alt7 = p?.selectedAllergens;
      const alt8 = p?.intolerances; // common field in your profile shape
      const alt9 = p?.allergies; // common field in your profile shape

      // Some schemas store objects like { name: "Lactose" }
      const normalize = (v: any): string[] => {
        if (!v) return [];

        // Allow a single string value (e.g., "Lactose")
        if (typeof v === "string") {
          return v
            .split(",")
            .map((s) =>
              String(s || "")
                .trim()
                .toLowerCase(),
            )
            .filter(Boolean);
        }

        // Allow objects like { name: "Lactose" } or { value: "Lactose" }
        if (v && typeof v === "object" && !Array.isArray(v)) {
          const single = String(v.name ?? v.label ?? v.value ?? "")
            .trim()
            .toLowerCase();
          if (single) return [single];

          // Allow nested containers like { avoidAllergens: [...] }
          const nestedArr = v.avoidAllergens ?? v.avoid ?? v.allergens;
          if (Array.isArray(nestedArr)) {
            return nestedArr
              .map((x: any) => {
                if (typeof x === "string") return x;
                if (x && typeof x === "object")
                  return String(x.name ?? x.label ?? x.value ?? "");
                return "";
              })
              .map((s: any) =>
                String(s || "")
                  .trim()
                  .toLowerCase(),
              )
              .filter(Boolean);
          }

          return [];
        }

        // Common case: array of strings or objects
        if (Array.isArray(v)) {
          return v
            .map((x) => {
              if (typeof x === "string") return x;
              if (x && typeof x === "object")
                return String(x.name ?? x.label ?? x.value ?? "");
              return "";
            })
            .map((s) =>
              String(s || "")
                .trim()
                .toLowerCase(),
            )
            .filter(Boolean);
        }

        return [];
      };

      return [
        ...normalize(direct),
        ...normalize(nested),
        ...normalize(alt1),
        ...normalize(alt2),
        ...normalize(alt3),
        ...normalize(alt4),
        ...normalize(alt5),
        ...normalize(alt6),
        ...normalize(alt7),
        ...normalize(alt8),
        ...normalize(alt9),
      ];
    };

    // Use activeProfile if selected, otherwise use all profiles
    const avoidAllergens = activeProfile
      ? extractAvoidAllergens(activeProfile)
      : Array.from(
          new Set(
            (profiles || []).flatMap((p: any) => extractAvoidAllergens(p)),
          ),
        );
    console.log("[ProductPage] barcode:", String(currentProduct.barcode));
    console.log("[ProductPage] activeProfile:", activeProfile);
    console.log("[ProductPage] avoidAllergens:", avoidAllergens);
    console.log("[ProductPage] Using profiles:", activeProfile ? "active profile only" : "all profiles");

    setAltChecked(false);
    setAltAvoidAllergens(avoidAllergens);

    const apiSource = String(
      process.env.EXPO_PUBLIC_API_SOURCE || "auto",
    ).toLowerCase();
    const recoSource = String(
      process.env.EXPO_PUBLIC_RECOMMENDATION_SOURCE || "auto",
    ).toLowerCase();
    const noApiBase = !process.env.EXPO_PUBLIC_API_BASE_URL;

    // Firestore-first mode: compute unsuitability + recommendations locally
    if (recoSource === "firestore" || apiSource === "firestore" || noApiBase) {
      (async () => {
        try {
          const minimalProfile: NutritionalProfile = {
            userId: "local",
            profileId: "local",
            firstName: "",
            lastName: "",
            status: true,
            relationship: "Self",
            age: 0,
            avatarUrl: "",
            additives: [],
            allergies: avoidAllergens,
            intolerances: [],
            dietaryForm: [],
          };

          // Local unsuitability
          const uns = isUnsuitableForProfile(
            currentProduct as any,
            minimalProfile,
          );
          setUnsuitable({
            unsuitable: uns.unsuitable,
            reason: uns.unsuitable ? uns.reason : "",
            reasons: uns.unsuitable && uns.reason ? [uns.reason] : [],
          });

          // Local recommendations via Firestore candidates
          const pool = await getCandidatesForRecommendations(
            currentProduct as any,
            200,
          );
          const recs = getAlternatives(
            currentProduct as any,
            pool,
            minimalProfile,
            5,
          );
          setRecommendations(recs);
        } catch (e) {
          console.error("[ProductPage] firestore-first mode error:", e);
          setRecommendations([]);
          setUnsuitable(null);
        } finally {
          setAltChecked(true);
        }
      })();
      return;
    }

    // Backend-first mode (default): use server alternatives, then fallback to Firestore+local
    fetchAlternatives(String(currentProduct.barcode), avoidAllergens)
      .then(async (data: AlternativesResponse) => {
        console.log("[ProductPage] alternatives response:", data);
        setAltChecked(true);

        const reasons = Array.isArray(data?.reasons) ? data.reasons : [];
        const alternatives = Array.isArray(data?.alternatives)
          ? data.alternatives
          : [];
        const isUnsuitable = Boolean(data?.unsuitable);

        setUnsuitable({
          unsuitable: isUnsuitable,
          reason: formatUnsuitableReason(reasons),
          reasons,
        });

        if (alternatives.length > 0) {
          setRecommendations(
            mapAlternativesToRecommendationScores(alternatives),
          );
          return;
        }

        // Fallback: Firestore + local engine when unsuitable but no server alternatives
        if (isUnsuitable) {
          try {
            const pool = await getCandidatesForRecommendations(
              currentProduct as any,
              200,
            );

            const minimalProfile: NutritionalProfile = {
              userId: "local",
              profileId: "local",
              firstName: "",
              lastName: "",
              status: true,
              relationship: "Self",
              age: 0,
              avatarUrl: "",
              additives: [],
              allergies: avoidAllergens,
              intolerances: [],
              dietaryForm: [],
            };

            const recs = getAlternatives(
              currentProduct as any,
              pool,
              minimalProfile,
              5,
            );
            setRecommendations(recs);
          } catch (e) {
            console.error("[ProductPage] local fallback error:", e);
            setRecommendations([]);
          }
        } else {
          setRecommendations([]);
        }
      })
      .catch((e) => {
        console.error("[ProductPage] fetchAlternatives error:", e);
        setAltChecked(true);
        setUnsuitable(null);
        setRecommendations([]);
      });
  }, [currentProduct?.barcode, activeProfile, profiles]);

  // --- LOADING/ERROR/EMPTY STATES ---
  if (loading) return <SkeletonLoading />;
  if (error) return <ErrorState />;
  if (!currentProduct) return <EmptyState />;
  // --- SUCCESS STATE: SHOW PRODUCT ---
  return (
    <Screen className={`p-safe ${pageBg}`}>
      <Header />


      {/* TOP ACTION BAR */}
      <View className="w-[95%] self-center mb-6">
        <View className="flex-row justify-between items-center">
          <Pressable
            onPress={() => router.back()}
            className="flex-row justify-center items-center px-2 py-1"
          >
            {({ pressed }) => (
              <IconGeneral
                type="arrow-backward-ios"
                fill={pressed ? "#FF3D3D" : iconDefault}
                size={24}
              />
            )}
          </Pressable>

          {/* ACTIONS: Add to List */}
          <View className="flex-row items-center gap-x-2">
            <Pressable
              onPress={() => openModal("addToList")}
              className={`flex-row justify-center items-center px-3 py-2 rounded-lg ${primaryBtn}`}
            >
              {({ pressed }) => (
                <>
                  <IconGeneral type="cart-add" fill="white" size={20} />
                  <Tt className={`${primaryBtnText} font-interSemiBold ml-2`}>
                    Add to List
                  </Tt>
                </>

              )}
            </Pressable>
          </View>
        </View>
      </View>


      {/* MISSING INFORMATION WARNING */}
      {currentProduct.completeness <= COMPLETENESS_BOUND && (
        <View className="w-[95%] self-center flex-row items-center gap-x-4 my-4 px-4 py-3 rounded-lg bg-[#FFAEAE] border border-[#FD6464]">
          <IconGeneral type="warning" fill="#572626" size={30} />
          <View className="flex-1">
            <Tt className="font-interBold text-[#572626]">
              Information Incomplete
            </Tt>
            <Tt className="text-sm text-[#572626] text-justify">
              Check the packaging for your safety
            </Tt>
          </View>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false}>
        <View className="w-[95%] self-center pb-8">
          {/* PRODUCT HEADER SECTION - Clear Visual Hierarchy */}
          <View className="mb-8">
            {/* Product Name - Primary focal point */}
            <View className="flex-row items-start justify-between">
              <View className="flex-1 pr-4">
                <Tt
                  className={`font-interBold text-3xl leading-tight mb-2 ${titleText}`}
                >
                  {currentProduct.productName}
                </Tt>

                {/* Brand - Secondary info */}
                <Tt className={`font-interSemiBold text-base mb-3 ${bodyText}`}>
                  {currentProduct.brand ?? "Unknown Brand"}
                </Tt>

                {productTags.length > 0 && (
                  <View className="flex-row flex-wrap -m-1 mb-4">
                    {productTags.map((tag) => (
                      <View key={tag.id} className="m-1">
                        <ProductTag label={tag.label} tone={tag.tone} />
                      </View>
                    ))}
                  </View>
                )}

                <ProductCategoryTags
                  categories={currentProduct.categories}
                  category={currentProduct.category}
                />
              </View>

              {/* FE014 – Manual voice summary button */}
              <Pressable
                onPress={() => speakProductSummary(currentProduct)}
                className="px-3 py-2 rounded-full bg-primary self-start"
              >
                {({ pressed }) => (
                  <IconGeneral
                    type="speaker"
                    size={24}
                    fill={pressed ? "#F9FAFB" : "#FFFFFF"}
                  />
                )}
              </Pressable>
            </View>

            {/* Product Details - Barcode and Nutri-score */}
            <View className="gap-y-3">
              <View className="flex-row items-center gap-x-3">
                <IconGeneral type="barcode" fill={iconDefault} size={20} />
                <Tt className={`text-sm font-interRegular ${bodyText}`}>
                  Barcode:{" "}
                  <Tt className="font-interMedium">{currentProduct.barcode}</Tt>
                </Tt>
              </View>

              <View className="flex-row items-center gap-x-3">
                <IconGeneral type="nutrition" fill={iconDefault} size={20} />
                <Tt className={`text-sm ${bodyText}`}>
                  Nutri-score:{" "}
                  <Tt
                    className={`font-interBold text-base ${highContrast ? "text-black" : "text-primary"}`}
                  >
                    {currentProduct.nutriscoreGrade}
                  </Tt>
                </Tt>
              </View>
            </View>
          </View>

          {/* FE014 – Allergen summary banner */}
          <View className="mb-6">
            <AllergenSummaryBanner
              productName={currentProduct.productName}
              brand={currentProduct.brand}
              productAllergens={productAllergens}
            />
          </View>


          {/* PROFILE COMPATIBILITY CHECKS - Show active profile or all profiles if none selected */}
          {activeProfile ? (
            <View className="mb-8">
              <View className="mb-4">
                <ProfileProductCheck
                  profile={activeProfile}
                  product={simpleProduct}
                  completeBound={COMPLETENESS_BOUND}
                />
              </View>
            </View>
          ) : profiles.length > 0 ? (
            <View className="mb-8">
              {profiles.map((profile, idx) => (
                <View key={idx} className="mb-4">
                  <ProfileProductCheck
                    profile={profile}
                    product={simpleProduct}
                    completeBound={COMPLETENESS_BOUND}
                  />
                </View>
              ))}
            </View>
          ) : null}

          {/* ALLERGEN & CONTAIN TOGGLE BUTTON */}
          {productAllergens && productAllergens.length > 0 && (
            <Pressable
              onPress={() => {
                toggleShowContains();
                toggleAllergenHighlight();
                if (!showContainsBadges) {
                  handleContainsPress(productAllergens, "Product");
                }
              }}
              className={`mb-6 rounded-lg py-3 px-4 flex-row justify-center items-center ${primaryBtn}`}
            >
              {({ pressed }) => (
                <>
                  <IconGeneral
                    type={showContainsBadges ? "visibility-off" : "visibility"}
                    fill="white"
                    size={20}
                  />
                  <Tt className={`${primaryBtnText} font-interSemiBold ml-2`}>
                    {showContainsBadges
                      ? "Hide Allergen Information"
                      : "View Allergen Information"}
                  </Tt>
                </>
              )}
            </Pressable>
          )}

          {/* CONTAINS SECTION */}
          {showContainsBadges &&
            productAllergens &&
            productAllergens.length > 0 && (
              <View className="mb-8">
                <View className="flex-row justify-between items-center mb-3">
                  <Tt className={`font-interBold text-lg ${titleText}`}>
                    Contains
                  </Tt>
                  <Pressable
                    onPress={() =>
                      handleContainsPress(productAllergens, "Product")
                    }
                    className="px-2 py-1"
                  >
                    {({ pressed }) => (
                      <IconGeneral
                        type="inspect"
                        fill={pressed ? "#FF3D3D" : iconDefault}
                        size={22}
                      />
                    )}
                  </Pressable>
                </View>
                <View className="flex-row flex-wrap gap-2">
                  {productAllergens.map((allergen, idx) => (
                    <View
                      key={idx}
                      className="px-3 py-2 rounded-full bg-primary dark:bg-red-600"
                    >
                      <Tt className="text-white font-interMedium text-sm">
                        {allergen}
                      </Tt>
                    </View>
                  ))}
                </View>
              </View>
            )}

          {/* TRACES */}
          <View className="flex-row justify-between items-center mt-8">
            <Tt className="font-interSemiBold text-hsl20 text-lg">Traces</Tt>
            <Pressable
              onPress={() => openModal("accessibleTraces")}
              className="flex-row justify-center items-center self-end px-2 py-1"
            >
              {({ pressed }) => (
                <IconGeneral
                  type="inspect"
                  fill={pressed ? color.primary : color.iconDefault}
                  size={30}
                />
              )}
            </Pressable>
          </View>

          <Tt className="text-justify">
            {currentProduct.traces && currentProduct.traces.length > 0
              ? currentProduct.traces
              : "None"}
          </Tt>

          {/* NUTRIENTS */}
          <View className="flex-row justify-between items-center mt-8">
            <Tt className="font-interSemiBold text-hsl20 text-lg">Nutrients</Tt>
            <Pressable
              onPress={() => openModal("accessibleNutrients")}
              className="flex-row justify-center items-center self-end px-2 py-1"
            >
              {({ pressed }) => (
                <IconGeneral
                  type="inspect"
                  fill={pressed ? color.primary : color.iconDefault}
                  size={30}
                />
              )}
            </Pressable>
          </View>

          {currentProduct.nutriments &&
          Object.keys(currentProduct.nutriments).length > 0 ? (
            <NutrimentsTable nutriments={currentProduct.nutriments} />
          ) : (
            <Tt>No nutrient data available</Tt>
          )}

          {/* NUTRIENT LEVELS */}
          {currentProduct.nutrientLevels &&
            Object.keys(currentProduct.nutrientLevels).length > 0 && (
              <View className="mb-8">
                <Tt className="font-interSemiBold text-hsl20 text-lg mt-8">
                  Nutrient Levels
                </Tt>
                <NutrientLevels levels={currentProduct.nutrientLevels} />
              </View>
            )}

          {/* UNSUITABLE PRODUCT WARNING + RECOMMENDATIONS BANNER */}
          {altChecked && unsuitable && (
            <View
              className={`mb-8 p-4 rounded-lg border ${unsuitable?.unsuitable ? "border-[#FFD6D6]" : "border-[#E5E5E5]"} ${cardBase}`}
            >
              {/* Warning Alert */}
              {unsuitable?.unsuitable && (
                <View className="mb-4">
                  <UnsuitableWarning
                    reason={unsuitable.reason}
                    severity="alert"
                  />
                </View>
              )}

              {/* Recommendation Section */}
              <View className="mt-6 pt-6 border-t border-[#E5E5E5]">
                <Tt className={`font-interBold text-lg mb-4 ${titleText}`}>
                  Better Alternatives
                </Tt>
                {recommendations.length > 0 ? (
                  <RecommendationList
                    recommendations={recommendations}
                    title=""
                    subtitle=""
                  />
                ) : (
                  <Tt className={`text-sm text-center py-4 ${bodyText}`}>
                    {unsuitable?.unsuitable
                      ? formatAlternativesEmptyMessage(unsuitable?.reasons)
                      : (altAvoidAllergens?.length ?? 0) === 0
                        ? "No alternative products to show at the moment."
                        : "This product is suitable for your preferences. No alternative products are required."}
                  </Tt>
                )}
              </View>
            </View>
          )}

          {/* SECTION: INGREDIENTS */}
          <View className="mb-6">
            <View className="flex-row justify-between items-center mb-3">
              <Tt className={`font-interBold text-lg ${titleText}`}>
                Ingredients
              </Tt>
              <Pressable
                onPress={() => openModal("accessibleIngredients")}
                className="px-2 py-1"
              >
                {({ pressed }) => (
                  <IconGeneral
                    type="inspect"
                    fill={pressed ? "#FF3D3D" : iconDefault}
                    size={22}
                  />
                )}
              </Pressable>
            </View>

            {/* FE014 – Ingredients with allergen highlighting */}
            <AllergenHighlighter
              ingredientsText={currentProduct.ingredientsText}
              highlightAllergens={productAllergens}
              enabled={allergenHighlightEnabled}
              className={`text-justify ${highContrast ? "text-black" : ""}`}
            />

            {/* Keep IngredientSearch helper */}
            <View className="mt-4">
              <IngredientSearch
                ingredientsText={currentProduct.ingredientsText}
              />
            </View>
          </View>

          {/* SECTION: IMAGES */}
          {currentProduct.images && (
            <View className="mb-2">
              <Tt className="font-interBold text-lg text-hsl20 mb-3">Images</Tt>
              <ImagePanel images={currentProduct.images} />
            </View>
          )}


          {/* ADD TO SHOPPING LIST BUTTON */}
          <Pressable
            onPress={() => openModal("addToList")}
            className="bg-primary rounded-lg py-4 px-6 mt-8 mb-4 flex-row justify-center items-center active:bg-primary/80"
          >
            {({ pressed }) => (
              <>
                <IconGeneral type="cart-add" fill="white" size={24} />
                <Tt className="text-white font-interSemiBold text-lg ml-3">
                  Add to Shopping List
                </Tt>
              </>
            )}
          </Pressable>



        </View>
      </ScrollView>
    </Screen>
  );
}
