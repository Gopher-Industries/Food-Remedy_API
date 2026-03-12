// app/_layout.tsx

import "../global.css";
import 'react-native-get-random-values';
import { Slot, useRouter, useSegments } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useEffect } from "react";
import { useFonts } from "expo-font";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, } from "@expo-google-fonts/inter";
import * as SplashScreen from "expo-splash-screen";
import Providers from "@/components/providers/Providers";
import { useOnboarding } from "@/hooks/useOnboarding";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const { hasCompletedOnboarding, loading: onboardingLoading } = useOnboarding();
  
  const [loaded, error] = useFonts({
    "SpaceMono-Regular": require("@/assets/fonts/SpaceMono-Regular.ttf"),
    "DrukWide-Medium": require("@/assets/fonts/DrukWide-Medium.otf"),
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });


  /**
   * Load Fonts
   */
  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [loaded, error]);

  /**
   * Handle Onboarding Navigation
   */
  useEffect(() => {
    if (onboardingLoading || !loaded) return;

    const inOnboarding = segments[0] === 'onboarding';

    // If user hasn't completed onboarding and not already on onboarding screen
    if (hasCompletedOnboarding === false && !inOnboarding) {
      router.replace('/onboarding');
    }
  }, [hasCompletedOnboarding, onboardingLoading, loaded, segments, router]);

  if (!loaded && !error) return null;
  if (onboardingLoading) return null;

  return (
    <Providers>
      <SafeAreaProvider>
        <Slot />
      </SafeAreaProvider>
    </Providers>

  );
}
