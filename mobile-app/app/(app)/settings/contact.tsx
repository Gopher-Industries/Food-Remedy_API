// Contact Us

import { Pressable, View } from "react-native";
import { router } from "expo-router";
import Header from "@/components/layout/Header";
import Screen from "@/components/layout/Screen";
import IconGeneral from "@/components/icons/IconGeneral";
import Tt from "@/components/ui/UIText";
import { color } from "@/app/design/token";

export default function ContactUsPage() {
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
                fill={pressed ? color.primary : color.primary}
              />
            )}
          </Pressable>
          <Tt className="font-interBold text-xl">Contact Us</Tt>
          <View style={{ width: 24, height: 24 }} />
        </View>
      </View>
    </Screen>
  );
}
