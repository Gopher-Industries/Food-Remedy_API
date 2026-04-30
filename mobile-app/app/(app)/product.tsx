import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View, Image } from "react-native";
import { router } from "expo-router";

import Header from "@/components/layout/Header";
import Screen from "@/components/layout/Screen";
import IconGeneral from "@/components/icons/IconGeneral";
import Tt from "@/components/ui/UIText";

import { useProduct } from "@/components/providers/ProductProvider";
import { useModalManager } from "@/components/providers/ModalManagerProvider";
import { usePreferences } from "@/components/providers/PreferencesProvider";

import SkeletonLoading from "../errorHandling/skeletonLoading";
import ErrorState from "../errorHandling/errorState";
import EmptyState from "../errorHandling/emptyState";

import {
  useScanVoiceSummary,
  speakProductSummary,
} from "@/hooks/useScanVoiceSummary";

import NutrientsTab from "./ProductTabs/NutrientsTab";
import IngredientsTab from "./ProductTabs/IngredientsTab";
import ForYouTab from "./ProductTabs/ForYouTab";
import RecommendationsTab from "./ProductTabs/RecommendationsTab";

type TabKey = "Nutrients" | "Ingredients" | "For you" | "Compare";

const FALLBACK_FOOD_ICON = require("../../assets/images/food_icon.png");

