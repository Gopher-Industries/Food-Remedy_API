// Search Page

import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useSearchProduct } from "@/components/providers/SearchProductProvider";
import Header from "@/components/layout/Header";
import Screen from "@/components/layout/Screen";
import ProductBanner from "@/components/product/ProductBanner";
import IconGeneral from "@/components/icons/IconGeneral";
import Input from "@/components/ui/UIInput";
import Tt from "@/components/ui/UIText";
import { color } from "@/app/design/token";
import { getEmptySearchSuggestions } from "@/services/search/emptySearchSuggestions";

export default function SearchPage() {
  const {
    query,
    setQuery,
    lastQuery,
    hasSearched,
    queryInvalid,
    loading,
    productResults,
    recentQueries,
    clearRecentQueries,
    handleSearchProducts,
  } = useSearchProduct();

  const emptySearchSuggestions = getEmptySearchSuggestions(lastQuery);

  return (
    <Screen className="p-safe">
      <Header />
      <View className="w-[95%] mx-auto">
        <View className="flex-row items-center justify-between mb-4">
          <Pressable
            onPress={() => router.back()}
            className="flex-row justify-center items-center self-end px-2 py-1"
          >
            {({ pressed }) => (
              <IconGeneral
                type="arrow-backward-ios"
                fill={pressed ? color.primary : color.iconDefault}
              />
            )}
          </Pressable>
          <Tt className="font-interBold text-xl">Search</Tt>
          <View style={{ width: 24, height: 24 }} />
        </View>

        {/* Search row */}
        <View className="flex-row items-center gap-x-2 pb-4">
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
          />
          <Pressable
            onPress={handleSearchProducts}
            className={`rounded px-4 py-2 border 
             ${query.length >= 2 ? "bg-primary border-primary active:bg-white dark:bg-hsl15 active:border-primary " : "bg-hsl80 border-hsl80"} `}
          >
            {({ pressed }) => (
              <IconGeneral
                type="search"
                fill={
                  query.length < 2
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
          {loading && <Tt className="mt-4 text-hsl30 dark:text-hsl90">Searching…</Tt>}

          {queryInvalid && (
            <Tt className="mt-4 text-hsl30 dark:text-hsl90">
              Type at least 2 characters to search
            </Tt>
          )}

          {!loading &&
            !queryInvalid &&
            hasSearched &&
            productResults.length === 0 && (
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
              <Tt className="mt-6 -mb-2 font-interSemiBold text-hsl20">
                Results
              </Tt>
              {productResults.map((p, idx) => (
                <ProductBanner key={idx} product={p} isSearchResult={true} />
              ))}
            </>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
