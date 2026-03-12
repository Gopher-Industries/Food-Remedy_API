/**
 * RecommendationList.tsx
 * Displays a list of recommended alternative products
 */

import React from "react";
import { View, ScrollView } from "react-native";
import type { RecommendationScore } from "@/services/recommendations";
import Tt from "@/components/ui/UIText";
import AlternativeProductCard from "@/components/product/AlternativeProductCard";

interface RecommendationListProps {
  recommendations: RecommendationScore[];
  title?: string;
  subtitle?: string;
  onSelectProduct?: (product: any) => void;
  loading?: boolean;
}

export default function RecommendationList({
  recommendations,
  title = "Better Alternatives",
  subtitle = "Healthier options for you",
  onSelectProduct,
  loading = false,
}: RecommendationListProps) {
  if (loading) {
    return (
      <View className="mb-6">
        <Tt className="font-interBold text-lg text-hsl20 mb-2">{title}</Tt>
        <View className="bg-white dark:bg-hsl15 rounded-lg p-4 items-center justify-center h-24">
          <Tt className="text-hsl30 dark:text-hsl90 font-interRegular">Finding alternatives...</Tt>
        </View>
      </View>
    );
  }

  if (!recommendations || recommendations.length === 0) {
    return (
      <View className="mb-6">
        <Tt className="font-interBold text-lg text-hsl20 mb-2">{title}</Tt>
        <View className="bg-[#F5F5F5] rounded-lg p-4 items-center justify-center py-6">
          <Tt className="text-hsl30 dark:text-hsl90 font-interRegular text-center">
            No suitable alternatives found. Try searching in different categories.
          </Tt>
        </View>
      </View>
    );
  }

  return (
    <View className="mb-6">
      {/* Header */}
      <View className="mb-3">
        <Tt className="font-interBold text-lg text-hsl20">{title}</Tt>
        {subtitle && <Tt className="text-sm text-hsl30 dark:text-hsl90 mt-1">{subtitle}</Tt>}
      </View>

      {/* Recommendations */}
      <View>
        {recommendations.map((rec, idx) => (
          <AlternativeProductCard
            key={`${rec.product.barcode}-${idx}`}
            recommendation={rec}
            onSelect={onSelectProduct}
          />
        ))}
      </View>

      {/* Footer Info */}
      {recommendations.length > 0 && (
        <View className="mt-2 pt-2 border-t border-[#E5E5E5]">
          <Tt className="text-xs text-hsl30 dark:text-hsl90 font-interRegular text-center">
            Recommendations prioritize Green ratings and allergen safety
          </Tt>
        </View>
      )}
    </View>
  );
}
