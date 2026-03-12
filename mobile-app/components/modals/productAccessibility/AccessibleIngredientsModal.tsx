// Accessible Ingredients Modal

import IconGeneral from "@/components/icons/IconGeneral";
import { useModalManager } from "@/components/providers/ModalManagerProvider";
import { useProduct } from "@/components/providers/ProductProvider";
import Tt from "@/components/ui/UIText";
import React, { useEffect, useMemo, useState } from "react";
import { View, Pressable, ScrollView, } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";



// Parse ingredients from label text into [{ name, amount }], preserving order
function parseIngredientsTable(text?: string | null): { name: string; amount?: string }[] {
  if (!text) return [];
  // Split by commas (labels usually comma-separated). Keep order.
  const parts = text
    .split(/,(?![^()]*\))/) // split by commas not inside parentheses
    .map((s) => s.trim())
    .filter(Boolean);

  return parts.map((seg) => {
    let name = seg;
    let amount: string | undefined;
    let parenAmount: string | undefined;

    // 1) Capture trailing parenthetical content (optionally followed by punctuation) as potential amount
    const trailingParen = name.match(/\(([^)]*)\)\s*[\.,;:]?$/);
    if (trailingParen) {
      const contentRaw = trailingParen[1].trim();
      // Normalize spacing around commas and uppercase E-codes; keep human-friendly spaces
      parenAmount = contentRaw
        .replace(/\s*,\s*/g, ", ")
        .replace(/\s+/g, " ")
        .toUpperCase();
      // Remove the captured trailing parens from the name
      name = name.replace(trailingParen[0], "");
    }

    // 2) Capture trailing numeric + unit (e.g., 0.3g, 120mg, 2 l, 5 ml, %)
    const unitMatch = name.match(/\b(\d+(?:[\.,]\d+)?\s*(?:mg|g|kg|mcg|µg|ug|ml|l|%))\s*$/i);
    if (unitMatch) {
      amount = unitMatch[1].replace(/\s+/g, " ").trim();
      name = name.replace(unitMatch[0], "");
    }

    // Remove any non-amount parentheticals from name (e.g., E-codes like (e330))
    name = name.replace(/\([^)]*\)/g, "");
    name = name.replace(/\s+/g, " ").trim();

    // Prefer explicit unit amounts; otherwise use code/percent captured from parentheses
    const finalAmount = (amount ?? parenAmount)?.trim();
    return { name, amount: finalAmount || undefined };
  });
}


const AccessibleIngredientsModal = () => {
  const { closeModal } = useModalManager();
  const { currentProduct } = useProduct();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!currentProduct) closeModal("accessibleIngredients");
  }, [currentProduct, closeModal]);

  if (!currentProduct) return null;

  const [fontSize, setFontSize] = useState(16);
  const minSize = 16;
  const maxSize = 36;

  const parsedIngredients = useMemo(() => {
    const fromText = parseIngredientsTable(currentProduct.ingredientsText);
    if (fromText.length > 0) return fromText;
    // Fallback: use array order if text missing
    const arr = Array.isArray(currentProduct.ingredients)
      ? currentProduct.ingredients
      : [];
    return arr
      .map((n: string) => ({ name: (n || "").trim(), amount: undefined as string | undefined }))
      .filter((r) => r.name);
  }, [currentProduct.ingredientsText, currentProduct.ingredients]);

  const inc = () => setFontSize((s) => Math.min(maxSize, s + 2));
  const dec = () => setFontSize((s) => Math.max(minSize, s - 2));

  return (
    <View
      className="flex-1 bg-hsl95 dark:bg-hsl10"
      style={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }}
    >
      <View className="flex-1 w-[95%] self-center">

        {/* Header */}
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center justify-between gap-x-2">
            <Pressable onPress={dec} className="flex-row items-center px-3 py-1 rounded bg-hsl98 dark:bg-hsl10  active:bg-primary border border-primary">
              {({ pressed }) => (
                <>
                  <Tt className={`text-xl font-interSemiBold ${pressed ? "text-white" : "text-primary"}`}>A</Tt>
                  <IconGeneral type="minus" fill={pressed ? "white" : "red"} size={20} />
                </>
              )}
            </Pressable>
            <Pressable onPress={inc} className="flex-row items-center px-3 py-1 rounded bg-hsl98 dark:bg-hsl10  active:bg-primary border border-primary">
              {({ pressed }) => (
                <>
                  <Tt className={`text-xl font-interSemiBold ${pressed ? "text-white" : "text-primary"}`}>A</Tt>
                  <IconGeneral type="add" fill={pressed ? "white" : "red"} size={20} />
                </>
              )}
            </Pressable>
          </View>

          <Pressable onPress={() => closeModal("accessibleIngredients")} className="p-2 rounded-lg" >
            {({ pressed }) => (
              <IconGeneral type="close" size={30} fill={pressed ? "#FF3F3F" : "hsl(0, 0%, 20%)"} />
            )}
          </Pressable>
        </View>


        <Tt className="text-center font-interSemiBold mt-4" style={{ fontSize: fontSize + 4 }}>{currentProduct.productName}</Tt>


        {/* Content */}

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 24 }}
        >
          <Tt className="font-interSemiBold mt-4" style={{ fontSize: fontSize + 2 }}>Ingredients</Tt>
          {parsedIngredients.length > 0 ? (
            <View className="mb-6 rounded-lg overflow-hidden border border-hsl90 dark:border-hsl20">
              {/* Header row */}
              <View className="flex-row bg-hsl95 dark:bg-hsl10 py-2 px-3">
                <Tt className="flex-1 font-interSemiBold" style={{ fontSize }}>Ingredient</Tt>
                <Tt className="w-28 text-right font-interSemiBold" style={{ fontSize }}>Amount</Tt>
              </View>
              {parsedIngredients.map((row, idx) => (
                <View key={`${row.name}-${idx}`} className={`flex-row items-start py-2 px-3 ${idx % 2 ? 'bg-hsl98 dark:bg-hsl10' : 'bg-white dark:bg-hsl15'}`}>
                  <Tt className="flex-1 pr-3" style={{ fontSize, lineHeight: fontSize * 1.4 }}>{row.name}</Tt>
                  <Tt className="w-28 text-right text-hsl40 dark:text-hsl80" style={{ fontSize }}>{row.amount ?? '—'}</Tt>
                </View>
              ))}
            </View>
          ) : (
            <Tt style={{ fontSize, color: "#6B7280", marginBottom: 16 }}>
              No ingredient list available
            </Tt>
          )}

          {/* Raw text below */}
          <Tt className="font-interSemiBold mt-4" style={{ fontSize: fontSize + 2 }}>Ingredients (as per product label)</Tt>

          <Tt className="text-justify" style={{ fontSize, lineHeight: fontSize * 1.6 }}>
            {currentProduct.ingredientsText && currentProduct.ingredientsText.trim().length > 0
              ? currentProduct.ingredientsText
              : "Ingredients not available"}
          </Tt>

          <Pressable onPress={() => closeModal("accessibleIngredients")}
            className="mx-4 mt-8 py-3 rounded-lg bg-primary"
          >
            {({ pressed }) => (
              <Tt className="text-xl text-center font-interSemiBold text-white">Close</Tt>
            )}
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );
}

export default AccessibleIngredientsModal;