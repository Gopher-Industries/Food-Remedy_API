import React from "react";
import { Pressable, View } from "react-native";
import { useTheme } from "@/theme";

interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  padding?: "sm" | "md" | "lg";
}

export const Card: React.FC<CardProps> = ({
  children,
  onPress,
  padding = "md",
}) => {
  const theme = useTheme();
  const paddingClass =
    padding === "sm" ? "p-3" : padding === "lg" ? "p-5" : "p-4";

  const classes = `
    rounded-2xl 
    shadow-sm 
    border 
    mb-3
    ${paddingClass}
  `;

  if (onPress) {
    return (
      <Pressable
        className={classes}
        style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.surface }}
        onPress={onPress}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View
      className={classes}
      style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.surface }}
    >
      {children}
    </View>
  );
};
