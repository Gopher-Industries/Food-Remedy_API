import React from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { Button } from "./Button";
import { useTheme } from "@/theme";

interface AppModalProps {
  visible: boolean;
  title?: string;
  children: React.ReactNode;
  onClose: () => void;
}

export const AppModal: React.FC<AppModalProps> = ({
  visible,
  title,
  children,
  onClose,
}) => {
  const theme = useTheme();
  return (
    <Modal transparent visible={visible} animationType="fade">
      <Pressable
        className="flex-1 bg-black/40 justify-center items-center px-4"
        onPress={onClose}
      >
        <View
          className="w-full max-w-md rounded-2xl p-5"
          style={{
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderWidth: 1,
          }}
          onStartShouldSetResponder={() => true}
        >
          {title && (
            <Text className="text-lg font-semibold mb-3" style={{ color: theme.colors.text }}>
              {title}
            </Text>
          )}

          {children}

          <View className="mt-4">
            <Button title="Close" onPress={onClose} variant="secondary" />
          </View>
        </View>
      </Pressable>
    </Modal>
  );
};
