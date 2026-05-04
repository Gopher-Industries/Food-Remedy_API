// app/(app)/checkout.tsx

import React, { useEffect } from "react";
import { View, Pressable, FlatList, ActivityIndicator } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Tt from "@/components/ui/UIText";
import Screen from "@/components/layout/Screen";
import IconGeneral from "@/components/icons/IconGeneral";
import IconLogoHoriz from "@/components/icons/IconLogoHoriz";
import { useShoppingList } from "@/hooks/useShoppingList";

export default function CheckoutPage() {
  const { listId, shoppedBarcodes } = useLocalSearchParams<{ listId: string; shoppedBarcodes: string }>();
  const insets = useSafeAreaInsets();
  const { ready, loading, currentItems, loadList } = useShoppingList();

  useEffect(() => {
    if (ready && listId) {
      loadList(listId);
    }
  }, [ready, listId, loadList]);

  const checkedItems = currentItems.filter((i) => i.isChecked);
  const shoppedSet = new Set(JSON.parse(shoppedBarcodes || '[]'));
  const boughtItems = currentItems.filter((i) => shoppedSet.has(i.barcode));
  const pendingItems = checkedItems.filter((i) => !shoppedSet.has(i.barcode));

  const renderProductCard = (item: any) => {
    const highlight = getHighlight(item);

    return (
      <View key={item.barcode} className="flex-row items-center py-3.5 px-4 bg-white rounded-3xl shadow-sm dark:shadow-none">
        <View className="flex-1">
          <Tt className="font-interSemiBold text-sm text-hsl30 dark:text-hsl90" numberOfLines={2}>
            {item.productName}
          </Tt>
          <Tt className="text-hsl50 dark:text-hsl70 text-xs mt-0.5">
            Qty: {item.quantity}
          </Tt>
        </View>

        {highlight !== "" && (
          <View className="ml-3 px-3 py-1 rounded-lg bg-hsl90 dark:bg-hsl20">
            <Tt className="text-hsl30 dark:text-hsl90 text-xs font-interSemiBold">
              {highlight}
            </Tt>
          </View>
        )}
      </View>
    );
  };

  // Analyze product data to determine highlight
  const getHighlight = (item: any) => {
    const product = item.product;
    if (!product) return "";

    const nutriments = product.nutriments_normalized || product.nutriments || {};
    const ingredients = product.ingredientsText || "";
    const labels = product.labels || [];
    const nutrientLevels = product.nutrientLevels || {};
    const nutriscore = product.nutriscoreGrade;

    const hasIngredientText = typeof ingredients === "string" && ingredients.trim().length > 0;
    const hasLabels = labels.length > 0;
    const hasNutrientLevels = Object.keys(nutrientLevels).length > 0;
    const hasNutriments = Object.keys(nutriments).length > 0;
    if (!hasIngredientText && !hasLabels && !hasNutrientLevels && !hasNutriments) {
      return "";
    }

    const toNumber = (value: any) => {
      if (value == null) return null;
      const normalized = typeof value === "string" ? value.replace(",", ".") : value;
      const num = Number(normalized);
      return Number.isFinite(num) ? num : null;
    };

    const getNutrient = (keys: string[]) => {
      for (const key of keys) {
        const value = nutriments[key];
        const numeric = toNumber(value);
        if (numeric != null) return numeric;
      }
      return null;
    };

    const sugar = getNutrient(["sugars_g", "sugars_100g", "sugars"]);
    const satFat = getNutrient(["saturated_fat_g", "saturated-fat_100g", "saturated-fat"]);
    const salt = getNutrient(["salt_100g", "salt", "sodium_100g", "sodium_g"]);
    const carbs = getNutrient(["carbohydrates_g", "carbohydrates_100g", "carbohydrates"]);
    const protein = getNutrient(["proteins_g", "proteins_100g", "proteins"]);
    const fiber = getNutrient(["fiber_g", "fiber_100g", "fiber", "fibre_100g", "fibre"]);

    const isHigh = (level: string | undefined, value: number | null, threshold: number) => {
      if (level === "high") return true;
      if (level === "low") return false;
      return value != null ? value >= threshold : false;
    };
    const isLow = (level: string | undefined, value: number | null, threshold: number) => {
      if (level === "low") return true;
      if (level === "high") return false;
      return value != null ? value <= threshold : false;
    };

    const sugarLevel = nutrientLevels.sugars;
    const satFatLevel = nutrientLevels["saturated-fat"];
    const saltLevel = nutrientLevels.salt;
    const carbLevel = nutrientLevels.carbohydrates;
    const proteinLevel = nutrientLevels.protein;
    const fiberLevel = nutrientLevels.fibre || nutrientLevels.fiber;

    const sugarKnown = sugarLevel != null || sugar != null;
    const satFatKnown = satFatLevel != null || satFat != null;
    const saltKnown = saltLevel != null || salt != null;
    const carbKnown = carbLevel != null || carbs != null;
    const proteinKnown = proteinLevel != null || protein != null;
    const fiberKnown = fiberLevel != null || fiber != null;

    const highSugar = isHigh(sugarLevel, sugar, 15);
    const highSatFat = isHigh(satFatLevel, satFat, 5);
    const highSalt = isHigh(saltLevel, salt, 0.6);
    const highProtein = isHigh(proteinLevel, protein, 12);
    const lowCarbs = isLow(carbLevel, carbs, 10);
    const lowSugar = isLow(sugarLevel, sugar, 5);
    const lowSatFat = isLow(satFatLevel, satFat, 1.5);
    const lowSalt = isLow(saltLevel, salt, 0.12);
    const highFiber = isHigh(fiberLevel, fiber, 6);

    const healthyNutriscore = nutriscore && /^[AB]$/i.test(nutriscore);

    const glutenKeywords = ["wheat", "gluten", "barley", "rye"];
    const ingredientTextLower = ingredients.toLowerCase();
    const hasGluten = hasIngredientText && glutenKeywords.some((keyword: string) => ingredientTextLower.includes(keyword));
    const hasGlutenFreeLabel = labels.some((label: string) => label.toLowerCase().includes("gluten") && label.toLowerCase().includes("free"));
    const isGlutenFree = hasGlutenFreeLabel || (hasIngredientText && !hasGluten);

    const isOrganic = labels.some((label: string) => label.toLowerCase().includes("organic"));

    if (highProtein && proteinKnown) {
      return "💪 Rich in Protein";
    }

    if (sugarKnown && satFatKnown && saltKnown && !highSugar && !highSatFat && !highSalt && (healthyNutriscore || (lowSugar && lowSatFat && lowSalt))) {
      return "❤️ Heart Healthy";
    }

    if (carbKnown && lowCarbs && !highSugar && !highSatFat) {
      return "🍞 Low Carb";
    }

    if (isGlutenFree && hasIngredientText) {
      return "🌾 Gluten Free";
    }

    if (isOrganic) {
      return "🌱 Organic";
    }

    if (highFiber && fiberKnown) {
      return "🌾 High Fiber";
    }

    if (lowSugar && sugarKnown) {
      return "🍬 Low Sugar";
    }

    if (highSugar && sugarKnown) {
      return "🍬 High Sugar";
    }

    const nutrition = product.enrichment?.nutrition;
    if (nutrition && Array.isArray(nutrition.reasons) && nutrition.reasons.length > 0) {
      const reason = nutrition.reasons[0];
      const reasonText = String(reason).toLowerCase();
      if (reasonText.includes("protein")) return "💪 Rich in Protein";
      if (reasonText.includes("low") && (reasonText.includes("sugar") || reasonText.includes("fat") || reasonText.includes("salt"))) return "❤️ Heart Healthy";
      if (reasonText.includes("carb") || reasonText.includes("carbohydrate")) return "🍞 Low Carb";
      if (reasonText.includes("gluten")) return "🌾 Gluten Free";
      if (reasonText.includes("organic")) return "🌱 Organic";
      return nutrition.reasons[0];
    }

    return "";
  };

  if (!ready || loading) {
    return (
      <Screen className="p-safe">
        <View className="flex-row items-center justify-center py-2">
          <IconLogoHoriz />
        </View>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#FF3F3F" />
          <Tt className="mt-3 text-hsl50 dark:text-hsl70 text-sm">
            Loading checkout…
          </Tt>
        </View>
      </Screen>
    );
  }

  return (
    <Screen className="p-safe">
      {/* Logo */}
      <View className="flex-row items-center justify-center py-2">
        <IconLogoHoriz />
      </View>

      {/* Back button and Checkout label */}
      <View className="flex-row items-center px-4 mt-4">
        <Pressable
          onPress={() => router.back()}
          className="mr-4 p-2 rounded-full active:bg-hsl95 dark:active:bg-hsl18"
        >
          <IconGeneral type="arrow-backward-ios" fill="hsl(0, 0%, 40%)" size={24} />
        </Pressable>
        <Tt className="text-xl font-interBold">Checkout</Tt>
      </View>

      {/* Product List sub label */}
      <View className="px-4 mt-4">
        <Tt className="text-lg font-interSemiBold text-hsl30 dark:text-hsl90">Product List</Tt>
      </View>

      <View className="px-4 mt-4 space-y-6">
        <View>
          <Tt className="text-sm font-interSemiBold text-hsl30 dark:text-hsl90">Items bought</Tt>
          <View className="mt-3 space-y-6">
            {boughtItems.length > 0 ? (
              boughtItems.map(renderProductCard)
            ) : (
              <Tt className="text-hsl50 dark:text-hsl70 text-sm">No items bought yet</Tt>
            )}
          </View>
        </View>

        <View>
          <Tt className="text-sm font-interSemiBold text-hsl30 dark:text-hsl90">Items pending</Tt>
          <View className="mt-3 space-y-6">
            {pendingItems.length > 0 ? (
              pendingItems.map(renderProductCard)
            ) : (
              <Tt className="text-hsl50 dark:text-hsl70 text-sm">No items</Tt>
            )}
          </View>
        </View>
      </View>

      {/* Go Home button */}
      <View
        className="absolute bottom-0 left-0 right-0 px-4 py-3 bg-white dark:bg-hsl15 border-t border-hsl90 dark:border-hsl20"
        style={{ paddingBottom: insets.bottom + 8 }}
      >
        <Pressable
          onPress={() => router.replace("/")}
          className="flex-row items-center justify-center py-3 rounded-xl bg-primary active:bg-red-600"
        >
          <Tt className="text-white font-interSemiBold text-sm">
            Go Home
          </Tt>
        </Pressable>
      </View>
    </Screen>
  );
}