// Search Page

import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { useSearchProduct } from "@/components/providers/SearchProductProvider";
import Header from "@/components/layout/Header";
import Screen from "@/components/layout/Screen";
import ProductBanner from "@/components/product/ProductBanner";
import IconGeneral from "@/components/icons/IconGeneral";
import Input from "@/components/ui/UIInput";
import Tt from "@/components/ui/UIText";
import { color } from "@/app/design/token";
import { useAccessibilityAnnouncement } from "@/hooks/useAccessibilityAnnouncement";

export default function SearchPage() {
  const {
    query,
    setQuery,
    lastQuery,
    hasSearched,
    queryInvalid,
    loading,
    searchAttempt,
    productResults,
    handleSearchProducts,
  } = useSearchProduct();

  const isFocused = useIsFocused();
  const searchDisabled = query.trim().length < 2;
  const searchAnnouncement = !hasSearched
    ? null
    : queryInvalid
      ? "Type at least 2 characters to search"
      : loading
        ? "Searching…"
        : productResults.length === 0
          ? `No results${lastQuery ? ` for ${lastQuery}` : ""}`
          : `${productResults.length} ${
              productResults.length === 1 ? "product" : "products"
            } found`;

  // Both search screens stay mounted, so only the focused screen announces.
  useAccessibilityAnnouncement(searchAnnouncement, {
    enabled: isFocused,
    announceOnAndroid: true,
    eventKey: searchAttempt,
  });

  return (
    <Screen className="p-safe">
      <Header />
      <View className="w-[95%] mx-auto">
        <View className="flex-row items-center justify-between mb-4">
          <Pressable
            onPress={() => router.back()}
            className="flex-row justify-center items-center self-end px-2 py-1"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Back"
            accessibilityHint="Returns to the previous screen"
          >
            {({ pressed }) => (
              <IconGeneral
                type="arrow-backward-ios"
                fill={pressed ? color.primary : color.iconDefault}
              />
            )}
          </Pressable>
          <Tt className="font-interBold text-xl" accessibilityRole="header">
            Search
          </Tt>
          <View style={{ width: 24, height: 24 }} />
        </View>

        {/* Search row */}
        <View className="flex-row items-center gap-x-2 pb-4">
          <Input
            placeholder="Search Products..."
            accessibilityLabel="Search products"
            accessibilityHint="Enter at least 2 characters, then activate the search button"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearchProducts}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            className="flex-1 h-full"
          />
          <Pressable
            onPress={handleSearchProducts}
            className={`rounded px-4 py-2 border 
             ${!searchDisabled ? "bg-primary border-primary active:bg-white dark:bg-hsl15 active:border-primary " : "bg-hsl80 border-hsl80"} `}
            accessibilityRole="button"
            accessibilityLabel="Search"
            accessibilityState={{ disabled: searchDisabled }}
            disabled={searchDisabled}
          >
            {({ pressed }) => (
              <IconGeneral
                type="search"
                fill={
                  searchDisabled
                    ? "hsl(0, 0%, 40%)"
                    : pressed
                      ? "#FF3D3D"
                      : "white"
                }
                size={24}
              />
            )}
          </Pressable>
        </View>
      </View>

      {/* Results */}
      <ScrollView
        className="gap-y-2"
        contentContainerStyle={{ paddingBottom: 10 }}
      >
        <View className="w-[95%] mx-auto">
          <View>
            {loading && (
              <Tt className="mt-4 text-hsl30 dark:text-hsl90">Searching…</Tt>
            )}

            {queryInvalid && (
              <Tt className="mt-4 text-hsl30 dark:text-hsl90">
                Type at least 2 characters to search
              </Tt>
            )}

            {!loading &&
              !queryInvalid &&
              hasSearched &&
              productResults.length === 0 && (
                <Tt className="mt-4 text-hsl30 dark:text-hsl90">
                  No results{lastQuery ? ` for “${lastQuery}”` : ""}.
                </Tt>
              )}

            {!loading && productResults.length > 0 && (
              <Tt
                className="mt-6 -mb-2 font-interSemiBold text-hsl20"
                accessibilityRole="header"
                accessibilityLabel={`Results, ${productResults.length} ${
                  productResults.length === 1 ? "product" : "products"
                } found`}
              >
                Results
              </Tt>
            )}
          </View>

          {!loading &&
            productResults.length > 0 &&
            productResults.map((p, idx) => (
              <ProductBanner
                key={p.barcode ?? idx}
                product={p}
                isSearchResult={true}
              />
            ))}
        </View>
      </ScrollView>
    </Screen>
  );
}
