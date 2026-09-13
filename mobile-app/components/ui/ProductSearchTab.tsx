// Product Search Tab tsx

import { useEffect, useMemo, useRef } from "react";
import { Alert, Keyboard, Pressable, View } from "react-native";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import IconGeneral from "../icons/IconGeneral";
import ProductBanner from "../product/ProductBanner";
import Tt from "./UIText";
import Input from "./UIInput";
import { useSearchProduct } from "../providers/SearchProductProvider";
import { getEmptySearchSuggestions } from "@/services/search/emptySearchSuggestions";
import { router } from "expo-router";

interface ProductSearchTabProps {
  collapsed?: boolean;
}

const ProductSearchTab = ({ collapsed }: ProductSearchTabProps) => {
  const {
    query, setQuery, lastQuery, hasSearched, queryInvalid, loading,
    productResults, recentQueries, clearRecentQueries, handleSearchProducts
  } = useSearchProduct();

  const emptySearchSuggestions = getEmptySearchSuggestions(lastQuery);


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
              placeholderTextColor="hsl(0, 0%, 60%)"
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
             ${query.length >= 2 ? "bg-primary border-primary active:bg-white dark:bg-hsl15 active:border-primary " : "bg-hsl80 border-hsl80"} `}>
              {({ pressed }) => (
                <IconGeneral type="search" fill={query.length < 2 ? "hsl(0, 0%, 40%)" : pressed ? "#FF3D3D" : "white"} size={24} />
              )}
            </Pressable>
          </View>

          {/* Results */}
          <View className="flex-1 gap-y-2">
            {loading && <Tt className="mt-4 text-hsl30 dark:text-hsl90">Searching…</Tt>}

            {queryInvalid && (
              <Tt className="mt-4 text-hsl30 dark:text-hsl90">Type at least 2 characters to search</Tt>
            )}

            {!loading && !queryInvalid && hasSearched && productResults.length === 0 && (
              <View className="mt-4 gap-y-3">
                <Tt className="text-hsl30 dark:text-hsl90">
                  No results{lastQuery ? ` for “${lastQuery}”` : ""}.
                </Tt>

                <View className="rounded-xl border border-hsl80 bg-hsl95 p-3">
                  <Tt className="mb-2 font-interSemiBold text-hsl20">Try one of these:</Tt>

                  {emptySearchSuggestions.map((suggestion) => (
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
                          const nextQuery = lastQuery.trim();
                          setQuery(nextQuery ? nextQuery : "");
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
            )}

            {!loading && productResults.length > 0 && (
              <>
                <Tt className="mt-6 -mb-2 font-interSemiBold text-hsl20">Results</Tt>
                {productResults.slice(0, 3).map((p, idx) => (
                  <ProductBanner key={p.barcode ?? idx} product={p} />
                ))}

                {productResults.length > 3 && (
                  <Pressable onPress={() => router.push("/search")}
                    className="mt-4 p-3 bg-hsl90 dark:bg-hsl15 rounded-lg items-center"
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