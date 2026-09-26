import { Button } from "@/components/shared/Button";
import { useTheme } from "@/theme";
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type LoginRequiredPromptProps = {
  visible: boolean;
  onLogin: () => void;
  onCreateAccount: () => void;
  onCancel: () => void;
};

export default function LoginRequiredPrompt({
  visible,
  onLogin,
  onCreateAccount,
  onCancel,
}: LoginRequiredPromptProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const maxCardHeight = Math.max(0, height - insets.top - insets.bottom - 32);

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onCancel}
      accessibilityViewIsModal
    >
      <View
        className="flex-1 items-center justify-center bg-black/40 px-4"
        style={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }}
      >
        <Pressable
          accessible={false}
          className="absolute inset-0"
          onPress={onCancel}
        />
        <View
          className="w-full max-w-md rounded-lg border overflow-hidden"
          style={{
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            maxHeight: maxCardHeight,
          }}
        >
          <ScrollView
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ padding: 20 }}
            keyboardShouldPersistTaps="handled"
          >
            <Text
              accessibilityRole="header"
              className="mb-2 text-lg font-interSemiBold"
              style={{ color: theme.colors.text }}
            >
              Create an account to continue
            </Text>
            <Text className="mb-5 text-sm" style={{ color: theme.colors.textMuted }}>
              This feature is available only for registered users.
            </Text>
            <View className="gap-3">
              <Button title="Login" onPress={onLogin} />
              <Button title="Create Account" onPress={onCreateAccount} variant="outline" />
              <Button title="Not Now" onPress={onCancel} variant="secondary" />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
