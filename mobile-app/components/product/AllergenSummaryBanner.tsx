// components/product/AllergenSummaryBanner.tsx

import React from "react";
import { View } from "react-native";
import Tt from "../ui/UIText";
import IconGeneral from "../icons/IconGeneral";

interface AllergenSummaryBannerProps {
  productName?: string;
  brand?: string | null;
  productAllergens: string[]; // normalised
}

/**
 * Simple summary banner explaining allergen presence.
 * (Profile-agnostic: talks about allergens in the product, not per user.)
 */
const AllergenSummaryBanner: React.FC<AllergenSummaryBannerProps> = ({
  productName,
  brand,
  productAllergens,
}) => {
  const hasAllergens = productAllergens.length > 0;

  const textList =
    productAllergens.length > 0
      ? productAllergens.join(", ")
      : "No allergens listed for this product.";

  const title = hasAllergens ? "Allergen Summary" : "Allergen Information";
  const subtitle = hasAllergens
    ? `This product lists: ${textList}.`
    : "No known allergens are listed in the product data.";

  const bgClass = hasAllergens
    ? "bg-[#FEF3C7] border-[#F59E0B]" // soft amber
    : "bg-[#ECFDF3] border-[#16A34A]"; // soft green

  const iconType = hasAllergens ? "warning" : "check";
  const iconFill = hasAllergens ? "#F59E0B" : "#16A34A";

  return (
    <View
      className={`flex-row items-start border rounded-lg px-3 py-3 mb-3 ${bgClass}`}
    >
      <View className="mr-3 mt-1">
        <IconGeneral type={iconType} size={24} fill={iconFill} />
      </View>

      <View className="flex-1">
        {productName && (
          <Tt className="text-xs text-hsl40 dark:text-hsl80 mb-0.5">
            {productName}
            {brand ? ` (${brand})` : ""}
          </Tt>
        )}
        <Tt className="font-interSemiBold text-sm mb-0.5">{title}</Tt>
        <Tt className="text-xs text-hsl40 dark:text-hsl80">{subtitle}</Tt>
      </View>
    </View>
  );
};

export default AllergenSummaryBanner;
