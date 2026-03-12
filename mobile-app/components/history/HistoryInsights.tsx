// History Insights Component
// Displays scan statistics and insights for the history page

import React, { useMemo } from "react";
import { View } from "react-native";
import Tt from "@/components/ui/UIText";
import IconGeneral from "@/components/icons/IconGeneral";
import type { HistoryItem } from "@/types/HistoryItem";

interface HistoryInsightsProps {
  items: HistoryItem[];
}

interface InsightCardProps {
  icon: string;
  iconColor: string;
  value: string | number;
  label: string;
  bgColor?: string;
}

function InsightCard({ icon, iconColor, value, label, bgColor = "bg-white dark:bg-hsl15" }: InsightCardProps) {
  return (
    <View className={`flex-1 ${bgColor} rounded-xl p-3 border border-hsl90 dark:border-hsl20`}>
      <View className="flex-row items-center mb-1">
        <IconGeneral type={icon as any} fill={iconColor} size={20} />
        <Tt className="text-2xl font-interBold text-hsl20 ml-2">{value}</Tt>
      </View>
      <Tt className="text-xs text-hsl40 dark:text-hsl80 font-interMedium">{label}</Tt>
    </View>
  );
}

export default function HistoryInsights({ items }: HistoryInsightsProps) {
  const insights = useMemo(() => {
    if (items.length === 0) {
      return {
        totalScans: 0,
        todayScans: 0,
        weekScans: 0,
        avgNutriScore: "N/A",
        topCategory: "None",
        allergenWarnings: 0,
        healthyProducts: 0,
      };
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    let todayCount = 0;
    let weekCount = 0;
    let nutriScoreSum = 0;
    let nutriScoreCount = 0;
    let allergenWarningCount = 0;
    let healthyCount = 0;
    const categoryCount: Record<string, number> = {};

    const nutriScoreMap: Record<string, number> = {
      A: 5,
      B: 4,
      C: 3,
      D: 2,
      E: 1,
    };

    items.forEach((item) => {
      const lastSeen = new Date(item.lastSeenAt);
      
      // Date-based counts
      if (lastSeen >= today) {
        todayCount++;
      }
      if (lastSeen >= weekAgo) {
        weekCount++;
      }

      // Product analysis
      const product = item.product;
      if (product) {
        // Nutri-score
        const grade = String(product.nutriscoreGrade || "").toUpperCase();
        if (grade && nutriScoreMap[grade]) {
          nutriScoreSum += nutriScoreMap[grade];
          nutriScoreCount++;
        }

        // Categories
        if (product.categories && product.categories.length > 0) {
          const mainCategory = product.categories[0];
          categoryCount[mainCategory] = (categoryCount[mainCategory] || 0) + 1;
        }

        // Allergen warnings
        if (product.allergens && product.allergens.length > 0) {
          allergenWarningCount++;
        }

        // Healthy products (nutri-score A or B)
        if (grade === "A" || grade === "B") {
          healthyCount++;
        }
      }
    });

    // Calculate average nutri-score
    let avgNutriScore = "N/A";
    if (nutriScoreCount > 0) {
      const avg = nutriScoreSum / nutriScoreCount;
      if (avg >= 4.5) avgNutriScore = "A";
      else if (avg >= 3.5) avgNutriScore = "B";
      else if (avg >= 2.5) avgNutriScore = "C";
      else if (avg >= 1.5) avgNutriScore = "D";
      else avgNutriScore = "E";
    }

    // Find top category
    let topCategory = "Various";
    let maxCount = 0;
    Object.entries(categoryCount).forEach(([cat, count]) => {
      if (count > maxCount) {
        maxCount = count;
        topCategory = cat.split(":").pop() || cat; // Remove OpenFoodFacts prefix
      }
    });
    if (topCategory.length > 12) {
      topCategory = topCategory.substring(0, 12) + "...";
    }

    return {
      totalScans: items.length,
      todayScans: todayCount,
      weekScans: weekCount,
      avgNutriScore,
      topCategory,
      allergenWarnings: allergenWarningCount,
      healthyProducts: healthyCount,
    };
  }, [items]);

  if (items.length === 0) {
    return null;
  }

  return (
    <View className="w-[95%] mx-auto mb-4">
      <Tt className="font-interSemiBold text-hsl20 mb-3">Insights</Tt>
      
      {/* First row - main stats */}
      <View className="flex-row gap-2 mb-2">
        <InsightCard
          icon="barcode-scan"
          iconColor="#3B82F6"
          value={insights.totalScans}
          label="Total Scans"
        />
        <InsightCard
          icon="product"
          iconColor="#10B981"
          value={insights.todayScans}
          label="Today"
        />
        <InsightCard
          icon="search"
          iconColor="#8B5CF6"
          value={insights.weekScans}
          label="This Week"
        />
      </View>

      {/* Second row - product insights */}
      <View className="flex-row gap-2">
        <InsightCard
          icon="nutrition"
          iconColor="#F59E0B"
          value={insights.avgNutriScore}
          label="Avg Score"
        />
        <InsightCard
          icon="check"
          iconColor="#10B981"
          value={insights.healthyProducts}
          label="Healthy (A/B)"
        />
        <InsightCard
          icon="warning"
          iconColor="#EF4444"
          value={insights.allergenWarnings}
          label="Has Allergens"
        />
      </View>
    </View>
  );
}
