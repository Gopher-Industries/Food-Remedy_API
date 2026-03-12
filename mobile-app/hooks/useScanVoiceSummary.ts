// hooks/useScanVoiceSummary.ts

import { useEffect } from "react";
import * as Speech from "expo-speech";
import type { Product } from "@/types/Product";
import { getProductAllergens } from "@/types/allergens";

interface UseScanVoiceSummaryOptions {
  product: Product | null;
  enabled: boolean;                         // from user setting (e.g. Accessibility / Voice summaries)
}

/**
 * Build a clear voice summary sentence.
 */
function buildSummaryText(product: Product, productAllergens: string[]): string {
  const name = product.productName || "this product";
  const brand = product.brand ? ` by ${product.brand}` : "";

  if (productAllergens.length === 0) {
    return `Scan result. ${name}${brand}. No allergens are listed for this product.`;
  }

  const list = productAllergens.join(", ");
  return `Scan result. ${name}${brand}. This product contains the following allergens: ${list}.`;
}

/**
 * Automatically speaks when a new product is loaded and TTS is enabled.
 */
export function useScanVoiceSummary({ product, enabled }: UseScanVoiceSummaryOptions) {
  useEffect(() => {
    if (!enabled || !product) return;

    const allergens = getProductAllergens(product);
    const text = buildSummaryText(product, allergens);

    Speech.stop();
    Speech.speak(text, {
      language: "en-AU",
      rate: 1.0,
      pitch: 1.0,
    });
  }, [product?.barcode, enabled]);
}

/**
 * Optional manual trigger if you want a "Play" button.
 */
export function speakProductSummary(product: Product | null) {
  if (!product) return;
  const allergens = getProductAllergens(product);
  const text = buildSummaryText(product, allergens);

  Speech.stop();
  Speech.speak(text, {
    language: "en-AU",
    rate: 1.0,
    pitch: 1.0,
  });
}
