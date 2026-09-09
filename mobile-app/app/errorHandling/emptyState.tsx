{
  /* 
  EmptyState component that displays a user-friendly “Product Not Found” message  
  and allows the user to return to the scanner or enter the barcode manually.*/
}
import { View, Pressable } from "react-native";
import IconGeneral from "@/components/icons/IconGeneral";
import Tt from "@/components/ui/UIText";
import { router } from "expo-router";
import { color, spacing } from "../design/token";
import Screen from "@/components/layout/Screen";

const EmptyState = () => {
  return (
    <Screen className="p-safe mt-10">
      <View className="flex-1 items-center justify-center px-6">
        <IconGeneral type="search" fill={color.iconDefault} size={spacing.lg} />

        <Tt className="font-interBold text-2xl mt-4 text-hsl30 dark:text-hsl90">
          Product Not Found
        </Tt>

        <Tt className="font-interRegular text-center text-hsl40 dark:text-hsl80 mt-3 leading-6">
          We couldn’t find any product matching this barcode. Try scanning again
          or enter it manually.
        </Tt>

        <View className="mt-10 gap-y-6">
          <Pressable
            onPress={() => router.replace("/scan")}
            className="bg-primary rounded-lg py-3 px-6 border border-primary active:bg-transparent"
            accessibilityRole="button"
            accessibilityLabel="Retry Scan"
          >
            {({ pressed }) => (
              <Tt
                className={`text-lg text-center font-interSemiBold ${pressed ? "text-primary" : "text-white"
                  }`}
              >
                Retry Scan
              </Tt>
            )}
          </Pressable>
          <Pressable
            onPress={() => router.replace("/search")}
            className="bg-transparent rounded-lg py-3 px-6 border border-primary active:bg-primary"
            accessibilityRole="button"
            accessibilityLabel="Enter Barcode Manually"
          >
            {({ pressed }) =>
              <Tt
                className={`text-lg text-center font-interSemiBold text-primary ${pressed ? 'text-white' : 'text-primary'}`}
              >
                Enter Barcode Manually
              </Tt>
            }
          </Pressable>
        </View>
      </View>
    </Screen>
  );
};

export default EmptyState;
