import React from "react";
import { Pressable } from "react-native";
import { router } from "expo-router";
import { useTheme } from "@/theme";
import IconGeneral from "@/components/icons/IconGeneral";

interface BackButtonProps {
  onPress?: () => void;
}

const PRESSED_COLOR = "#FF3F3F";

export const BackButton: React.FC<BackButtonProps> = ({ onPress }) => {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress ?? (() => router.back())}
      hitSlop={8}
    >
      {({ pressed }) => (
        <IconGeneral
          type="arrow-backward-ios"
          fill={pressed ? PRESSED_COLOR : theme.colors.textMuted}
          size={24}
        />
      )}
    </Pressable>
  );
};
