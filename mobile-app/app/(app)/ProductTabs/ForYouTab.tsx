import React, { useMemo } from "react";
import { View } from "react-native";
import Tt from "@/components/ui/UIText";
import ProductCompareSection, {
  ProductData,
  UserDemographics,
} from "@/components/product/ProductCompareSection";
import { useProfile } from "@/components/providers/ProfileProvider";
import { usePreferences } from "@/components/providers/PreferencesProvider";

function normalizeArray(value: any): string[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;

        if (item && typeof item === "object") {
          return String(item.name ?? item.label ?? item.value ?? "");
        }

        return "";
      })
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function buildUserProfile(
  activeProfile: any,
  profiles: any[]
): UserDemographics {
  const visibleProfiles = profiles.filter((profile) => {
    const profileId = String(profile.profileId || "").toLowerCase().trim();
    const relationship = String(profile.relationship || "").toLowerCase().trim();
    return profileId !== "demographics" && relationship !== "demographics";
  });

  const demographicsProfile = profiles?.find(
    (p: any) => p.profileId === "demographics"
  );

  const selectedProfile =
    activeProfile ||
    (visibleProfiles.length > 0 ? visibleProfiles[0] : null) ||
    demographicsProfile ||
    null;

  if (!selectedProfile) {
    return {
      gender: "Not available",
      ageGroup: "Not available",
      activityLevel: "Not available",
      goals: [],
      allergens: [],
    };
  }

  const gender =
    String(
      selectedProfile.gender ??
        selectedProfile.sex ??
        selectedProfile.userGender ??
        "Not available"
    ).trim() || "Not available";

  let ageGroup = "Not available";
  if (selectedProfile.ageBand) {
    ageGroup = selectedProfile.ageBand;
  } else {
    const age =
      Number(selectedProfile.age) ||
      Number(selectedProfile.ageYears) ||
      Number(selectedProfile.userAge) ||
      0;
    if (age > 0 && age <= 18) ageGroup = "0–18";
    else if (age <= 35) ageGroup = "19–35";
    else if (age <= 50) ageGroup = "36–50";
    else if (age > 50) ageGroup = "50+";
  }

  const activityLevel =
    String(
      selectedProfile.activityLevel ??
        selectedProfile.activity ??
        selectedProfile.exerciseLevel ??
        selectedProfile.guardrailLevel ??
        "Not available"
    ).trim() || "Not available";

  const rawGoals = [
    ...normalizeArray(selectedProfile.goals),
    ...normalizeArray(selectedProfile.healthGoals),
    ...normalizeArray(selectedProfile.preferences?.goals),
    ...normalizeArray(selectedProfile.dietaryGoals),
  ];

  const mappedGoals: UserDemographics["goals"] = [];

  rawGoals.forEach((goal) => {
    const lower = goal.toLowerCase();

    if (lower.includes("sodium")) mappedGoals.push("Lower sodium");
    else if (lower.includes("heart")) mappedGoals.push("Heart health");
    else if (lower.includes("sugar")) mappedGoals.push("Lower sugar");
    else if (lower.includes("protein")) mappedGoals.push("High protein");
  });

  const rawAllergens = [
    ...normalizeArray(selectedProfile.allergies),
    ...normalizeArray(selectedProfile.intolerances),
    ...normalizeArray(selectedProfile.avoidAllergens),
    ...normalizeArray(selectedProfile.preferences?.avoidAllergens),
  ];

  const mappedAllergens: UserDemographics["allergens"] = [];

  rawAllergens.forEach((item) => {
    const lower = item.toLowerCase();

    if (lower.includes("peanut")) mappedAllergens.push("Peanuts");
    else if (lower.includes("milk") || lower.includes("dairy")) {
      mappedAllergens.push("Milk");
    } else if (lower.includes("soy")) {
      mappedAllergens.push("Soy");
    } else if (lower.includes("gluten") || lower.includes("wheat")) {
      mappedAllergens.push("Gluten");
    } else if (lower.includes("tree nut") || lower.includes("almond")) {
      mappedAllergens.push("Tree nuts");
    }
  });

  return {
    gender,
    ageGroup,
    activityLevel,
    goals: Array.from(new Set(mappedGoals)),
    allergens: Array.from(new Set(mappedAllergens)),
  };
}

function buildProductData(currentProduct: any): ProductData {
  const nutriments = currentProduct?.nutriments ?? {};

  const sugar =
    Number(
      nutriments["sugars_100g"] ??
        nutriments["sugars_serving"] ??
        nutriments["sugars"] ??
        0
    ) || 0;

  const sodium =
    Number(
      nutriments["sodium_100g"] ??
        nutriments["sodium_serving"] ??
        nutriments["sodium"] ??
        0
    ) || 0;

  const protein =
    Number(
      nutriments["proteins_100g"] ??
        nutriments["proteins_serving"] ??
        nutriments["proteins"] ??
        0
    ) || 0;

  const allergens = [
    ...normalizeArray(currentProduct?.allergens),
    ...normalizeArray(currentProduct?.traces),
  ];

  return {
    name: currentProduct?.productName ?? "Unknown product",
    sugar,
    sodium,
    protein,
    allergens,
  };
}

type Props = {
  product: any;
};

export default function CompareTab({ product }: Props) {
  const { profiles, activeProfile } = useProfile();
  const { darkMode } = usePreferences();

  const userProfile = useMemo(() => {
    return buildUserProfile(activeProfile, profiles || []);
  }, [activeProfile, profiles]);

  const productData = useMemo(() => {
    return buildProductData(product);
  }, [product]);

  if (!product) return null;

  return (
    <View className={`mt-6 mb-8 ${darkMode ? "bg-hsl15" : "bg-white"}`}>
      <View
        className={`mb-4 rounded-xl border p-4 ${
          darkMode ? "border-hsl30 bg-hsl20" : "border-gray-200 bg-white"
        }`}
      >
        <Tt
          className={`font-interBold text-lg ${
            darkMode ? "text-white" : "text-black"
          }`}
        >
          {product?.productName ?? "Unknown product"}
        </Tt>

        <Tt
          className={`mt-1 text-sm ${
            darkMode ? "text-hsl70" : "text-gray-600"
          }`}
        >
          {product?.brand ?? "Unknown brand"}
        </Tt>
      </View>

      <ProductCompareSection userProfile={userProfile} product={productData} />
    </View>
  );
}
