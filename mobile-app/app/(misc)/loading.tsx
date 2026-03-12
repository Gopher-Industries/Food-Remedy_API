// Loading Page TSX

import { ActivityIndicator, View } from "react-native";
import Tt from "@/components/ui/UIText";
import { color } from "@/app/design/token";
import Screen from "@/components/layout/Screen";

// Lightweight skeleton-like loading page to improve perceived performance
export default function LoadingPage() {
  return (
    <Screen className="justify-center items-center p-safe">
      <ActivityIndicator size="large" color={color.primary} />
      <Tt className="mt-8 text-lg font-interSemiBold">Loading</Tt>
    </Screen>
  );
}
