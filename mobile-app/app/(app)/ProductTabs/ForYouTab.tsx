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
  const demographicsProfile = profiles?.find(
    (p: any) => p.profileId === "demographics"
  );

  const memberProfile =
  activeProfile ||
  profiles?.find((p: any) => p.relationship === "Self") ||
  profiles?.[0] ||
  null;

if (!memberProfile) {
  return {
    gender: "Not available",
    ageGroup: "Not available",
    activityLevel: "Not available",
    goals: [],
    allergens: [],
  };
}

const isSelf = memberProfile.relationship === "Self";

  const rawSex = isSelf
    ? demographicsProfile?.sex ?? memberProfile.sex
    : memberProfile.sex;

  const formatLabel = (value: string) =>
    value.charAt(0).toUpperCase() + value.slice(1).replace(/-/g, " ");

  const gender = rawSex ? formatLabel(String(rawSex)) : "Not available";

  const rawAgeBand = isSelf
    ? demographicsProfile?.ageBand ?? memberProfile.ageBand
    : memberProfile.ageBand;

  let ageGroup = "Not available";
  if (rawAgeBand) {
    ageGroup = String(rawAgeBand);
  } else {
    const age = Number(memberProfile.age) || 0;
    if (age > 0 && age <= 18) ageGroup = "0–18";
    else if (age <= 35) ageGroup = "19–35";
    else if (age <= 50) ageGroup = "36–50";
    else if (age > 50) ageGroup = "50+";
  }

  const rawGuardrailLevel = isSelf
    ? demographicsProfile?.guardrailLevel ?? memberProfile.guardrailLevel
    : memberProfile.guardrailLevel;

  const activityLevel = rawGuardrailLevel
    ? formatLabel(String(rawGuardrailLevel))
    : "Not available";

  const goals = Array.from(new Set(normalizeArray(memberProfile.dietaryForm)));

  const allergens = Array.from(
    new Set([
      ...normalizeArray(memberProfile.allergies),
      ...normalizeArray(memberProfile.intolerances),
    ])
  );

  return {
    gender,
    ageGroup,
    activityLevel,
    goals,
    allergens,
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
