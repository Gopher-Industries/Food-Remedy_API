import React, { useEffect } from 'react';
import { View, Image, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import Tt from '@/components/ui/UIText';

interface OnboardingScreen1Props {
  onGetStarted: () => void;
  onContinueAsGuest: () => void;
}

export default function OnboardingScreen1({ onGetStarted, onContinueAsGuest }: OnboardingScreen1Props) {
  const ovalOpacity = useSharedValue(0);
  const logoOpacity = useSharedValue(0);
  const logoTranslateY = useSharedValue(-24);
  const taglineOpacity = useSharedValue(0);
  const buttonsOpacity = useSharedValue(0);
  const buttonsTranslateY = useSharedValue(18);

  useEffect(() => {
    ovalOpacity.value = withTiming(1, { duration: 350, easing: Easing.out(Easing.quad) });
    logoOpacity.value = withDelay(
      120,
      withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) })
    );
    logoTranslateY.value = withDelay(
      120,
      withTiming(0, { duration: 380, easing: Easing.out(Easing.cubic) })
    );
    taglineOpacity.value = withDelay(
      480,
      withTiming(1, { duration: 320, easing: Easing.out(Easing.quad) })
    );
    buttonsOpacity.value = withDelay(
      720,
      withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) })
    );
    buttonsTranslateY.value = withDelay(
      720,
      withTiming(0, { duration: 300, easing: Easing.out(Easing.quad) })
    );
  }, [
    buttonsOpacity,
    buttonsTranslateY,
    logoOpacity,
    logoTranslateY,
    ovalOpacity,
    taglineOpacity,
  ]);

  const ovalStyle = useAnimatedStyle(() => ({
    opacity: ovalOpacity.value,
  }));

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ translateY: logoTranslateY.value }],
  }));

  const taglineStyle = useAnimatedStyle(() => ({
    opacity: taglineOpacity.value,
  }));

  const buttonsStyle = useAnimatedStyle(() => ({
    opacity: buttonsOpacity.value,
    transform: [{ translateY: buttonsTranslateY.value }],
  }));

  return (
    <View className="flex-1 p-safe bg-hsl95 dark:bg-hsl10 items-center justify-between py-12">
      {/* Spacer */}
      <View className="flex-1" />

      {/* Logo and Tagline */}
      <View className="items-center px-8">
        <Animated.View
          className="w-64 h-24 rounded-full mb-6"
          style={ovalStyle}
        />
        <Animated.View style={logoStyle}>
          <Image
            source={require("@/assets/images/FoodRemedyLogo.png")}
            className="w-80 h-32 mb-8"
            resizeMode="contain"
          />
        </Animated.View>
        
        <Animated.View style={taglineStyle}>
          <Tt className="text-xl text-hsl20 text-center font-interMedium">
            Smarter Eating, One meal at a time
          </Tt>
        </Animated.View>
      </View>

      {/* Spacer */}
      <View className="flex-1" />

      {/* Buttons */}
      <Animated.View className="w-full px-6 mb-4" style={buttonsStyle}>
        {/* Get Started Button */}
        <Pressable
          onPress={onGetStarted}
          className="bg-primary rounded-xl py-4 active:opacity-80 mb-3"
        >
          <Tt className="text-white text-lg font-interSemiBold text-center">
            Get Started
          </Tt>
        </Pressable>

        <Pressable
          onPress={onContinueAsGuest}
          className="bg-transparent border-2 border-primary rounded-xl py-4 active:bg-pink-50"
        >
          <Tt className="text-primary text-lg font-interSemiBold text-center">
            Continue as guest
          </Tt>
        </Pressable>
      </Animated.View>
    </View>
  );
}
