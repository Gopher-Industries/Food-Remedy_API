// app/(tabs)/_layout.tsx  (TabLayout)

import { Tabs } from "expo-router";
import IconNavigation from "@/components/icons/IconNavigation";
import { PlatformPressable } from "@react-navigation/elements";
import { color, spacing } from "@/app/design/token";
import { useTheme } from "@/theme";

export default function TabLayout() {
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 10,
        },
        tabBarStyle: {
          borderTopWidth: 0,
          backgroundColor: theme.colors.surface,
        },
        // Disable OnPress Ripple Effect (Android) by Passing Specific Pressable
        tabBarButton: (props) => (
          <PlatformPressable
            {...props}
            android_ripple={{ color: "transparent" }}
            pressOpacity={1}
          />
        ),
      }}
    >
      <Tabs.Screen
        name="scan"
        options={{
          title: "Scan",
          tabBarIcon: ({ color }) => (
            <IconNavigation type="scan" size={spacing.xl} fill={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="index"
        options={{
          title: "History",
          tabBarIcon: ({ color }) => (
            <IconNavigation type="history" size={spacing.xl} fill={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="cart"
        options={{
          title: "Shopping",
          tabBarIcon: ({ color }) => (
            <IconNavigation type="cart" size={spacing.xl} fill={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="profiles"
        options={{
          title: "Profiles",
          tabBarIcon: ({ color }) => (
            <IconNavigation type="profile" size={spacing.xl} fill={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color }) => (
            <IconNavigation type="settings" size={spacing.xl} fill={color} />
          ),
        }}
      />
    </Tabs>
  );
}
