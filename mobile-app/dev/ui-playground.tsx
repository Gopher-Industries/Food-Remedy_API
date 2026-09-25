// mobile-app/app/(demo)/ui-playground.tsx

import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Button, Card, AppModal, Tag } from "@/components/shared"; // adjust path if needed
import Screen from "@/components/layout/Screen";
import { useTheme } from "@/theme";

export default function UiPlaygroundScreen() {
  const [modalVisible, setModalVisible] = useState(false);
  const theme = useTheme();

  return (
    <Screen className="px-4 pt-4">
      <ScrollView>
        <Text className="text-2xl font-bold mt-8" style={{ color: theme.colors.text }}>
          Shared UI Components
        </Text>

      {/* Buttons */}
      <Card padding="md">
        <Text className="text-lg font-semibold mb-2" style={{ color: theme.colors.text }}>
          Buttons
        </Text>

        <View className="gap-3">
          <Button title="Primary Button" onPress={() => {}} />

          <Button
            title="Secondary Button"
            variant="secondary"
            onPress={() => {}}
          />

          <Button
            title="Outline Button"
            variant="outline"
            onPress={() => {}}
          />

          <Button
            title="Loading Button"
            loading
            onPress={() => {}}
          />
        </View>
      </Card>

      {/* Tags */}
      <Card padding="md">
        <Text className="text-lg font-semibold mb-2" style={{ color: theme.colors.text }}>
          Tags
        </Text>
        <View className="flex-row flex-wrap gap-2">
          <Tag label="Gluten-free" variant="success" />
          <Tag label="Contains Nuts" variant="danger" />
          <Tag label="High Sugar" variant="warning" />
          <Tag label="Vegan" variant="neutral" />
        </View>
      </Card>

      {/* Modal */}
      <Card padding="md">
        <Text className="text-lg font-semibold mb-2" style={{ color: theme.colors.text }}>
          Modal
        </Text>
        <Button
          title="Open Modal"
          onPress={() => setModalVisible(true)}
        />
      </Card>

      <AppModal
        visible={modalVisible}
        title="Example Modal"
        onClose={() => setModalVisible(false)}
      >
        <Text className="text-base mb-2" style={{ color: theme.colors.text }}>
          This is a shared modal component. You can reuse it for
          confirmations, forms, and alerts.
        </Text>
      </AppModal>
      </ScrollView>
    </Screen>
  );
}
