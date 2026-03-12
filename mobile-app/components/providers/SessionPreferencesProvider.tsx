import React, { createContext, useContext, useState, ReactNode } from "react";

type SessionPreferencesContextType = {
  allergenHighlightEnabled: boolean;
  toggleAllergenHighlight: () => void;
  showContainsBadges: boolean;
  toggleShowContains: () => void;
};

const SessionPreferencesContext = createContext<
  SessionPreferencesContextType | undefined
>(undefined);

export function SessionPreferencesProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [allergenHighlightEnabled, setAllergenHighlightEnabled] =
    useState(true);
  const [showContainsBadges, setShowContainsBadges] = useState(true);

  const toggleAllergenHighlight = () => {
    setAllergenHighlightEnabled((prev) => !prev);
  };

  const toggleShowContains = () => setShowContainsBadges((p) => !p);

  return (
    <SessionPreferencesContext.Provider
      value={{
        allergenHighlightEnabled,
        toggleAllergenHighlight,
        showContainsBadges,
        toggleShowContains,
      }}
    >
      {children}
    </SessionPreferencesContext.Provider>
  );
}
export function useSessionPreferences() {
  const ctx = useContext(SessionPreferencesContext);
  if (!ctx) {
    throw new Error(
      "useSessionPreferences must be used within a SessionPreferencesProvider",
    );
  }
  return ctx;
}
