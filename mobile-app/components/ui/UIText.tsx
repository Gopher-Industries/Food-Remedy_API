import React from "react";
import { Text, StyleProp, TextStyle } from "react-native";
import { usePreferences, FontSizeOption } from "@/components/providers/PreferencesProvider";
import { useTheme } from "@/theme";

interface TtProps {
  onPress?: () => void;
  className?: string;
  style?: StyleProp<TextStyle>;
  children?: any;
}

const mapUp: Record<string, string> = {
  "text-xs": "text-sm",
  "text-sm": "text-base",
  "text-base": "text-lg",
  "text-lg": "text-xl",
  "text-xl": "text-2xl",
  "text-2xl": "text-3xl",
};

const mapDown: Record<string, string> = {
  "text-3xl": "text-2xl",
  "text-2xl": "text-xl",
  "text-xl": "text-lg",
  "text-lg": "text-base",
  "text-base": "text-sm",
  "text-sm": "text-xs",
};

const mapDarkText: Record<string, string> = {
  "text-black": "text-white",
  "text-hsl10": "text-hsl95",
  "text-hsl15": "text-hsl95",
  "text-hsl20": "text-hsl90",
  "text-hsl25 dark:text-hsl85": "text-hsl85",
  "text-hsl30 dark:text-hsl90": "text-hsl90",
  "text-hsl40 dark:text-hsl80": "text-hsl80",
  "text-hsl50 dark:text-hsl70": "text-hsl70",
  "text-hsl60": "text-hsl60",
};

function applyFontSizeClasses(className: string, size: FontSizeOption) {
  if (!className) return className;
  if (size === "medium") return className;

  const map = size === "large" ? mapUp : mapDown;
  const tokens = className.split(/\s+/).filter(Boolean);
  return tokens.map((t) => map[t] ?? t).join(" ");
}

function applyDarkTextClasses(className: string, enabled: boolean) {
  if (!enabled || !className) return className;
  const tokens = className.split(/\s+/).filter(Boolean);
  return tokens.map((t) => mapDarkText[t] ?? t).join(" ");
}

function hasExplicitTextColor(className: string) {
  return /\btext-(?:hsl\d+|white|black|primary|danger|success|warning|gray|slate|red|green|amber|yellow|blue)\b/.test(
    className
  );
}

const Tt = ({ onPress, style = {}, className = "", children, ...props }: TtProps) => {
  const { fontSize, darkMode } = usePreferences();
  const theme = useTheme();
  const sized = applyFontSizeClasses(`font-inter ${className}`, fontSize);
  const cn = applyDarkTextClasses(sized, darkMode);
  const mergedStyle = hasExplicitTextColor(className)
    ? style
    : [{ color: theme.colors.text }, style];

  return (
    <Text {...props} className={cn} style={mergedStyle} onPress={onPress}>
      {children}
    </Text>
  );
};

export default Tt;
