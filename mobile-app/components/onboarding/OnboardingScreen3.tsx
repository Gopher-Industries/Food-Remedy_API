// Onboarding Screen 3

import React from "react";
import { View, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Tt from "@/components/ui/UIText";
import IconGeneral from "@/components/icons/IconGeneral";
import PaginationIndicator from "./PaginationIndicator";

interface OnboardingScreen3Props {
  onLogInOrSignUp: () => void;
  onSkipForNow: () => void;
  onSkip: () => void;
}

export default function OnboardingScreen3({
  onLogInOrSignUp,
  onSkipForNow,
  onSkip,
}: OnboardingScreen3Props) {
  return (
    <View className="flex-1 p-safe bg-hsl95 dark:bg-hsl10">
      {/* Skip Button */}
      <View className="items-end px-1 pt-4">
        <Pressable
          onPress={onSkip}
          className="py-1 px-3 mr-[10px] bg-gray-300 rounded-lg"
        >
          <Tt className="text-black text-base font-interMedium">Skip</Tt>
        </Pressable>
      </View>

      {/* Content */}
      <View className="flex-1 items-center justify-center px-8">
        {/* Icon/Image Placeholder */}
        <View className="mb-12 relative">
          {/* Decorative Frame with Gradient Border */}
          <LinearGradient
            colors={["#30AD0E", "#56d306"]}
            start={{ x: 0.8, y: 0 }}
            end={{ x: 1, y: 0.07 }}
            style={{ borderRadius: 16, padding: 4 }}
          >
            <View className="w-64 h-50 bg-[#dbdbdb] p-4 rounded-2xl">
              {/* Profile Icon */}
              <View className="flex-row items-center mb-4">
                <LinearGradient
                  colors={["#6ACD38", "#41CF41"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ borderRadius: 12, padding: 8 }}
                >
                  <IconGeneral type="person" fill="white" size={28} />
                </LinearGradient>
                <View className="flex-1 ml-3">
                  <View className="h-3 bg-hsl90 dark:bg-hsl15 rounded w-3/4 mb-2" />
                  <View className="h-3 bg-white dark:bg-hsl15 rounded w-9/10" />
                </View>
              </View>

              {/* Dietary Preferences */}
              <View className="bg-[#e9e9e9] rounded-lg p-2.5 mb-3">
                <View className="flex-row items-center">
                  <View className="bg-[#FABEBE] rounded-[15px] p-[5px]">
                    <IconGeneral type="heart" fill="red" size={24} />
                  </View>
                  <View className="flex-1">
                    <Tt className="ml-[5px] font-interMedium text-hsl20">
                      Dietary Preferences
                    </Tt>
                    <View className="ml-[5px] mt-2 mb-1 h-2 bg-white dark:bg-hsl15 rounded w-3/4" />
                  </View>
                </View>
              </View>

              {/* Health Dashboard */}
              <View className="bg-[#e9e9e9] rounded-lg p-2.5 mb-3">
                <View className="flex-row items-center">
                  <View className="bg-[#BEBEBE] rounded-[15px] p-[5px]">
                    <IconGeneral type="grid" fill="black" size={24} />
                  </View>
                  <View className="flex-1">
                    <Tt className="ml-[5px] font-interMedium text-hsl20">
                      Health Dashboard
                    </Tt>
                    <View className="ml-[5px] mt-2 mb-1 h-2 bg-white dark:bg-hsl15 rounded w-3/4" />
                  </View>
                </View>                
              </View>
            </View>
          </LinearGradient>

          {/* Decorative Icon */}
          <View className="absolute -top-6 -right-4 bg-[#FABEBE] rounded-[10px] p-[6px]">
            <IconGeneral type="heart" fill="red" size={32} />
          </View>
          <View className="absolute -bottom-5 -left-5 bg-hsl20 rounded-[10px] p-1">
            <IconGeneral type="grid" fill="white" size={32} />
          </View>
        </View>

        {/* Title */}
        <Tt className="text-3xl font-interBold text-hsl20 text-center mb-4">
          Personalize{"\n"}Your Experience
        </Tt>

        {/* Description */}
        <Tt className="text-lg w-[84%] text-black text-center font-thin leading-6">
          Save preferences, view safe foods, and access your dashboard.
        </Tt>
      </View>

      {/* Pagination Indicator */}
      <View className="pb-6">
        <PaginationIndicator currentIndex={2} totalPages={3} />
      </View>

      {/* Buttons */}
      <View className="px-6 mb-4">
        {/* Get Started Button */}
        <Pressable
          onPress={onLogInOrSignUp}
          className="bg-primary rounded-xl py-4 active:opacity-80 mb-3"
        >
          <Tt className="text-white text-lg font-interSemiBold text-center">
            Log In / Sign Up
          </Tt>
        </Pressable>

        {/* Continue without Account Button */}
        <Pressable
          onPress={onSkipForNow}
          className="bg-pink-100 border-2 border-primary rounded-xl py-4 active:bg-pink-50"
        >
          <Tt className="text-primary text-lg font-interSemiBold text-center">
            Skip for Now
          </Tt>
        </Pressable>
      </View>
    </View>
  );
}
