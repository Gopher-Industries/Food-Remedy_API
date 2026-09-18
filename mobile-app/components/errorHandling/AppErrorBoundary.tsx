import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { color, spacing, typography } from "@/app/design/token";

type Props = { children: ReactNode };
type State = { error: Error | null };

/** Catches routed-screen render errors in release builds. */
export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the original error and React component stack visible in Metro logs.
    console.error("Unhandled screen error", error, info.componentStack);
  }

  private retry = () => {
    router.replace("/(app)/(tabs)/scan");
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      // Expo's development error overlay remains available while coding.
      if (__DEV__) throw this.state.error;
      return <CrashFallback onRetry={this.retry} />;
    }

    return this.props.children;
  }
}

function CrashFallback({ onRetry }: { onRetry: () => void }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>Something went wrong</Text>
        <Text style={styles.message}>We could not open this screen. Please try again.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Try again" onPress={onRetry} style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: color.background },
  content: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg },
  title: { ...typography.h2, color: color.textDefault, textAlign: "center" },
  message: { ...typography.body, color: color.textMuted, lineHeight: spacing.lg, marginTop: spacing.sm, textAlign: "center" },
  button: { backgroundColor: color.primary, borderRadius: spacing.sm, marginTop: spacing.xl, minWidth: 144, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  buttonPressed: { opacity: 0.8 },
  buttonText: { ...typography.body, color: color.background, fontWeight: "600", textAlign: "center" },
});
