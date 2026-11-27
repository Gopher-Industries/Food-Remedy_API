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
    // FE031: the dots are a progress indicator, so they are announced once as
    // "Step 2 of 3" instead of as several unlabelled controls.
    <View
      className="flex-row items-center justify-center gap-x-2"
      accessible={!onDotPress}
      accessibilityRole={onDotPress ? undefined : "progressbar"}
      accessibilityLabel={
        onDotPress ? undefined : `Step ${currentIndex + 1} of ${totalPages}`
      }
    >
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
            accessible={!!onDotPress}
            accessibilityRole={onDotPress ? "button" : undefined}
            accessibilityLabel={
              onDotPress ? `Go to step ${index + 1} of ${totalPages}` : undefined
            }
            accessibilityState={onDotPress ? { selected: isActive } : undefined}
            importantForAccessibility={onDotPress ? "yes" : "no-hide-descendants"}
          />
        );
      })}
    </View>
  );
}
