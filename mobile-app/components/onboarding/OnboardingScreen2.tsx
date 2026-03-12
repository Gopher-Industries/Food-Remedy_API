// Onboarding Screen 2

import React from "react";
import { View, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Tt from "@/components/ui/UIText";
import IconGeneral from "@/components/icons/IconGeneral";
import PaginationIndicator from "./PaginationIndicator";

interface OnboardingScreen2Props {
  onNext: () => void;
  onSkip: () => void;
}

export default function OnboardingScreen2({
  onNext,
  onSkip,
}: OnboardingScreen2Props) {
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
        <View className="mb-14 relative">
          {/* Decorative Frame with Gradient Border */}
          <LinearGradient
            colors={["#DF121A", "#E47E40"]}
            start={{ x: 0.8, y: 0 }}
            end={{ x: 0.92, y: 0.04 }}
            style={{ borderRadius: 16, padding: 4 }}
          >
            <View className="w-64 h-48 items-center justify-start bg-[#e2e2e2] rounded-2xl">
              {/* Barcode Icon */}
              <View className="items-center flex-row gap-x-2">
                <IconGeneral type="barcode" fill="hsl(0, 0%, 20%)" size={80} />
                <IconGeneral type="barcode" fill="hsl(0, 0%, 20%)" size={80} />
              </View>
              <View className="mt-2 h-2 bg-[#c6c6c6] rounded-md w-2/3 self-center" />
              <View className="mt-2 ml-11 h-2 bg-[#f4f4f4] rounded-md w-1/3 self-start" />
              <View className="mt-4 h-2 bg-[#c6c6c6] rounded-md w-2/3 self-center" />
              <View className="mt-2 ml-11 h-2 bg-[#f4f4f4] rounded-md w-1/3 self-start" />
            </View>
          </LinearGradient>

          {/* Decorative Icons */}
          <View className="absolute -top-5 -right-5 bg-[#cbefd6] rounded-[10px] p-[5px]">
            <IconGeneral type="info" fill="#26b02a" size={36} />
          </View>
          <View className="absolute bottom-5 -left-6 bg-[#FABEBE] rounded-[20px] p-[6px]">
            <IconGeneral type="heart" fill="red" size={32} />
          </View>
          <View className="absolute -bottom-6 right-10 bg-[#BEBEBE] rounded-[30px] p-[9px]">
            <IconGeneral type="camera" fill="black" size={30} />
          </View>
        </View>

        {/* Title */}
        <Tt className="text-3xl font-interBold text-hsl20 text-center mb-6">
          Understand{"\n"}What&apos;s in Your Food
        </Tt>

        {/* Feature List */}
        <View className="w-[82%] mb-[20px]">
          <View className="flex-row items-start mb-4">
            <View className="w-2 h-2 bg-primary rounded-full mt-2 mr-3" />
            <Tt className="flex-1 text-lg text-justify font-light text-black leading-6">
              Instant ingredient scanning with your camera
            </Tt>
          </View>

          <View className="flex-row items-start mb-4">
            <View className="w-2 h-2 bg-primary rounded-full mt-2 mr-3" />
            <Tt className="flex-1 text-lg text-justify font-light text-black leading-6">
              Automatic allergen detection and alerts
            </Tt>
          </View>

          <View className="flex-row items-start">
            <View className="w-2 h-2 bg-primary rounded-full mt-2 mr-3" />
            <Tt className="flex-1 text-lg text-justify font-light text-black leading-6">
              Personalized recommendations for your health
            </Tt>
          </View>
        </View>
      </View>
      
      {/* Pagination Indicator */}
      <View className="pb-6 mb-3">
        <PaginationIndicator currentIndex={1} totalPages={3} />
      </View>

      {/* Next Button */}
      <View className="px-6 mb-4">
        <Pressable
          onPress={onNext}
          className="bg-primary rounded-xl py-4 active:opacity-80"
        >
          {({ pressed }) => (
            <View className="flex-row items-center justify-center">
              <Tt className="text-white text-lg font-interSemiBold mr-2">
                Next
              </Tt>
              <IconGeneral type="arrow-forward-ios" fill="white" size={20} />
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
}
