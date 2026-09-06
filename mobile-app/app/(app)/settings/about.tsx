// About

import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import Header from "@/components/layout/Header";
import Screen from "@/components/layout/Screen";
import Tt from "@/components/ui/UIText";
import { BackButton } from "@/components/shared";

export default function AboutPage() {
  return (
    <Screen className="p-safe">
      <Header />

      <View className="w-[95%] mx-auto">
        <View className="flex-row items-center justify-between mb-4">
          <BackButton />
          <Tt className="font-interBold text-xl">About</Tt>
          <View style={{ width: 24, height: 24 }} />
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 10 }}
      >
        <View className="w-[95%] mx-auto">
          <Tt className="text-lg font-interBold mt-2">Version Information</Tt>
          <Tt className="text-sm">Current Release: 1.0.0</Tt>
          <Tt className="text-sm mb-4">Initial Lunch Date: To be Reviewed</Tt>

          <Tt className="text-lg font-interBold mt-4 mb-1">Purpose</Tt>
          <Tt className="text-sm text-justify mb-4">
            Our goal is to empower individuals, especially those with allergies,
            to make safe, informed decisions about the food they eat. By
            combining allergen detection with nutrition insights, we aim to make
            healthy living both safer and easier.
          </Tt>

          <Tt className="text-lg font-interBold mt-4 mb-1">Data Source</Tt>
          <Tt className="text-sm text-justify mb-4">
            We use Open Food Facts, a global, crowdsourced database of food
            products. This open data is maintained under the Open Database
            License (ODbL), ensuring transparency and accuracy.
          </Tt>

          <Tt className="text-lg font-interBold mt-4 mb-1">Who Made This</Tt>
          <Tt className="text-sm text-justify mb-4">
            Built by Deakin University students with Gohper Industries.
          </Tt>

          <Tt className="text-lg font-interBold mt-4 mb-1">Contact & Support</Tt>
          <View className="flex-row flex-wrap">
            <Tt className="text-sm">Please send feedback </Tt>
            <Pressable onPress={() => router.push("/settings/contact")}>
              <Tt className="text-sm underline">here</Tt>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
