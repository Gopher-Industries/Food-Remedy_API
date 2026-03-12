import { useEffect } from "react";
import * as SystemUI from "expo-system-ui";
import { StatusBar } from "expo-status-bar";
import { usePreferences } from "./PreferencesProvider";
import { useTheme } from "@/theme";
import { useColorScheme } from "nativewind";

const ThemeBridge = () => {
  const { darkMode } = usePreferences();
  const theme = useTheme();
  const { setColorScheme } = useColorScheme();

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.colors.background);
  }, [theme.colors.background]);

  useEffect(() => {
    setColorScheme(darkMode ? "dark" : "light");
  }, [darkMode, setColorScheme]);

  return <StatusBar style={darkMode ? "light" : "dark"} hidden={false} translucent />;
};

export default ThemeBridge;
