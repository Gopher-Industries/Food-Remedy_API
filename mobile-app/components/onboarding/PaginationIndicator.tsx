import React from "react";
import { View, Pressable } from "react-native";

interface PaginationIndicatorProps {
  currentIndex: number;
  totalPages: number;
  activeColor?: string;
  inactiveColor?: string;
  onDotPress?: (index: number) => void;
}

export default function PaginationIndicator({
  currentIndex,
  totalPages,
  activeColor = "bg-primary",
  inactiveColor = "bg-hsl70",
  onDotPress,
}: PaginationIndicatorProps) {
  return (
    <View className="flex-row items-center justify-center gap-x-2">
      {Array.from({ length: totalPages }).map((_, index) => {
        const isActive = index === currentIndex;
        return (
          <Pressable
            key={index}
            onPress={() => onDotPress?.(index)}
            hitSlop={8}
            className={`rounded-full ${
              isActive ? `w-8 h-2 ${activeColor}` : `w-2 h-2 ${inactiveColor}`
            }`}
          />
        );
      })}
    </View>
  );
}
