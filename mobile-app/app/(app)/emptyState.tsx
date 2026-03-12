{
  /* 
  EmptyState component that displays a user-friendly “Product Not Found” message  
  and allows the user to return to the scanner or enter the barcode manually.*/
}
import { View, Pressable } from "react-native";
import IconGeneral from "@/components/icons/IconGeneral";
import Tt from "@/components/ui/UIText";
import { router } from "expo-router";

const EmptyState = () => {
  return (
    <View className="flex-1 p-safe mt-10">
      <View className="flex-1 items-center justify-center px-6">
        <IconGeneral type="search" fill="hsl(0, 0% 40%)" size={55} />

        <Tt className="font-interBold text-2xl mt-4 text-hsl30">
          Product Not Found
        </Tt>

        <Tt className="font-interRegular text-center text-hsl40 mt-3 leading-6">
          We couldn’t find any product matching this barcode. Try scanning again
          or enter it manually.
        </Tt>

        <Pressable
          onPress={() => router.replace("/scan")}
          className="bg-primary rounded-lg py-3 px-6 mt-10 border border-primary active:bg-transparent"
        >
          {({ pressed }) => (
            <Tt
              className={`text-lg text-center font-interSemiBold ${
                pressed ? "text-primary" : "text-white"
              }`}
            >
              Go Back
            </Tt>
          )}
        </Pressable>
      </View>
    </View>
  );
};

export default EmptyState;
