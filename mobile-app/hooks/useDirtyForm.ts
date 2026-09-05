import { useState, useCallback, useEffect, useRef } from "react";
import { Alert, Platform } from "react-native";
import { useNavigation } from "expo-router";

const TITLE = "Discard changes?";
const MESSAGE = "You have unsaved changes that will be lost.";

function showGuard(onConfirm: () => void) {
  if (Platform.OS === "web") {
    if (window.confirm(`${TITLE}\n\n${MESSAGE}`)) onConfirm();
  } else {
    Alert.alert(TITLE, MESSAGE, [
      { text: "Stay", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: onConfirm },
    ]);
  }
}

export function useDirtyForm() {
  const [isDirty, setIsDirty] = useState(false);
  const navigation = useNavigation();
  const confirmedRef = useRef(false);

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (e) => {
      if (confirmedRef.current) {
        confirmedRef.current = false;
        return;
      }
      if (!isDirty) return;
      e.preventDefault();
      showGuard(() => navigation.dispatch(e.data.action));
    });
    return unsubscribe;
  }, [navigation, isDirty]);

  const markDirty = useCallback(() => setIsDirty(true), []);
  const markClean = useCallback(() => setIsDirty(false), []);

  const confirmLeave = useCallback(
    (onLeave: () => void) => {
      if (!isDirty) {
        onLeave();
        return;
      }
      showGuard(() => {
        confirmedRef.current = true;
        onLeave();
      });
    },
    [isDirty]
  );

  return { isDirty, markDirty, markClean, confirmLeave };
}
