// mobile-app/components/providers/PreferencesProvider.tsx

import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type FontSizeOption = "small" | "medium" | "large";

interface PreferencesContextType {
  ttsEnabled: boolean;
  toggleTts: () => void;
  fontSize: FontSizeOption;
  setFontSize: (v: FontSizeOption) => void;
  highContrast: boolean;
  setHighContrast: (v: boolean) => void;
  darkMode: boolean;
  setDarkMode: (v: boolean) => void;
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

const KEY_TTS = "prefs_tts_enabled_v1";
const KEY_FONT = "a11y_font_size_v1";
const KEY_HC = "a11y_high_contrast_v1";
const KEY_DARK = "prefs_dark_mode_v1";

export const PreferencesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [fontSize, setFontSizeState] = useState<FontSizeOption>("medium");
  const [highContrast, setHighContrastState] = useState(false);
  const [darkMode, setDarkModeState] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [tts, f, hc, dm] = await Promise.all([
          AsyncStorage.getItem(KEY_TTS),
          AsyncStorage.getItem(KEY_FONT),
          AsyncStorage.getItem(KEY_HC),
          AsyncStorage.getItem(KEY_DARK),
        ]);
        if (!mounted) return;

        if (tts === "1" || tts === "0") setTtsEnabled(tts === "1");
        if (f === "small" || f === "medium" || f === "large") setFontSizeState(f);
        if (hc === "1") setHighContrastState(true);
        if (hc === "0") setHighContrastState(false);
        if (dm === "1") setDarkModeState(true);
        if (dm === "0") setDarkModeState(false);
      } catch {}
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const toggleTts = async () => {
    setTtsEnabled((prev) => {
      const next = !prev;
      AsyncStorage.setItem(KEY_TTS, next ? "1" : "0").catch(() => {});
      return next;
    });
  };

  const setFontSize = async (v: FontSizeOption) => {
    setFontSizeState(v);
    try {
      await AsyncStorage.setItem(KEY_FONT, v);
    } catch {}
  };

  const setHighContrast = async (v: boolean) => {
    setHighContrastState(v);
    try {
      await AsyncStorage.setItem(KEY_HC, v ? "1" : "0");
    } catch {}
  };

  const setDarkMode = async (v: boolean) => {
    setDarkModeState(v);
    try {
      await AsyncStorage.setItem(KEY_DARK, v ? "1" : "0");
    } catch {}
  };

  return (
    <PreferencesContext.Provider
      value={{
        ttsEnabled,
        toggleTts,
        fontSize,
        setFontSize,
        highContrast,
        setHighContrast,
        darkMode,
        setDarkMode,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
};

export const usePreferences = () => {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    if (__DEV__) console.warn("usePreferences used outside PreferencesProvider");
    return {
      ttsEnabled: true,
      toggleTts: () => {},
      fontSize: "medium" as const,
      setFontSize: () => {},
      highContrast: false,
      setHighContrast: () => {},
      darkMode: false,
      setDarkMode: () => {},
    };
  }
  return ctx;
};
