import { useAuth } from "@/components/providers/AuthProvider";
import { Redirect, Stack, useGlobalSearchParams, usePathname, useRouter } from "expo-router";
import LoadingPage from "../(misc)/loading";
import { useProfileGate } from "@/hooks/useProfileGate";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { useEffect, useMemo } from "react";
import LoginRequiredPrompt from "@/components/authentication/LoginRequiredPrompt";
import { getAppRouteAccess } from "@/services/session/routeAccess";

export default function AppLayout() {
  const {
    loading: authLoading,
    sessionType,
    setPendingRoute,
    clearPendingRoute,
  } = useAuth();
  const { gate } = useProfileGate();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const router = useRouter();
  const requestedRoute = useMemo(() => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      const values = Array.isArray(value) ? value : [value];
      values.forEach((item) => {
        if (item != null) query.append(key, String(item));
      });
    });
    const queryString = query.toString();
    return queryString ? `${pathname}?${queryString}` : pathname;
  }, [params, pathname]);
  const requiresAccount = getAppRouteAccess(pathname) === "authenticated";

  useEffect(() => {
    if (requiresAccount && sessionType !== "authenticated") {
      setPendingRoute(requestedRoute);
    }
  }, [requestedRoute, requiresAccount, sessionType, setPendingRoute]);

  if (authLoading || sessionType === "restoring") return <LoadingPage />;
  if (sessionType === "unauthenticated") return <Redirect href="/login" />;

  if (sessionType === "guest" && requiresAccount) {
    const cancel = () => {
      clearPendingRoute();
      router.replace("/(app)/(tabs)/scan");
    };

    return (
      <>
        <LoadingPage />
        <LoginRequiredPrompt
          visible
          onLogin={() => router.replace("/login")}
          onCreateAccount={() => router.replace("/register")}
          onCancel={cancel}
        />
      </>
    );
  }

  if (sessionType === "guest") return <AppStack />;

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

  if (gate === "ready" && pathname === "/onboarding") {
    return <Redirect href="/(app)/(tabs)" />;
  }

  return <AppStack />;
}

function AppStack() {
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
