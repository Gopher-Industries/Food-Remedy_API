import React from "react";
import { ActivityIndicator, Pressable, Text } from "react-native";
import { useTheme } from "@/theme";

type ButtonVariant = "primary" | "secondary" | "outline";

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  /** FE031: optional spoken label when the visible title is not descriptive enough */
  accessibilityLabel?: string;
  /** FE031: optional spoken hint describing the outcome of pressing the button */
  accessibilityHint?: string;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  fullWidth = true,
  accessibilityLabel,
  accessibilityHint,
}) => {
  const theme = useTheme();
  const widthClasses = fullWidth ? "w-full" : "";
  const disabledClasses = disabled || loading ? "opacity-50" : "";

  // FE031: min-h instead of a fixed height so the label is not clipped
  // when the user raises the OS text size.
  const baseClasses =
    "flex-row items-center justify-center rounded-xl min-h-12 px-4 py-3";

  const variantClasses = {
    primary: "bg-[#FF3F3F]",
    secondary: "bg-slate-700",
    outline: "border border-[#FF3F3F] bg-transparent",
  }[variant];

  const textColor =
    variant === "outline" ? theme.colors.primary : "#FFFFFF";

  const handlePress = () => {
    if (!disabled && !loading) {
      onPress();
    }
  };

  return (
    <Pressable
      className={`${baseClasses} ${variantClasses} ${widthClasses} ${disabledClasses}`}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator
          color={textColor}
          accessibilityLabel={`${title} in progress`}
        />
      ) : (
        <Text
          className="text-sm font-interMedium text-center"
          style={{ color: textColor, flexShrink: 1 }}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
};
