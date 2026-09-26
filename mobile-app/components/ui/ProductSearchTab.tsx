// Product Search Tab tsx

import { useEffect, useMemo, useRef } from "react";
import { Alert, Keyboard, Pressable, View } from "react-native";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import IconGeneral from "../icons/IconGeneral";
import ProductBanner from "../product/ProductBanner";
import Tt from "./UIText";
import Input from "./UIInput";
import { useSearchProduct } from "../providers/SearchProductProvider";
import { router } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { useAccessibilityAnnouncement } from "@/hooks/useAccessibilityAnnouncement";

interface ProductSearchTabProps {
  collapsed?: boolean;
}

const ProductSearchTab = ({ collapsed }: ProductSearchTabProps) => {
  const {
    query, setQuery, lastQuery, hasSearched, queryInvalid, loading,
    productResults, handleSearchProducts, searchAttempt
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

  // Bottom sheet
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["90%"], []);
  const openFull = () => requestAnimationFrame(() => sheetRef.current?.expand());


  useEffect(() => {
    if (!sheetRef.current) return;
    if (!collapsed) return;
    Keyboard.dismiss();
    if (query.trim()) {
      Alert.alert("Discard changes?", "You have unsaved changes that will be lost.", [
        { text: "Stay", style: "cancel" },
        { text: "Leave", style: "destructive", onPress: () => { sheetRef.current?.collapse(); setQuery(""); } },
      ]);
    } else {
      sheetRef.current.collapse();
      setQuery("");
    }
  }, [collapsed]);


  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      snapPoints={snapPoints}
      enablePanDownToClose={false}
      handleIndicatorStyle={{ backgroundColor: "hsl(0, 0%, 70%)" }}
      onChange={(i) => { if (i === 0) Keyboard.dismiss(); }}
      backgroundStyle={{ borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: "#fff" }}
    >
      <BottomSheetView style={{ paddingBottom: 20 }}>
        <View className="w-[90%] self-center">
          {/* Search row */}
          <View className="flex-row items-center gap-x-2">
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
              onFocus={() => openFull()}
            />
            <Pressable onPress={handleSearchProducts}
              className={`rounded px-4 py-2 border 
             ${!searchDisabled ? "bg-primary border-primary active:bg-white dark:bg-hsl15 active:border-primary " : "bg-hsl80 border-hsl80"} `}
              accessibilityRole="button"
              accessibilityLabel="Search"
              accessibilityState={{ disabled: searchDisabled }}
              disabled={searchDisabled}>
              {({ pressed }) => (
                <IconGeneral type="search" fill={searchDisabled ? "hsl(0, 0%, 40%)" : pressed ? "#FF3D3D" : "white"} size={24} />
              )}
            </Pressable>
          </View>

          {/* Results */}
          <View className="flex-1 gap-y-2">
            <View>
              {loading && <Tt className="mt-4 text-hsl30 dark:text-hsl90">Searching…</Tt>}

              {queryInvalid && (
                <Tt className="mt-4 text-hsl30 dark:text-hsl90">Type at least 2 characters to search</Tt>
              )}

              {!loading && !queryInvalid && hasSearched && productResults.length === 0 && (
                <Tt className="mt-4 text-hsl30 dark:text-hsl90">
                  No results{lastQuery ? ` for “${lastQuery}”` : ""}.
                </Tt>
              )}
            </View>

            {!loading && productResults.length > 0 && (
              <>
                <Tt
                  className="mt-6 -mb-2 font-interSemiBold text-hsl20"
                  accessibilityRole="header"
                  accessibilityLabel={`Results, showing ${Math.min(
                    productResults.length,
                    3
                  )} of ${productResults.length}`}
                >
                  Results
                </Tt>
                {productResults.slice(0, 3).map((p, idx) => (
                  <ProductBanner key={p.barcode ?? idx} product={p} />
                ))}

                {productResults.length > 3 && (
                  <Pressable onPress={() => router.push("/search")}
                    className="mt-4 p-3 bg-hsl90 dark:bg-hsl15 rounded-lg items-center"
                    accessibilityRole="button"
                    accessibilityLabel={`See all ${productResults.length} results`}
                    accessibilityHint="Opens the full search results screen"
                  >
                    <Tt className="font-interSemiBold text-hsl20">
                      See all {productResults.length} results
                    </Tt>
                  </Pressable>
                )}
              </>
            )}
          </View>
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
}


export default ProductSearchTab;
