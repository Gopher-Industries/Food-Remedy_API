// app/theme.ts

import { useMemo } from "react";
import { usePreferences } from "@/components/providers/PreferencesProvider";

const lightTheme = {
  colors: {
    // Brand
    primary: "theme.colors.primary",       // main brand red (matches app colour scheme)
    primaryDark: "#E03535",

    // Semantic
    success: "#059669",       // emerald-600
    warning: "#D97706",       // amber-600
    danger: "#B91C1C",        // red-700

    // Neutrals
    background: "#F2F2F2",    // hsl(0 0% 95%)
    surface: "#FFFFFF",
    border: "#E5E7EB",        // light grey
    text: "#1F2937",          // slate-800-ish
    textMuted: "#6B7280",     // slate-500-ish

    // Extras
    chipNeutralBg: "#E5E7EB",
    chipNeutralText: "#374151",
  },

  radius: {
    sm: 6,
    md: 10,
    lg: 16,
    xl: 24,
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
  },
} as const;

export type Theme = typeof lightTheme;

const darkTheme: Theme = {
  colors: {
    primary: "theme.colors.primary",
    primaryDark: "#E03535",
    success: "#10B981",
    warning: "#F59E0B",
    danger: "#EF4444",
    background: "#0F1115",
    surface: "#1A1D23",
    border: "#2A2E36",
    text: "#F9FAFB",
    textMuted: "#9CA3AF",
    chipNeutralBg: "#2A2E36",
    chipNeutralText: "#E5E7EB",
  },
  radius: lightTheme.radius,
  spacing: lightTheme.spacing,
};

export function useTheme(): Theme {
  const { darkMode } = usePreferences();
  return useMemo(() => (darkMode ? darkTheme : lightTheme), [darkMode]);
}

export const theme = lightTheme;
