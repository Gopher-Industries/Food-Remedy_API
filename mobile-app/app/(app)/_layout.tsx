import { useAuth } from "@/components/providers/AuthProvider";
import { Redirect, Stack, usePathname } from "expo-router";
import LoadingPage from "../(misc)/loading";
import { useProfileGate } from "@/hooks/useProfileGate";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";

export default function AppLayout() {
  const { loading: authLoading, user } = useAuth();
  const { gate } = useProfileGate();
  const pathname = usePathname();

  if (authLoading) return <LoadingPage />;
  if (!user) return <Redirect href="/login" />;

  if (gate === "loading") return <LoadingPage />;

  if (gate === "needs-onboarding" && pathname !== "/onboarding") {
    return <Redirect href="/onboarding" />;
  }

  // if (
  //   gate === "needs-demographics" &&
  //   pathname !== "/demographics"
  //   // pathname !== "/nutritionalProfiles"
  //   // !pathname.startsWith("/(apps)/(tabs)")
  // ) {
  //   return <Redirect href="/demographics" />;
  // }

  if (
    gate === "ready" &&
    (pathname === "/onboarding" ||
      pathname === "/demographics" ||
      pathname === "/nutritionalProfiles")
  ) {
    return <Redirect href="/(app)/(tabs)" />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="demographics" />
          <Stack.Screen name="nutritionalProfiles" />
          <Stack.Screen name="settings/notification" />
          <Stack.Screen name="settings/about" />
          <Stack.Screen name="settings/contact" />
          <Stack.Screen name="settings/feedback" />
          <Stack.Screen name="settings/privacy" />
          <Stack.Screen name="settings/terms" />
        </Stack>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}