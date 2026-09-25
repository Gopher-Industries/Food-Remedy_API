import { Button } from "@/components/shared/Button";
import { useTheme } from "@/theme";
import { Modal, Pressable, Text, View } from "react-native";

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

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onCancel}
      accessibilityViewIsModal
    >
      <Pressable
        accessibilityRole="button"
        className="flex-1 items-center justify-center bg-black/40 px-4"
        onPress={onCancel}
      >
        <View
          accessibilityRole="alert"
          accessibilityLabel="Create an account to continue. This feature is available only for registered users."
          className="w-full max-w-md rounded-lg border p-5"
          style={{
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          }}
          onStartShouldSetResponder={() => true}
        >
          <Text
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
        </View>
      </Pressable>
    </Modal>
  );
}
