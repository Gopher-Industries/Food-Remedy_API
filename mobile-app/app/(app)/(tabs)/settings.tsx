// mobile-app/app/(app)/(tabs)/settings.tsx
import IconGeneral from "@/components/icons/IconGeneral";
import Header from "@/components/layout/Header";
import { useAuth } from "@/components/providers/AuthProvider";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import Tt from "@/components/ui/UIText";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { color, spacing } from "@/app/design/token";
import Screen from "@/components/layout/Screen";

/**
 * High contrast helpers (className strings)
 */
const hcBg = (on: boolean) => (on ? "bg-white dark:bg-hsl15" : "");
const hcSection = (on: boolean) => (on ? "bg-white dark:bg-hsl15 border-b border-black" : "bg-hsl90 dark:bg-hsl15");
const hcRow = (on: boolean) => (on ? "bg-white dark:bg-hsl15 border-b border-black" : "border-b border-hsl85 dark:border-hsl20");
const hcText = (on: boolean) => (on ? "text-black" : "text-hsl30 dark:text-hsl90");

export default function SettingsPage() {
  const router = useRouter();
  const { handleSignOut } = useAuth();

  // completed features
  const {
    ttsEnabled,
    toggleTts,
    fontSize,
    setFontSize,
    highContrast,
    setHighContrast,
    darkMode,
    setDarkMode,
  } = usePreferences();

  return (
    <Screen className={`p-safe ${hcBg(highContrast)}`}>
      <Header />

      <ScrollView>
        <Tt className="text-xl font-interBold text-center my-4">Settings</Tt>

        {/* App Settings */}
        <View className={`px-4 py-2 ${hcSection(highContrast)}`}>
          <Tt className={`${hcText(highContrast)} font-interMedium`}>App Settings</Tt>
        </View>

        <Pressable
          onPress={() => router.push("/(app)/settings/notification")}
          className={`flex-row justify-between items-center px-4 py-3 active:bg-hsl98 dark:bg-hsl10 ${hcRow(
            highContrast
          )}`}
        >
          {({ pressed }) => (
            <>
              <View className="flex-row items-center gap-x-4">
                <IconGeneral
                  type="notification-settings"
                  fill={pressed ? color.primary : highContrast ? "#000000" : color.iconDefault}
                  size={spacing.xl}
                />
                <View>
                  <Tt className="font-interMedium">Notification</Tt>
                  <Tt className="text-sm">Edit Notification Settings</Tt>
                </View>
              </View>

              <IconGeneral
                type="arrow-forward"
                fill={pressed ? color.primary : "hsl(0, 0%, 50%)"}
                size={spacing.xl}
              />
            </>
          )}
        </Pressable>

        <Pressable
          onPress={() => setDarkMode(!darkMode)}
          className={`flex-row justify-between items-center px-4 py-3 active:bg-hsl98 dark:bg-hsl10 ${
            highContrast ? "bg-white dark:bg-hsl15" : ""
          }`}
        >
          {({ pressed }) => (
            <>
              <View className="flex-row items-center gap-x-4">
                <IconGeneral
                  type="dark-mode"
                  fill={pressed ? color.primary : highContrast ? "#000000" : color.iconDefault}
                  size={spacing.xl}
                />
                <View>
                  <Tt className="font-interMedium">Dark Mode</Tt>
                  <Tt className="text-sm">Toggle Dark Mode</Tt>
                </View>
              </View>

              <View
                className={`px-2 rounded ${
                  highContrast ? "bg-white dark:bg-hsl15 border border-black" : "bg-white dark:bg-hsl15 border border-hsl90 dark:border-hsl20"
                }`}
              >
                <Tt>{darkMode ? "On" : "Off"}</Tt>
              </View>
            </>
          )}
        </Pressable>

        {/* Accessibility */}
        <View className={`px-4 py-2 ${hcSection(highContrast)}`}>
          <Tt className={`${hcText(highContrast)} font-interMedium`}>Accessibility</Tt>
        </View>

        {/* Font size selector */}
        <View className={`px-4 py-3 ${hcRow(highContrast)} bg-hs198 dark:bg-hsl15`}>
          <Tt className="font-interMedium">Font Size</Tt>
          <Tt className="text-sm">Small / Medium / Large</Tt>

          <View className="flex-row gap-x-2 mt-3">
            <Pressable
              onPress={() => setFontSize("small")}
              className={`flex-1 py-2 rounded border ${
                fontSize === "small"
                  ? highContrast
                    ? "border-black bg-black"
                    : "border-primary bg-primary"
                  : highContrast
                  ? "border-black bg-white dark:bg-hsl15"
                  : "border-hsl90 dark:border-hsl20 bg-white dark:bg-hsl15"
              }`}
            >
              <Tt
                className={`text-center ${
                  fontSize === "small" ? "text-white" : highContrast ? "text-black" : "text-hsl30 dark:text-hsl90"
                }`}
              >
                Small
              </Tt>
            </Pressable>

            <Pressable
              onPress={() => setFontSize("medium")}
              className={`flex-1 py-2 rounded border ${
                fontSize === "medium"
                  ? highContrast
                    ? "border-black bg-black"
                    : "border-primary bg-primary"
                  : highContrast
                  ? "border-black bg-white dark:bg-hsl15"
                  : "border-hsl90 dark:border-hsl20 bg-white dark:bg-hsl15"
              }`}
            >
              <Tt
                className={`text-center ${
                  fontSize === "medium" ? "text-white" : highContrast ? "text-black" : "text-hsl30 dark:text-hsl90"
                }`}
              >
                Medium
              </Tt>
            </Pressable>

            <Pressable
              onPress={() => setFontSize("large")}
              className={`flex-1 py-2 rounded border ${
                fontSize === "large"
                  ? highContrast
                    ? "border-black bg-black"
                    : "border-primary bg-primary"
                  : highContrast
                  ? "border-black bg-white dark:bg-hsl15"
                  : "border-hsl90 dark:border-hsl20 bg-white dark:bg-hsl15"
              }`}
            >
              <Tt
                className={`text-center ${
                  fontSize === "large" ? "text-white" : highContrast ? "text-black" : "text-hsl30 dark:text-hsl90"
                }`}
              >
                Large
              </Tt>
            </Pressable>
          </View>
        </View>

        {/* High contrast toggle */}
        <Pressable
          onPress={() => setHighContrast(!highContrast)}
          className={`flex-row justify-between items-center px-4 py-3 active:bg-hs198 dark:bg-hsl10 ${hcRow(
            highContrast
          )} bg-hs198 dark:bg-hsl15`}
        >
          {({ pressed }) => (
            <>
              <View className="flex-row items-center gap-x-4">
                <IconGeneral
                  type="info"
                  fill={pressed ? color.primary : highContrast ? "#000000" : color.iconDefault}
                  size={spacing.xl}
                />
                <View>
                  <Tt className="font-interMedium">High Contrast</Tt>
                  <Tt className="text-sm">Improve readability</Tt>
                </View>
              </View>

              <View
                className={`px-2 rounded ${
                  highContrast ? "bg-white dark:bg-hsl15 border border-black" : "bg-white dark:bg-hsl15 border border-hsl90 dark:border-hsl20"
                }`}
              >
                <Tt>{highContrast ? "On" : "Off"}</Tt>
              </View>
            </>
          )}
        </Pressable>

        {/* Voice summary toggle */}
        <Pressable
          onPress={toggleTts}
          className={`flex-row justify-between items-center px-4 py-3 active:bg-hs198 dark:bg-hsl10 ${hcRow(
            highContrast
          )} ${highContrast ? "bg-white dark:bg-hsl15" : ""}`}
        >
          {({ pressed }) => (
            <>
              <View className="flex-row items-center gap-x-4 flex-1 pr-3" style={{ minWidth: 0 }}>
                <IconGeneral
                  type="speaker"
                  fill={pressed ? color.primary : highContrast ? "#000000" : color.iconDefault}
                  size={spacing.xl}
                />
                <View className="flex-1">
                  <Tt className="font-interMedium">Voice Summary Autoplay</Tt>
                  <Tt className="text-sm">
                    Controls auto-play only. Manual play still available.
                  </Tt>
                </View>
              </View>

              <View
                className={`px-2 rounded ${
                  highContrast ? "bg-white dark:bg-hsl15 border border-black" : "bg-white dark:bg-hsl15 border border-hsl90 dark:border-hsl20"
                }`}
                style={{ flexShrink: 0 }}
              >
                <Tt>{ttsEnabled ? "On" : "Off"}</Tt>
              </View>
            </>
          )}
        </Pressable>

        {/* Support */}
        <View className={`px-4 py-2 ${hcSection(highContrast)}`}>
          <Tt className={`${hcText(highContrast)} font-interMedium`}>Support & Feedback</Tt>
        </View>

        <Pressable
          onPress={() => router.push("/settings/feedback")}
          className={`flex-row items-center justify-between px-4 py-3 active:bg-hsl98 dark:bg-hsl10 ${hcRow(
            highContrast
          )}`}
        >
          {({ pressed }) => (
            <>
              <View className="flex-row items-center gap-x-4">
                <IconGeneral
                  type="report"
                  fill={pressed ? color.primary : highContrast ? "#000000" : color.iconDefault}
                  size={spacing.xl}
                />
                <View>
                  <Tt className="font-interMedium">Report Issue / Feedback</Tt>
                  <Tt className="text-sm">Let us know your thoughts</Tt>
                </View>
              </View>

              <IconGeneral
                type="arrow-forward"
                fill={pressed ? color.primary : "hsl(0, 0%, 50%)"}
                size={spacing.xl}
              />
            </>
          )}
        </Pressable>

        <Pressable
          onPress={() => router.push("/settings/privacy")}
          className={`flex-row items-center justify-between px-4 py-3 active:bg-hsl98 dark:bg-hsl10 ${hcRow(
            highContrast
          )}`}
        >
          {({ pressed }) => (
            <>
              <View className="flex-row items-center gap-x-4">
                <IconGeneral
                  type="doc"
                  fill={pressed ? color.primary : highContrast ? "#000000" : color.iconDefault}
                  size={spacing.xl}
                />
                <View>
                  <Tt className="font-interMedium">Privacy Policy</Tt>
                  <Tt className="text-sm">Privacy & Legal Information</Tt>
                </View>
              </View>

              <IconGeneral
                type="arrow-forward"
                fill={pressed ? color.primary : "hsl(0, 0%, 50%)"}
                size={spacing.xl}
              />
            </>
          )}
        </Pressable>

        <Pressable
          onPress={() => router.push("/settings/terms")}
          className={`flex-row items-center justify-between px-4 py-3 active:bg-hsl98 dark:bg-hsl10 ${hcRow(
            highContrast
          )}`}
        >
          {({ pressed }) => (
            <>
              <View className="flex-row items-center gap-x-4">
                <IconGeneral
                  type="legal"
                  fill={pressed ? color.primary : highContrast ? "#000000" : color.iconDefault}
                  size={spacing.xl}
                />
                <View>
                  <Tt className="font-interMedium">Terms of Service</Tt>
                  <Tt className="text-sm">View Your Agreements</Tt>
                </View>
              </View>

              <IconGeneral
                type="arrow-forward"
                fill={pressed ? color.primary : "hsl(0, 0%, 50%)"}
                size={spacing.xl}
              />
            </>
          )}
        </Pressable>

        <Pressable
          onPress={() => router.push("/settings/about")}
          className={`flex-row items-center justify-between px-4 py-3 active:bg-hsl98 dark:bg-hsl10 ${hcRow(
            highContrast
          )}`}
        >
          {({ pressed }) => (
            <>
              <View className="flex-row items-center gap-x-4">
                <IconGeneral
                  type="info"
                  fill={pressed ? color.primary : highContrast ? "#000000" : color.iconDefault}
                  size={spacing.xl}
                />
                <View>
                  <Tt className="font-interMedium">About</Tt>
                  <Tt className="text-sm">Version {"1.0.0"}</Tt>
                </View>
              </View>

              <IconGeneral
                type="arrow-forward"
                fill={pressed ? color.primary : "hsl(0, 0%, 50%)"}
                size={spacing.xl}
              />
            </>
          )}
        </Pressable>

        {/* Sign out */}
        <Pressable
          onPress={handleSignOut}
          hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
          className={`mt-8 w-[95%] self-center py-3 px-4 my-4 rounded-lg border active:border-primary active:bg-primary ${
            highContrast ? "bg-white dark:bg-hsl15 border-black" : "bg-white dark:bg-hsl15 border-hsl90 dark:border-hsl20"
          }`}
        >
          {({ pressed }) => (
            <Tt
              className={`text-lg text-center font-interSemiBold ${
                pressed ? "text-white" : highContrast ? "text-black" : "text-hsl30 dark:text-hsl90"
              }`}
            >
              Sign Out
            </Tt>
          )}
        </Pressable>
      </ScrollView>
    </Screen>
  );
}
