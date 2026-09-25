import { useCallback, useMemo } from "react";
import { FlatList } from "react-native";
import type { Product } from "@/types/Product";
import ProductBanner from "@/components/product/ProductBanner";
import Tt from "@/components/ui/UIText";
import { useSearchProduct } from "@/components/providers/SearchProductProvider";

const INITIAL_RENDER_COUNT = 8;

export default function ProductSearchResults() {
  const { hasSearched, lastQuery, loading, productResults, queryInvalid } =
    useSearchProduct();

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
      return <Tt className="mt-4 text-hsl30 dark:text-hsl90">SearchingÃ¢â‚¬Â¦</Tt>;
    }

    if (queryInvalid) {
      return (
        <Tt className="mt-4 text-hsl30 dark:text-hsl90">
          Type at least 2 characters to search
        </Tt>
      );
    }

    if (hasSearched && productResults.length === 0) {
      return (
        <Tt className="mt-4 text-hsl30 dark:text-hsl90">
          No results{lastQuery ? ` for Ã¢â‚¬Å“${lastQuery}Ã¢â‚¬Â` : ""}.
        </Tt>
      );
    }

    if (productResults.length > 0) {
      return <Tt className="mt-6 -mb-2 font-interSemiBold text-hsl20">Results</Tt>;
    }

    return null;
  }, [hasSearched, lastQuery, loading, productResults.length, queryInvalid]);

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