// Notification Settings

import { Pressable, View, Switch } from "react-native";
import { useState } from "react";
import { router } from "expo-router";
import Header from "@/components/layout/Header";
import Screen from "@/components/layout/Screen";
import IconGeneral from "@/components/icons/IconGeneral";
import Tt from "@/components/ui/UIText";
import { color } from "@/app/design/token";

export default function NotificationSettingsPage() {
  const [mealReminder, setMealReminder] = useState(true);
  const [healthTips, setHealthTips] = useState(true);
  const [communityMessages, setCommunityMessages] = useState(false);

  return (
    <Screen className="p-safe">
      <Header />

      <View className="w-[95%] mx-auto">
        <View className="flex-row items-center justify-between mb-4">
          <Pressable
            onPress={() => router.back()}
            className="flex-row justify-center items-center self-end px-2 py-1"
          >
            {({ pressed }) => (
              <IconGeneral
                type="arrow-backward-ios"
                fill={pressed ? color.primary : color.primary}
              />
            )}
          </Pressable>
          <Tt className="font-interBold text-xl">Notification Settings</Tt>
          <View style={{ width: 24, height: 24 }} />
        </View>

        {/* Notification Preferences Card */}
        <View className="mt-8 bg-white rounded-lg border border-hsl90 p-4 shadow-md" style={{ elevation: 3, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 }}>
          
          {/* Meal Reminder */}
          <View className="flex-row items-center justify-between mb-4 border-hsl90">
            <Tt className="font-interBold">Meal Reminder</Tt>
            <Switch
              value={mealReminder}
              onValueChange={setMealReminder}
              trackColor={{ false: "hsl(0, 0%, 80%)", true: color.primary }}
              thumbColor={mealReminder ? "white" : "hsl(0, 0%, 60%)"}
            />
          </View>

          {/* Health Tips & Recipes */}
          <View className="flex-row items-center justify-between mb-4 border-hsl90">
            <Tt className="font-interBold">Health Tips & Recipes</Tt>
            <Switch
              value={healthTips}
              onValueChange={setHealthTips}
              trackColor={{ false: "hsl(0, 0%, 80%)", true: color.primary }}
              thumbColor={healthTips ? "white" : "hsl(0, 0%, 60%)"}
            />
          </View>

          {/* Community Messages */}
          <View className="flex-row items-center justify-between">
            <Tt className="font-interBold">Community Messages</Tt>
            <Switch
              value={communityMessages}
              onValueChange={setCommunityMessages}
              trackColor={{ false: "hsl(0, 0%, 80%)", true: color.primary }}
              thumbColor={communityMessages ? "white" : "hsl(0, 0%, 60%)"}
            />
          </View>
        </View>
      </View>
    </Screen>
  );
}
