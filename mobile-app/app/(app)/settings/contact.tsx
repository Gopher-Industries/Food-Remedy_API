// Contact Us

import { View } from "react-native";
import Header from "@/components/layout/Header";
import Screen from "@/components/layout/Screen";
import Tt from "@/components/ui/UIText";
import { BackButton } from "@/components/shared";

export default function ContactUsPage() {
  return (
    <Screen className="p-safe">
      <Header />

      <View className="w-[95%] mx-auto">
        <View className="flex-row items-center justify-between mb-4">
          <BackButton />
          <Tt className="font-interBold text-xl">Contact Us</Tt>
          <View style={{ width: 24, height: 24 }} />
        </View>
      </View>
    </Screen>
  );
}
