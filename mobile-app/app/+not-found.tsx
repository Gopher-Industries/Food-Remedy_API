import IconGeneral from "@/components/icons/IconGeneral";
import Screen from "@/components/layout/Screen";
import Tt from "@/components/ui/UIText";
import { color, spacing } from "@/app/design/token";
import { router } from "expo-router";
import { Pressable, View } from "react-native";

export default function NotFoundScreen() {
  return (
    <Screen className="p-safe">
      <View className="flex-1 items-center justify-center px-6">
        <IconGeneral
          type="warning"
          fill={color.iconDefault}
          size={spacing.md}
        />

        <Tt className="font-interBold text-lg text-hsl30 dark:text-hsl90 mt-4">
          Page not found
        </Tt>

        <Tt className="text-center text-hsl30 dark:text-hsl90 mt-2">
          The page you are looking for does not exist.
        </Tt>

        <Pressable
          onPress={() => router.replace("/")}
          className="bg-primary rounded-lg py-2 px-4 mt-8 border border-primary active:bg-transparent"
        >
          <Tt className="text-lg text-center font-interSemiBold text-white">
            Go Home
          </Tt>
        </Pressable>

        <Pressable
          onPress={() => router.back()}
          className="rounded-lg py-2 px-4 mt-3 border border-primary"
        >
          <Tt className="text-lg text-center font-interSemiBold text-primary">
            Go Back
          </Tt>
        </Pressable>
      </View>
    </Screen>
  );
}