{
  /* 
  ErrorState component that displays a user-friendly error message  
  and allows the user to return to the scanner or enter the barcode manually.*/
}

import { View, Pressable } from "react-native";
import IconGeneral from "@/components/icons/IconGeneral";
import Tt from "@/components/ui/UIText";
import { router } from "expo-router";
import { color, spacing } from "../design/token";
import Screen from "@/components/layout/Screen";

const ErrorState = ({
  title = "Something went wrong",
  message = "An unexpected error occurred.",
}) => {
  return (
    <Screen className="p-safe">
      <View className="flex-1 items-center justify-center px-6">
        <IconGeneral
          type="warning"
          fill={color.iconDefault}
          size={spacing.md}
        />
        <Tt className="font-interBold text-lg text-hsl30 dark:text-hsl90 mt-4">{title}</Tt>
        <Tt className="text-center text-hsl30 dark:text-hsl90 mt-2">{message}</Tt>

        <Pressable
          onPress={() => router.replace("/scan")}
          className="bg-primary rounded-lg py-2 px-4 mt-8 border border-primary active:bg-transparent"
        >
          <Tt className="text-lg text-center font-interSemiBold text-white">
            Go Back
          </Tt>
        </Pressable>
      </View>
    </Screen>
  );
};

export default ErrorState;
