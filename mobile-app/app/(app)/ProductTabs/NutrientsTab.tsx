import React from "react";
import { View } from "react-native";
import Tt from "@/components/ui/UIText";
import NutrimentsTable from "@/components/product/NutrimentsTable";
import NutrientLevels from "@/components/product/NutrientLevels";

type Props = {
  product: any;
};

export default function NutrientsTab({ product }: Props) {
  if (!product) return null;

  const hasNutriments =
    product.nutriments && Object.keys(product.nutriments).length > 0;

  const hasLevels =
    product.nutrientLevels && Object.keys(product.nutrientLevels).length > 0;

  return (
    <View className="mt-8 mb-8 px-4">
      <Tt className="font-interBold text-lg text-hsl20 mb-4">
        Nutritional Information
      </Tt>

      {hasLevels && (
        <View className="mb-4">
          <NutrientLevels levels={product.nutrientLevels} />
        </View>
      )}

      {hasNutriments ? (
        <NutrimentsTable nutriments={product.nutriments} />
      ) : (
        <Tt>No nutrient data available</Tt>
      )}
    </View>
  );
}