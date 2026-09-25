// Search Page

import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useSearchProduct } from "@/components/providers/SearchProductProvider";
import Header from "@/components/layout/Header";
import Screen from "@/components/layout/Screen";
import ProductSearchResults from "@/components/product/ProductSearchResults";
import IconGeneral from "@/components/icons/IconGeneral";
import Input from "@/components/ui/UIInput";
import Tt from "@/components/ui/UIText";
import { color } from "@/app/design/token";

export default function SearchPage() {
  const { query, setQuery, handleSearchProducts } = useSearchProduct();

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
            className={`rounded px-4 py-2 border ${
              query.length >= 2
                ? "bg-primary border-primary active:bg-white dark:bg-hsl15 active:border-primary"
                : "bg-hsl80 border-hsl80"
            }`}
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

      <View className="flex-1 w-[95%] mx-auto">
        <ProductSearchResults />
      </View>
    </Screen>
  );
}