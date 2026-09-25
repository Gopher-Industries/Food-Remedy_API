import React, { useMemo } from "react";
import { View, Text } from "react-native";
import { FontAwesome } from "@expo/vector-icons";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import type { AllergenSafetyAssessment } from "@/services/allergenSafety";
import {
  guardOverallFitForAllergenSafety,
  presentAllergenSuitability,
} from "@/services/profileProductSuitability";

type Goal = "Lower sodium" | "Heart health" | "Lower sugar" | "High protein";
export interface UserDemographics {
  gender: string;
  ageGroup: string;
  activityLevel: string;
  goals: Goal[];
  allergens: string[];
}

export interface ProductData {
  name: string;
  sugar: number;
  sodium: number;
  protein: number;
  allergenSafety: AllergenSafetyAssessment;
}

interface CompareRow {
  id: string;
  title: string;
  status: "good" | "watch" | "bad";
  label: string;
  description: string;
}

interface Props {
  userProfile: UserDemographics;
  product: ProductData;
}

const getStatusStyles = (
  status: "good" | "watch" | "bad",
  darkMode: boolean
) => {
  switch (status) {
    case "good":
      return {
        icon: "check-circle" as const,
        iconColor: "#16a34a",
        badgeBg: darkMode ? "bg-green-950" : "bg-green-100",
        badgeText: darkMode ? "text-green-200" : "text-green-800",
        borderClass: darkMode ? "border-green-700" : "border-green-200",
      };

    case "watch":
      return {
        icon: "exclamation-circle" as const,
        iconColor: "#d97706",
        badgeBg: darkMode ? "bg-yellow-950" : "bg-yellow-100",
        badgeText: darkMode ? "text-yellow-200" : "text-yellow-800",
        borderClass: darkMode ? "border-yellow-700" : "border-yellow-200",
      };

    default:
      return {
        icon: "times-circle" as const,
        iconColor: "#dc2626",
        badgeBg: darkMode ? "bg-red-950" : "bg-red-100",
        badgeText: darkMode ? "text-red-200" : "text-red-800",
        borderClass: darkMode ? "border-red-700" : "border-red-200",
      };
  }
};

const getOverallScore = (
  rows: CompareRow[],
  allergenSafety: AllergenSafetyAssessment
) => {
  let total = 0;

  rows.forEach((row) => {
    if (row.status === "good") total += 2;
    else if (row.status === "watch") total += 1;
  });

  const max = rows.length * 2;
  const percentage = max === 0 ? 0 : Math.round((total / max) * 100);

  let label: "Good fit" | "Moderate fit" | "Poor fit" = "Moderate fit";
  let status: "good" | "watch" | "bad" = "watch";

  const allergenGuard = guardOverallFitForAllergenSafety(
    percentage,
    allergenSafety
  );
  if (allergenGuard) return allergenGuard;

  if (percentage >= 75) {
    label = "Good fit";
    status = "good";
  } else if (percentage < 40) {
    label = "Poor fit";
    status = "bad";
  }

  return { percentage, label, status };
};

