// Notification Settings

import { View, Switch } from "react-native";
import { useState } from "react";

import Header from "@/components/layout/Header";
import Screen from "@/components/layout/Screen";
import Tt from "@/components/ui/UIText";
import { color } from "@/app/design/token";
import { BackButton } from "@/components/shared";
import { usePreferences } from "@/components/providers/PreferencesProvider";

export default function NotificationSettingsPage() {
  const [mealReminder, setMealReminder] = useState(true);
  const [healthTips, setHealthTips] = useState(true);
  const [communityMessages, setCommunityMessages] = useState(false);

  // DARK MODE STATE
  const { darkMode } = usePreferences();

  return (
    <Screen
      className={`p-safe ${
        darkMode ? "bg-hsl15" : "bg-white"
      }`}
    >
      <Header />

      <View className="w-[95%] mx-auto">
        {/* Header */}
        <View className="flex-row items-center justify-between mb-4">
          <BackButton />

          <Tt
            className={`font-interBold text-xl ${
              darkMode ? "text-white" : "text-black"
            }`}
          >
            Notification Settings
          </Tt>

          <View style={{ width: 24, height: 24 }} />
        </View>

        {/* Notification Card */}
        <View
          className={`mt-8 rounded-lg border p-4 shadow-md ${
            darkMode
              ? "bg-hsl20 border-hsl30"
              : "bg-white border-hsl90"
          }`}
          style={{
            elevation: 3,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 4,
          }}
        >
          {/* Meal Reminder */}
          <View className="flex-row items-center justify-between mb-4">
            <Tt
              className={`font-interBold ${
                darkMode ? "text-white" : "text-black"
              }`}
            >
              Meal Reminder
            </Tt>

            <Switch
              value={mealReminder}
              onValueChange={setMealReminder}
              trackColor={{
                false: darkMode
                  ? "hsl(0, 0%, 30%)"
                  : "hsl(0, 0%, 80%)",
                true: color.primary,
              }}
              thumbColor={mealReminder ? "#fff" : "#d1d5db"}
            />
          </View>

          {/* Health Tips */}
          <View className="flex-row items-center justify-between mb-4">
            <Tt
              className={`font-interBold ${
                darkMode ? "text-white" : "text-black"
              }`}
            >
              Health Tips & Recipes
            </Tt>

            <Switch
              value={healthTips}
              onValueChange={setHealthTips}
              trackColor={{
                false: darkMode
                  ? "hsl(0, 0%, 30%)"
                  : "hsl(0, 0%, 80%)",
                true: color.primary,
              }}
              thumbColor={healthTips ? "#fff" : "#d1d5db"}
            />
          </View>

          {/* Community Messages */}
          <View className="flex-row items-center justify-between">
            <Tt
              className={`font-interBold ${
                darkMode ? "text-white" : "text-black"
              }`}
            >
              Community Messages
            </Tt>

            <Switch
              value={communityMessages}
              onValueChange={setCommunityMessages}
              trackColor={{
                false: darkMode
                  ? "hsl(0, 0%, 30%)"
                  : "hsl(0, 0%, 80%)",
                true: color.primary,
              }}
              thumbColor={communityMessages ? "#fff" : "#d1d5db"}
            />
          </View>
        </View>
      </View>
    </Screen>
  );
}