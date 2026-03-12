// Nutrient Levels tsx

import React from "react";
import { View } from "react-native";
import Tt from "../ui/UIText";

type NutrientLevels = {
  [key: string]: "low" | "moderate" | "medium" | "high" | string;
};

const COLORS: Record<string, string> = {
  low: "text-emerald-600",
  medium: "text-orange-600",
  moderate: "text-orange-600",
  high: "text-red-600",
};

const FIELDS = [
  { key: "salt", label: "Salt" },
  { key: "sugars", label: "Sugars" },
  { key: "fat", label: "Fat" },
  { key: "saturated-fat", label: "Saturated Fat" },
];

export default function NutrientLevels({ levels }: { levels: NutrientLevels }) {
  return (
    <View className="bg-white dark:bg-hsl15 rounded px-6 py-4 flex-row justify-between">

      {FIELDS.map(({ key, label }) => {
        const level = levels[key];
        if (!level) return null;
        const colorClass = COLORS[level] || "text-hsl40 dark:text-hsl80";

        return (
          <View key={key} className="items-center">
            <Tt className={`font-interBold capitalize ${colorClass}`}>{level}</Tt>
            <Tt className="mt-1 text-hsl20 font-interMedium">{label}</Tt>
          </View>
        );
      })}

    </View>
  );
}
