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
        // FE031: 10pt was below the readable minimum and the label did not
        // follow the OS text-size setting.
        tabBarLabelStyle: {
          fontSize: 11,
        },
        tabBarAllowFontScaling: true,
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
          tabBarAccessibilityLabel: "Scan, barcode scanner",
          tabBarIcon: ({ color }) => (
            <IconNavigation type="scan" size={spacing.xl} fill={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="index"
        options={{
          title: "History",
          tabBarAccessibilityLabel: "History, previously scanned products",
          tabBarIcon: ({ color }) => (
            <IconNavigation type="history" size={spacing.xl} fill={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="cart"
        options={{
          title: "Shopping",
          tabBarAccessibilityLabel: "Shopping, your shopping lists",
          tabBarIcon: ({ color }) => (
            <IconNavigation type="cart" size={spacing.xl} fill={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="profiles"
        options={{
          title: "Profiles",
          tabBarAccessibilityLabel: "Profiles, nutritional profiles",
          tabBarIcon: ({ color }) => (
            <IconNavigation type="profile" size={spacing.xl} fill={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarAccessibilityLabel: "Settings",
          tabBarIcon: ({ color }) => (
            <IconNavigation type="settings" size={spacing.xl} fill={color} />
          ),
        }}
      />
    </Tabs>
  );
}
