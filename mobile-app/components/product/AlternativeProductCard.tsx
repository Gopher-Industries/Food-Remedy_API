/**
 * AlternativeProductCard.tsx
 * Card displaying a recommended alternative product with score and reasons
 */

import React from "react";
import { Pressable, View } from "react-native";
import type { RecommendationScore } from "@/services/recommendations";
import IconGeneral from "@/components/icons/IconGeneral";
import Tt from "@/components/ui/UIText";
import { router } from "expo-router";
import { useProduct } from "@/components/providers/ProductProvider";

interface AlternativeProductCardProps {
  recommendation: RecommendationScore;
  onSelect?: (product: any) => void;
}

/**
 * Color map for safety ratings
 */
const SAFETY_COLORS = {
  green: { bg: "bg-[#F0F9F7]", border: "border-[#A8E6D7]", text: "text-[#0D7C59]", badge: "bg-green-100" },
  grey: { bg: "bg-[#F5F5F5]", border: "border-[#D3D3D3]", text: "text-[#666]", badge: "bg-gray-100" },
  red: { bg: "bg-[#FFF0F0]", border: "border-[#FFD6D6]", text: "text-[#C41E3A]", badge: "bg-red-100" },
};

export default function AlternativeProductCard({
  recommendation,
  onSelect,
}: AlternativeProductCardProps) {
  const { setBarcode } = useProduct();
  const colors = SAFETY_COLORS[recommendation.safetyRating];
  const scorePercent = Math.min(100, Math.round(recommendation.score));
  const scoreColor =
    recommendation.safetyRating === "green"
      ? "text-green-600"
      : recommendation.safetyRating === "grey"
        ? "text-gray-600"
        : "text-red-600";

  const handlePress = () => {
    if (onSelect) {
      onSelect(recommendation.product);
    } else {
      const barcode = recommendation.product?.barcode;
      if (!barcode) return;
      setBarcode(barcode);
      router.push("/product");
    }
  };

  return (
    <Pressable onPress={handlePress}>
      {({ pressed }) => (
        <View
          className={`${colors.bg} border ${colors.border} rounded-lg p-4 mb-3 ${pressed ? "opacity-70" : "opacity-100"}`}
        >
          {/* Header: Product Name + Score */}
          <View className="flex-row justify-between items-start mb-2">
            <View className="flex-1 pr-4">
              <Tt className="font-interBold text-base text-hsl20 leading-tight">
                {recommendation.product.productName}
              </Tt>
              {recommendation.product.brand && (
                <Tt className="font-interRegular text-xs text-hsl30 dark:text-hsl90 mt-1">
                  {recommendation.product.brand}
                </Tt>
              )}
            </View>

            {/* Score Badge */}
            <View className={`${colors.badge} rounded-full px-3 py-1 items-center justify-center min-w-[50px]`}>
              <Tt className={`${scoreColor} font-interBold text-sm`}>{scorePercent}</Tt>
            </View>
          </View>

          {/* Safety Rating Indicator */}
          <View className="flex-row items-center gap-x-2 mb-3">
            <View
              className={`w-3 h-3 rounded-full ${recommendation.safetyRating === "green" ? "bg-green-600" : recommendation.safetyRating === "grey" ? "bg-gray-400" : "bg-red-600"}`}
            />
            <Tt className={`${colors.text} text-xs font-interMedium capitalize`}>
              {recommendation.safetyRating === "green"
                ? "✓ Recommended"
                : recommendation.safetyRating === "grey"
                  ? "⚪ Acceptable"
                  : "⚠️ Concerns"}
            </Tt>
          </View>

          {/* Reasons / Benefits */}
          <View className="gap-y-1">
            {recommendation.reasons.slice(0, 3).map((reason, idx) => (
              <Tt key={idx} className={`${colors.text} text-xs`}>
                {reason}
              </Tt>
            ))}
          </View>

          {/* Nutri-score Comparison (if available) */}
          {recommendation.product.nutriscoreGrade && (
            <View className="flex-row items-center gap-x-2 mt-3 pt-2 border-t border-opacity-20">
              <IconGeneral type="nutrition" fill={colors.text.replace("text-", "")} size={16} />
              <Tt className={`${colors.text} text-xs font-interMedium`}>
                Nutri-score: <Tt className="font-interBold">{recommendation.product.nutriscoreGrade.toUpperCase()}</Tt>
              </Tt>
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
}
