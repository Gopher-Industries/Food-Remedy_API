import React from "react";
import { Text, View } from "react-native";
import { useTheme } from "@/theme";

type TagVariant = "success" | "warning" | "danger" | "neutral";

interface TagProps {
  label: string;
  variant?: TagVariant;
}

export const Tag: React.FC<TagProps> = ({
  label,
  variant = "neutral",
}) => {
  const theme = useTheme();
  const styles = {
    success: {
      bg: "#D1FAE5",
      text: theme.colors.success,
    },
    warning: {
      bg: "#FEF3C7",
      text: theme.colors.warning,
    },
    danger: {
      bg: "#FECACA",
      text: theme.colors.danger,
    },
    neutral: {
      bg: theme.colors.chipNeutralBg,
      text: theme.colors.chipNeutralText,
    },
  }[variant];

  return (
    <View
      className="px-2.5 py-1 rounded-full"
      style={{ backgroundColor: styles.bg }}
    >
      <Text className="text-xs font-semibold" style={{ color: styles.text }}>
        {label}
      </Text>
    </View>
  );
};