export default function ProductCompareSection({
  userProfile,
  product,
}: Props) {
  const { darkMode } = usePreferences();

  const compareRows = useMemo(() => {
    const rows: CompareRow[] = [];

    if (
      userProfile.goals.includes("Lower sodium") ||
      userProfile.goals.includes("Heart health")
    ) {
      if (product.sodium <= 120) {
        rows.push({
          id: "sodium",
          title: "Sodium vs your goals",
          status: "good",
          label: "Within target",
          description:
            "This product is low in sodium per serve, so it better supports lower sodium and heart health goals.",
        });
      } else if (product.sodium <= 250) {
        rows.push({
          id: "sodium",
          title: "Sodium vs your goals",
          status: "watch",
          label: "Watch portion",
          description:
            "This product has moderate sodium. It may still fit your goals, but portion size matters.",
        });
      } else {
        rows.push({
          id: "sodium",
          title: "Sodium vs your goals",
          status: "bad",
          label: "High sodium",
          description:
            "This product is high in sodium compared to your selected goals and may not be the best fit.",
        });
      }
    }

    if (
      userProfile.goals.includes("Lower sugar") ||
      userProfile.goals.includes("Heart health")
    ) {
      if (product.sugar <= 5) {
        rows.push({
          id: "sugar",
          title: "Sugar vs your goals",
          status: "good",
          label: "Low sugar",
          description:
            "Sugar is low per serve, which supports lower sugar and heart health preferences.",
        });
      } else if (product.sugar <= 10) {
        rows.push({
          id: "sugar",
          title: "Sugar vs your goals",
          status: "watch",
          label: "Moderate sugar",
          description:
            "Sugar is moderate per serve. This may still be acceptable depending on total daily intake.",
        });
      } else {
        rows.push({
          id: "sugar",
          title: "Sugar vs your goals",
          status: "bad",
          label: "High sugar",
          description:
            "Sugar is higher than ideal for a user trying to reduce sugar intake.",
        });
      }
    }

    if (userProfile.goals.includes("High protein")) {
      if (product.protein >= 10) {
        rows.push({
          id: "protein",
          title: "Protein support",
          status: "good",
          label: "Protein rich",
          description:
            "This product provides strong protein support and matches your goal well.",
        });
      } else if (product.protein >= 5) {
        rows.push({
          id: "protein",
          title: "Protein support",
          status: "watch",
          label: "Moderate protein",
          description:
            "This product contains some protein, but it may not be enough if protein is your main priority.",
        });
      } else {
        rows.push({
          id: "protein",
          title: "Protein support",
          status: "bad",
          label: "Low protein",
          description:
            "This product is low in protein and is not the strongest match for a high-protein goal.",
        });
      }
    }

    const allergenPresentation = presentAllergenSuitability(
      product.allergenSafety
    );
    rows.push({
      id: "allergens",
      title: "Allergen check",
      ...allergenPresentation,
    });

    return rows;
  }, [userProfile, product]);

  const overall = getOverallScore(compareRows, product.allergenSafety);
  const overallStyles = getStatusStyles(overall.status, darkMode);

  return (
    <View className={`mt-5 w-full px-4 ${darkMode ? "bg-hsl15" : "bg-white"}`}>
      <View
        className={`mb-4 rounded-xl border p-4 ${
          darkMode
            ? "border-red-700 bg-red-950"
            : "border-red-200 bg-red-50"
        }`}
      >
        <Text
          className={`mb-2 text-[11px] font-extrabold tracking-[1px] ${
            darkMode ? "text-red-200" : "text-red-400"
          }`}
        >
          COMPARISON USES THIS PROFILE
        </Text>

        <Text
          className={`text-[10px] font-semibold uppercase ${
            darkMode ? "text-hsl70" : "text-gray-500"
          }`}
        >
          Demographics
        </Text>

        <Text
          className={`mb-3 mt-1 text-sm font-semibold ${
            darkMode ? "text-white" : "text-gray-800"
          }`}
        >
          {userProfile.gender} • {userProfile.ageGroup} •{" "}
          {userProfile.activityLevel}
        </Text>

        <Text
          className={`text-[10px] font-semibold uppercase ${
            darkMode ? "text-hsl70" : "text-gray-500"
          }`}
        >
          Goals
        </Text>

        <Text
          className={`mb-3 mt-1 text-sm font-semibold ${
            darkMode ? "text-white" : "text-gray-800"
          }`}
        >
          {userProfile.goals.length > 0
            ? userProfile.goals.join(", ")
            : "None"}
        </Text>

        <Text
          className={`text-[10px] font-semibold uppercase ${
            darkMode ? "text-hsl70" : "text-gray-500"
          }`}
        >
          Allergens
        </Text>

        <Text
          className={`mt-1 text-sm font-semibold ${
            darkMode ? "text-white" : "text-gray-800"
          }`}
        >
          {userProfile.allergens.length > 0
            ? userProfile.allergens.join(", ")
            : "None"}
        </Text>
      </View>

      <View
        className={`mb-4 rounded-xl border p-4 ${overallStyles.borderClass} ${
          darkMode ? "bg-hsl20" : "bg-white"
        }`}
      >
        <View className="flex-row items-center gap-2">
          <FontAwesome
            name={overallStyles.icon}
            size={22}
            color={overallStyles.iconColor}
          />

          <Text
            className={`text-base font-bold ${
              darkMode ? "text-white" : "text-gray-900"
            }`}
          >
            Overall product match
          </Text>
        </View>

        <View
          className={`mt-3 self-start rounded-full px-3 py-1 ${overallStyles.badgeBg}`}
        >
          <Text className={`text-xs font-semibold ${overallStyles.badgeText}`}>
            {overall.label} • {overall.percentage}%
          </Text>
        </View>

        <Text
          className={`mt-3 text-sm ${
            darkMode ? "text-hsl70" : "text-gray-600"
          }`}
        >
          This result is calculated using the user demographic profile, health
          goals, and allergen checks.
        </Text>
      </View>

      {compareRows.map((row) => {
        const styles = getStatusStyles(row.status, darkMode);

        return (
          <View
            key={row.id}
            className={`mb-4 rounded-xl border p-4 ${styles.borderClass} ${
              darkMode ? "bg-hsl20" : "bg-white"
            }`}
          >
            <View className="flex-row items-center gap-2">
              <FontAwesome name={styles.icon} size={20} color={styles.iconColor} />

              <Text
                className={`text-sm font-bold ${
                  darkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {row.title}
              </Text>
            </View>

            <View
              className={`mt-3 self-start rounded-full px-3 py-1 ${styles.badgeBg}`}
            >
              <Text className={`text-xs font-semibold ${styles.badgeText}`}>
                {row.label}
              </Text>
            </View>

            <Text
              className={`mt-3 text-sm ${
                darkMode ? "text-hsl70" : "text-gray-600"
              }`}
            >
              {row.description}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