export default function ProductTabsScreen() {
  const { currentProduct, loading, error } = useProduct();
  const { openModal } = useModalManager();
  const { highContrast, ttsEnabled } = usePreferences();

  const [activeTab, setActiveTab] = useState<TabKey>("Nutrients");
  const [imageLoadFailed, setImageLoadFailed] = useState(false);

  const tabs: TabKey[] = ["Nutrients", "Ingredients", "For you", "Compare"];

  useScanVoiceSummary({
    product: currentProduct ?? null,
    enabled: ttsEnabled && !loading && !error && !!currentProduct,
  });

  const productImageUri = useMemo(() => {
    if (!currentProduct) return null;

    const images: any = currentProduct.images;
    if (!images) return null;

    const clean = (value: any) => {
      if (typeof value !== "string") return null;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    };

    if (Array.isArray(images)) {
      for (const item of images) {
        if (typeof item === "string") {
          const found = clean(item);
          if (found) return found;
        }

        if (item && typeof item === "object") {
          const found =
            clean(item.uri) ||
            clean(item.url) ||
            clean(item.imageUrl) ||
            clean(item.front) ||
            clean(item.primary);
          if (found) return found;
        }
      }
    }

    return (
      clean(images.front) ||
      clean(images.primary) ||
      clean(images.thumbnail) ||
      clean(images.url) ||
      clean(images.imageUrl) ||
      clean(images.capturedPhoto) ||
      clean(images.capturedPhotoUri) ||
      clean(images.photo) ||
      clean(images.photoUri) ||
      clean(images.variants?.front) ||
      clean(images.variants?.primary) ||
      clean(images.variants?.thumbnail) ||
      clean(images.captured?.front) ||
      clean(images.captured?.primary) ||
      null
    );
  }, [currentProduct]);

  useEffect(() => {
    setImageLoadFailed(false);
  }, [productImageUri, currentProduct?.barcode]);

  const shouldShowRemoteImage = !!productImageUri && !imageLoadFailed;

  const iconDefault = highContrast ? "#000000" : "hsl(0, 0%, 30%)";
  const pageBg = highContrast
    ? "bg-white dark:bg-hsl15"
    : "bg-hsl95 dark:bg-hsl10";
  const titleText = highContrast ? "text-black" : "text-hsl20";
  const bodyText = highContrast ? "text-black" : "text-hsl30 dark:text-hsl90";
  const primaryBtn = highContrast
    ? "bg-black border border-black"
    : "bg-primary";
  const primaryBtnText = "text-white";

  const renderTabContent = () => {
    switch (activeTab) {
      case "Nutrients":
        return <NutrientsTab product={currentProduct} />;

      case "Ingredients":
        return <IngredientsTab />;

      case "For you":
        return <ForYouTab product={currentProduct} />;

      case "Compare":
        return <CompareTab product={currentProduct} />;

      default:
        return null;
    }
  };

  if (loading) return <SkeletonLoading />;
  if (error) return <ErrorState />;
  if (!currentProduct) return <EmptyState />;

  return (
    <Screen className={`p-safe ${pageBg}`}>
      <Header />

      <View className="w-[95%] self-center mb-4">
        <View className="flex-row justify-between items-center">
          <Pressable
            onPress={() => router.back()}
            className="flex-row justify-center items-center px-2 py-1"
          >
            {({ pressed }) => (
              <IconGeneral
                type="arrow-backward-ios"
                fill={pressed ? "#FF3D3D" : iconDefault}
                size={24}
              />
            )}
          </Pressable>

          <View className="flex-row items-center gap-x-2">
            <Pressable
              onPress={() => openModal("addToList")}
              className={`flex-row justify-center items-center px-3 py-2 rounded-lg ${primaryBtn}`}
            >
              {() => (
                <>
                  <IconGeneral type="cart-add" fill="white" size={20} />
                  <Tt className={`${primaryBtnText} font-interSemiBold ml-2`}>
                    Add to Lists
                  </Tt>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View className="w-[95%] self-center pb-8">
          <View className="items-center mb-6">
            <View className="relative items-center justify-center mb-4">
              <View className="w-[132px] h-[132px] rounded-[28px] bg-[#F3F4F6] items-center justify-center overflow-hidden">
                {shouldShowRemoteImage ? (
                  <Image
                    source={{ uri: productImageUri! }}
                    resizeMode="contain"
                    onError={() => setImageLoadFailed(true)}
                    style={{
                      width: 110,
                      height: 110,
                      borderRadius: 20,
                    }}
                  />
                ) : (
                  <Image
                    source={FALLBACK_FOOD_ICON}
                    resizeMode="contain"
                    style={{
                      width: 204,
                      height: 204,
                    }}
                  />
                )}
              </View>

              <Pressable
                onPress={() => speakProductSummary(currentProduct)}
                className="absolute -right-12 top-2 px-3 py-2 rounded-full bg-primary"
              >
                {({ pressed }) => (
                  <IconGeneral
                    type="speaker"
                    size={24}
                    fill={pressed ? "#F9FAFB" : "#FFFFFF"}
                  />
                )}
              </Pressable>
            </View>

            <Tt
              className={`font-interBold text-3xl leading-tight text-center ${titleText}`}
            >
              {String(
                currentProduct.productName || "Unknown Product",
              ).toUpperCase()}
            </Tt>

            {currentProduct.brand ? (
              <Tt className={`font-interSemiBold text-base mt-2 ${bodyText}`}>
                {currentProduct.brand}
              </Tt>
            ) : null}
          </View>

          <View className="flex-row border-b border-[#E5E7EB] mt-2">
            {tabs.map((tab) => {
              const isActive = activeTab === tab;

              return (
                <Pressable
                  key={tab}
                  onPress={() => setActiveTab(tab)}
                  className="flex-1 items-center py-3"
                >
                  <Tt
                    className={`font-interSemiBold text-[15px] ${
                      isActive ? "text-primary" : "text-[#6B7280]"
                    }`}
                  >
                    {tab}
                  </Tt>

                  <View
                    className={`mt-2 h-[3px] w-[75%] rounded-full ${
                      isActive ? "bg-primary" : "bg-transparent"
                    }`}
                  />
                </Pressable>
              );
            })}
          </View>

          <View className="min-h-[400px]">{renderTabContent()}</View>

          {activeTab !== "Compare" && (
            <Pressable
              onPress={() => openModal("addToList")}
              className="bg-primary rounded-lg py-4 px-6 mt-8 mb-4 flex-row justify-center items-center active:bg-primary/80"
            >
              {() => (
                <>
                  <IconGeneral type="cart-add" fill="white" size={24} />
                  <Tt className="text-white font-interSemiBold text-lg ml-3">
                    Add to Shopping List
                  </Tt>
                </>
              )}
            </Pressable>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
