import { useCallback, useMemo } from "react";
import { FlatList, Pressable, View } from "react-native";
import { router } from "expo-router";
import type { Product } from "@/types/Product";
import ProductBanner from "@/components/product/ProductBanner";
import Tt from "@/components/ui/UIText";
import { useSearchProduct } from "@/components/providers/SearchProductProvider";
import { getEmptySearchSuggestions } from "@/services/search/emptySearchSuggestions";

const INITIAL_RENDER_COUNT = 8;

export default function ProductSearchResults() {
  const {
    hasSearched,
    lastQuery,
    loading,
    productResults,
    queryInvalid,
    recentQueries,
    clearRecentQueries,
    setQuery,
    setLastQuery,
  } = useSearchProduct();

  const renderItem = useCallback(
    ({ item }: { item: Product }) => (
      <ProductBanner product={item} isSearchResult />
    ),
    []
  );

  const keyExtractor = useCallback(
    (item: Product, index: number) => item.barcode || `${item.productName}-${index}`,
    []
  );

  const listHeader = useMemo(() => {
    if (loading) {
      return <Tt className="mt-4 text-hsl30 dark:text-hsl90">Searching…</Tt>;
    }

    if (queryInvalid) {
      return (
        <Tt className="mt-4 text-hsl30 dark:text-hsl90">
          Type at least 2 characters to search
        </Tt>
      );
    }

    if (hasSearched && productResults.length === 0) {
      const suggestions = getEmptySearchSuggestions(lastQuery);

      return (
        <View className="mt-4 gap-y-3">
          <Tt className="text-hsl30 dark:text-hsl90">
            No results{lastQuery ? ` for “${lastQuery}”` : ""}.
          </Tt>

          <View className="rounded-xl border border-hsl80 bg-hsl95 p-3">
            <Tt className="mb-2 font-interSemiBold text-hsl20">Try one of these:</Tt>

            {suggestions.map((suggestion) => (
              <Pressable
                key={suggestion.action}
                onPress={() => {
                  if (suggestion.action === "scan") {
                    router.push("/(app)/(tabs)/scan");
                    return;
                  }

                  if (suggestion.action === "clear") {
                    setQuery("");
                    return;
                  }

                  if (suggestion.action === "spelling") {
                    setQuery(lastQuery.trim());
                  }
                }}
                className="mt-2 rounded-lg border border-hsl80 bg-white px-3 py-2"
              >
                <Tt className="text-hsl20">{suggestion.label}</Tt>
              </Pressable>
            ))}
          </View>

          {recentQueries.length > 0 && (
            <View className="rounded-xl border border-hsl80 bg-white p-3">
              <Tt className="mb-2 font-interSemiBold text-hsl20">Recent queries</Tt>
              {recentQueries.map((item) => (
                <Pressable
                  key={item}
                  onPress={() => {
                    setQuery(item);
                    setLastQuery(item);
                  }}
                  className="mt-2 rounded-lg bg-hsl95 px-3 py-2"
                >
                  <Tt className="text-hsl20">{item}</Tt>
                </Pressable>
              ))}

              <Pressable onPress={clearRecentQueries} className="mt-3">
                <Tt className="text-primary">Clear recent queries</Tt>
              </Pressable>
            </View>
          )}
        </View>
      );
    }

    if (productResults.length > 0) {
      return <Tt className="mt-6 -mb-2 font-interSemiBold text-hsl20">Results</Tt>;
    }

    return null;
  }, [
    clearRecentQueries,
    hasSearched,
    lastQuery,
    loading,
    productResults.length,
    queryInvalid,
    recentQueries,
    setLastQuery,
    setQuery,
  ]);

  return (
    <FlatList
      className="flex-1"
      contentContainerStyle={{ paddingBottom: 10 }}
      data={loading ? [] : productResults}
      initialNumToRender={INITIAL_RENDER_COUNT}
      keyExtractor={keyExtractor}
      ListHeaderComponent={listHeader}
      maxToRenderPerBatch={INITIAL_RENDER_COUNT}
      removeClippedSubviews
      renderItem={renderItem}
      updateCellsBatchingPeriod={50}
      windowSize={7}
    />
  );
}
