// Accessible Nutrients Modal


import IconGeneral from "@/components/icons/IconGeneral";
import { useModalManager } from "@/components/providers/ModalManagerProvider";
import { useProduct } from "@/components/providers/ProductProvider";
import Tt from "@/components/ui/UIText";
import React, { useEffect, useMemo, useState } from "react";
import { View, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { nutrimentsToRows } from "@/services/utils/nutrimentsTable";

// Hide rows where both values are "-"
const filterEmpty = (rows: { label: string; per100: string; perServing: string; }[]) =>
  rows.filter(r => r.per100 !== "-" || r.perServing !== "-");

const AccessibleNutrientsModal = () => {
  const { closeModal } = useModalManager();
  const { currentProduct } = useProduct();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!currentProduct) closeModal("accessibleNutrients");
  }, [currentProduct, closeModal]);

  if (!currentProduct) return null;

  const [fontSize, setFontSize] = useState(16);
  const minSize = 16;
  const maxSize = 36;

  const rows = useMemo(() => {
    const r = nutrimentsToRows(currentProduct.nutriments || {});
    return filterEmpty(r);
  }, [currentProduct.nutriments]);

  const inc = () => setFontSize(s => Math.min(maxSize, s + 2));
  const dec = () => setFontSize(s => Math.max(minSize, s - 2));

  return (
    <View
      className="flex-1 bg-hsl95 dark:bg-hsl10"
      style={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }}
    >
      <View className="flex-1 w-[95%] self-center" >

        {/* Header */}
        < View className="flex-row items-center justify-between" >
          <View className="flex-row items-center justify-between gap-x-2" >
            <Pressable onPress={dec} className="flex-row items-center px-3 py-1 rounded bg-hsl98 dark:bg-hsl10 border border-primary">
              <Tt className="text-xl font-interSemiBold text-primary" > A </Tt>
              <IconGeneral type="minus" fill="red" size={20} />
            </Pressable>
            <Pressable onPress={inc} className="flex-row items-center px-3 py-1 rounded bg-hsl98 dark:bg-hsl10 border border-primary">
              <Tt className="text-xl font-interSemiBold text-primary" > A </Tt>
              <IconGeneral type="add" fill="red" size={20} />
            </Pressable>
          </View>

          <Pressable onPress={() => closeModal("accessibleNutrients")} className="p-2 rounded-lg">
            {({ pressed }) => (
              <IconGeneral type="close" size={30} fill={pressed ? "#FF3F3F" : "hsl(0, 0%, 20%)"} />
            )}
          </Pressable>
        </View>

        < Tt className="text-center font-interSemiBold mt-4" style={{ fontSize: fontSize + 4 }}>
          {currentProduct.productName}
        </Tt>

        {/* Content */}
        <ScrollView className="flex-1"
          contentContainerStyle={{ paddingBottom: 24 }}
          showsVerticalScrollIndicator
        >
          <Tt className="font-interSemiBold mt-4" style={{ fontSize: fontSize + 1 }}>Nutritional information</Tt>

          {rows.length === 0 ? (
            <Tt className="mt-2 text-hsl50 dark:text-hsl70" style={{ fontSize }}>No nutrient data available</Tt>
          ) : (
            <View className="mt-4 mb-4" >
              {rows.map((r, idx) => (
                <View key={r.label} className={`bg-hsl100 rounded-lg px-4 py-3 my-2`}>

                  {/* Nutrient name */}
                  <Tt className="font-interSemiBold" style={{ fontSize: fontSize }}>{r.label}
                  </Tt>

                  {/* Headings row */}
                  <View className="flex-row justify-between mt-2" >
                    <Tt className="font-interMedium text-hsl10" style={{ fontSize }}>Per serve</Tt>
                    <Tt className="font-interMedium text-hsl10" style={{ fontSize }}>Per 100 g</Tt>
                  </View>

                  {/* Values row */}
                  <View className="flex-row justify-between mt-1" >
                    <Tt className="text-hsl10" style={{ fontSize, lineHeight: fontSize * 1.6 }}>{r.perServing}</Tt>
                    <Tt className="text-hsl10" style={{ fontSize, lineHeight: fontSize * 1.6 }}>{r.per100}</Tt>
                  </View>
                </View>
              ))}
            </View>
          )}

          <Pressable onPress={() => closeModal("accessibleNutrients")}
            className="mx-4 mt-4 mb-8 py-3 rounded-lg bg-primary"
          >
            <Tt className="text-xl text-center font-interSemiBold text-white" >Close</Tt>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );
};

export default AccessibleNutrientsModal;
