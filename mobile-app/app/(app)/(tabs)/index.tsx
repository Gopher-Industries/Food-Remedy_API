// History Page

import React, { useCallback, useMemo, useState } from "react";
import { View, Pressable, ScrollView, RefreshControl } from "react-native";
import Tt from "@/components/ui/UIText";
import Header from "@/components/layout/Header";
import Screen from "@/components/layout/Screen";
import { router, useFocusEffect } from "expo-router";
import IconGeneral from "@/components/icons/IconGeneral";
import Input from "@/components/ui/UIInput";
import { useHistory } from "@/hooks/useHistory";
import ModalWrapper from "@/components/modals/ModalAWrapper";
import ModalResponse from "@/components/modals/ModalResponse";
import { useModalManager } from "@/components/providers/ModalManagerProvider";
import ProductBanner from "@/components/product/ProductBanner";
import { color, spacing } from "@/app/design/token";
import EmptyState from "@/components/ui/EmptyState";

export default function HistoryPage() {
  const { openModal } = useModalManager();
  const { ready, items, loading, refresh, clearAll } = useHistory();
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");

  useFocusEffect(
    useCallback(() => {
      if (!ready) return;
      (async () => {
        await refresh();
      })();
    }, [ready, refresh])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const brand = it.brand ?? "";
      return (
        it.productName.toLowerCase().includes(q) ||
        brand.toLowerCase().includes(q) ||
        it.barcode.toLowerCase().includes(q)
      );
    });
  }, [items, searchQuery]);

  return (
    <Screen className="p-safe">
      <Header />

      <Tt className="text-xl font-interBold text-center my-4">History</Tt>

      {filtered.length <= 0 && (
        <EmptyState
          title={ready ? "No history yet." : "Preparing history…"}
          ctaLabel="Scan New Product"
          ctaIcon="barcode-scan"
          onCta={() => router.push("/(app)/(tabs)/scan")}
          accessibilityLabel={ready ? "No history yet" : "Loading history"}
        />
      )}

      {/* See Favourites Button */}
      {filtered.length > 0 && (
        <>
          <View className="w-[95%] mx-auto">
            {/* Search and Filter Bar */}
            <View className="flex-row items-center gap-x-2">
              <Input
                className="flex-1 h-full"
                placeholder="Search History..."
                placeholderTextColor="hsl(0,0%,60%)"
                returnKeyType="search"
                autoCapitalize="none"
                autoCorrect={false}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />

              {/* TODO: Handle Show Filters */}
              <Pressable
                onPress={() => {}}
                hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
                className="px-4 py-2"
              >
                {({ pressed }) => (
                  <IconGeneral
                    type="filter"
                    fill={pressed ? color.primary : color.iconDefault}
                    size={spacing.lg}
                  />
                )}
              </Pressable>
            </View>
          </View>

          <ScrollView
            contentContainerStyle={{ paddingBottom: 24 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing || (ready && loading)}
                onRefresh={onRefresh}
              />
            }
          >
            <View className="w-[95%] self-center">
              <View className="flex-row items-center justify-between mt-8">
                <Tt className="font-interSemiBold text-hsl30 dark:text-hsl90 flex-1 pr-2">
                  Previously Scanned
                </Tt>
                <Pressable
                  onPress={() => {
                    openModal("clearHistroy");
                  }}
                  className="px-2 py-1 rounded"
                >
                  {({ pressed }) => (
                    <Tt
                      className={`font-interMedium ${pressed ? "text-primary" : "text-hsl40 dark:text-hsl80"}`}
                    >
                      Clear all
                    </Tt>
                  )}
                </Pressable>
              </View>

              {filtered.map(
                (it) =>
                  it.product?.barcode ? (
                    <ProductBanner
                      key={it.product.barcode}
                      product={it.product}
                    />
                  ) : null // skip corrupted snapshots
              )}
            </View>
          </ScrollView>
        </>
      )}

      <ModalWrapper modalKey="clearHistroy">
        <ModalResponse
          modalKey="clearHistroy"
          isInput={false}
          message="Clear All History?"
          acceptLabel="Clear"
          onAccept={() => clearAll()}
        />
      </ModalWrapper>
    </Screen>
  );
}
