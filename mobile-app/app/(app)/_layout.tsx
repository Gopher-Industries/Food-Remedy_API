// _layout (app) tsx

import { useAuth } from "@/components/providers/AuthProvider";
import { Redirect, Stack, usePathname } from "expo-router";
import LoadingPage from "../(misc)/loading";
import { useProfileGate } from "@/hooks/useProfileGate";
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';

export default function AppLayout() {
  const { loading: authLoading, user } = useAuth();
  const { gate } = useProfileGate(); // 'loading' | 'needs-onboarding' | 'ready'
  const pathname = usePathname();

  // 1) Auth gate
  if (authLoading) return <LoadingPage />;
  if (!user) return <Redirect href="/login" />;

  // 2) Profile gate
  if (gate === 'loading') return <LoadingPage />;

  // If no profile yet, always send to onboarding (unless already there)
  if (gate === 'needs-onboarding' && pathname !== '/onboarding') {
    return <Redirect href="/onboarding" />;
  }

  // If a profile exists and user somehow navigates to onboarding, kick them to history
  if (gate === 'ready' && pathname === '/onboarding') {
    return <Redirect href="/(app)/(tabs)" />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding" />
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
