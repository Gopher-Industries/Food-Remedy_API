// Initial App Onboarding

import { useState, useCallback } from "react";
import { View, useWindowDimensions, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import {
  OnboardingScreen1,
  OnboardingScreen2,
  OnboardingScreen3,
} from "@/components/onboarding";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useTheme } from "@/theme";

const ANIMATION_DURATION = 350;

export default function InitialOnboarding() {
  const router = useRouter();
  const { completeOnboarding } = useOnboarding();
  const theme = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  
  const [currentScreen, setCurrentScreen] = useState<1 | 2 | 3>(1);
  const [isAnimating, setIsAnimating] = useState(false);
  
  // Shared value for slide position (0 = screen 1, 1 = screen 2, 2 = screen 3)
  const slidePosition = useSharedValue(0);

  const animateToScreen = useCallback((targetScreen: 1 | 2 | 3) => {
    if (isAnimating) return;
    setIsAnimating(true);
    
    const targetPosition = targetScreen - 1;
    slidePosition.value = withTiming(targetPosition, {
      duration: ANIMATION_DURATION,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    }, (finished) => {
      if (finished) {
        runOnJS(setCurrentScreen)(targetScreen);
        runOnJS(setIsAnimating)(false);
      }
    });
  }, [isAnimating, slidePosition]);

  // Screen 1 handlers
  const handleGetStarted = () => {
    animateToScreen(2);
  };

  const handleContinueAsGuest = async () => {
    await completeOnboarding();
    router.replace("/(app)/(tabs)");
  };

  // Screen 2 handlers
  const handleScreen2Next = () => {
    animateToScreen(3);
  };

  const handleScreen2Skip = async () => {
    await completeOnboarding();
    router.replace("/login");
  };

  // Screen 3 handlers
  const handleScreen3GetStarted = async () => {
    await completeOnboarding();
    router.replace("/login");
  };

  const handleContinueWithoutAccount = async () => {
    await completeOnboarding();
    router.replace("/login");
  };

  const handleScreen3Skip = async () => {
    await completeOnboarding();
    router.replace("/login");
  };

  // Animated styles for each screen
  const screen1Style = useAnimatedStyle(() => ({
    transform: [{ translateX: -slidePosition.value * screenWidth }],
  }));

  const screen2Style = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - slidePosition.value) * screenWidth }],
  }));

  const screen3Style = useAnimatedStyle(() => ({
    transform: [{ translateX: (2 - slidePosition.value) * screenWidth }],
  }));

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Screen 1 */}
      <Animated.View style={[styles.screen, screen1Style]}>
        <OnboardingScreen1
          onGetStarted={handleGetStarted}
          onContinueAsGuest={handleContinueAsGuest}
        />
      </Animated.View>

      {/* Screen 2 */}
      <Animated.View style={[styles.screen, screen2Style]}>
        <OnboardingScreen2
          onNext={handleScreen2Next}
          onSkip={handleScreen2Skip}
        />
      </Animated.View>

      {/* Screen 3 */}
      <Animated.View style={[styles.screen, screen3Style]}>
        <OnboardingScreen3
          onLogInOrSignUp={handleScreen3GetStarted}
          onSkipForNow={handleContinueWithoutAccount}
          onSkip={handleScreen3Skip}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  screen: {
    ...StyleSheet.absoluteFillObject,
  },
});
