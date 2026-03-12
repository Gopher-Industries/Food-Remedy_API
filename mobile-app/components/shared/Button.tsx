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
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  fullWidth = true,
}) => {
  const theme = useTheme();
  const widthClasses = fullWidth ? "w-full" : "";
  const disabledClasses = disabled || loading ? "opacity-50" : "";

  const baseClasses =
    "flex-row items-center justify-center rounded-xl h-12";

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
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text
          className="text-sm font-interMedium"
          style={{ color: textColor }}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
};
