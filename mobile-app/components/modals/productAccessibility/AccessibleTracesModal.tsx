// Accessible Traces Modal

import IconGeneral from "@/components/icons/IconGeneral";
import { useModalManager } from "@/components/providers/ModalManagerProvider";
import { useProduct } from "@/components/providers/ProductProvider";
import Tt from "@/components/ui/UIText";
import React, { useEffect, useMemo, useState } from "react";
import { View, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function sortAlphaCaseInsensitive(values?: string[] | null): string[] {
  if (!Array.isArray(values)) return [];
  const normed = values.map(v => (typeof v === "string" ? v.trim() : "")).filter(Boolean);
  const unique = Array.from(new Map(normed.map(v => [v.toLowerCase(), v])).values());
  return unique.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }));
}

function toArray(val?: string | string[] | null): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  return val.split(/[,;]+/).map(s => s.trim()).filter(Boolean);
}

function buildTracesList(p: any): string[] {
  const a = toArray(p?.traces);
  const b = toArray(p?.tracesFromIngredients);
  return sortAlphaCaseInsensitive([...a, ...b]);
}

const AccessibleTracesModal = () => {
  const { closeModal } = useModalManager();
  const { currentProduct } = useProduct();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!currentProduct) closeModal("accessibleTraces");
  }, [currentProduct, closeModal]);

  if (!currentProduct) return null;

  const [fontSize, setFontSize] = useState(16);
  const minSize = 16, maxSize = 36;
  const inc = () => setFontSize(s => Math.min(maxSize, s + 2));
  const dec = () => setFontSize(s => Math.max(minSize, s - 2));

  const traces = useMemo(() => buildTracesList(currentProduct), [currentProduct]);

  return (
    <View
      className="flex-1 bg-hsl95 dark:bg-hsl10"
      style={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }}
    >
      <View className="flex-1 w-[95%] self-center">

        {/* Header */}
        <View className="flex-row items-center justify-between">

          <View className="flex-row items-center gap-x-2">
            <Pressable onPress={dec} className="flex-row items-center px-3 py-1 rounded bg-hsl98 dark:bg-hsl10 active:bg-primary border border-primary">
              {({ pressed }) => (<>
                <Tt className={`text-xl font-interSemiBold ${pressed ? "text-white" : "text-primary"}`}>A</Tt>
                <IconGeneral type="minus" fill={pressed ? "white" : "red"} size={20} />
              </>)}
            </Pressable>

            <Pressable onPress={inc} className="flex-row items-center px-3 py-1 rounded bg-hsl98 dark:bg-hsl10 active:bg-primary border border-primary">
              {({ pressed }) => (<>
                <Tt className={`text-xl font-interSemiBold ${pressed ? "text-white" : "text-primary"}`}>A</Tt>
                <IconGeneral type="add" fill={pressed ? "white" : "red"} size={20} />
              </>)}
            </Pressable>
          </View>

          <Pressable onPress={() => closeModal("accessibleTraces")} className="p-2 rounded-lg">
            {({ pressed }) => <IconGeneral type="close" size={30} fill={pressed ? "#FF3F3F" : "hsl(0,0%,20%)"} />}
          </Pressable>
        </View>

        {/* Title */}
        <Tt className="text-center font-interSemiBold mt-4" style={{ fontSize: fontSize + 4 }}>{currentProduct.productName}</Tt>

        {/* Content */}
        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator>
          <Tt className="font-interSemiBold mt-4" style={{ fontSize: fontSize + 2 }}>Traces</Tt>

          {traces.length > 0 ? (
            <View className="mb-6">
              {traces.map((item, idx) => (
                <View key={`${item}-${idx}`} className={` ${idx % 2 ? 'bg-hsl95 dark:bg-hsl10' : 'bg-hsl90 dark:bg-hsl15'}`}>
                  <Tt className="ml-4 text-wrap" style={{ fontSize, lineHeight: fontSize * 1.4 }}>
                    {item}
                  </Tt>
                </View>
              ))}
            </View>
          ) : (
            <Tt style={{ fontSize, color: "#6B7280", marginBottom: 16 }}>
              No traces reported for this product.
            </Tt>
          )}

          <Pressable onPress={() => closeModal("accessibleTraces")} className="mx-4 mt-8 py-3 rounded-lg bg-primary">
            <Tt className="text-xl text-center font-interSemiBold text-white">Close</Tt>
          </Pressable>

        </ScrollView>

      </View>
    </View>
  );
};

export default AccessibleTracesModal;
