import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, View, TextInput } from "react-native";
import { useState } from "react";
import Tt from "@/components/ui/UIText";
import IconGeneral from "@/components/icons/IconGeneral";
import { color, spacing } from "@/app/design/token";
import Header from "@/components/layout/Header";
import { updatePassword } from "firebase/auth";
import { useAuth } from "@/components/providers/AuthProvider";

export default function UpdatePasswordScreen() {
  const router = useRouter();
  const { currentPassword: currentPasswordParam } = useLocalSearchParams<{ currentPassword?: string }>();
  const currentPassword = typeof currentPasswordParam === "string" ? currentPasswordParam : "";
  const { user } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const handleResetPassword = async () => {
    setSuccessMessage("");
    setErrorMessage("");
    
    if (!newPassword || !confirmPassword) {
      setErrorMessage("Please fill out both password fields.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("Confirm password does not match.");
      return;
    }
    if (currentPassword && newPassword === currentPassword) {
      setErrorMessage("New password must be different from current password.");
      return;
    }

    if (!user) {
      setErrorMessage("User not authenticated.");
      return;
    }

    setSaving(true);
    try {
      await updatePassword(user, newPassword);
      setSuccessMessage("Password updated successfully");
      setNewPassword("");
      setConfirmPassword("");
      router.replace({ pathname: "/(app)/accountProfile", params: { pwUpdated: "1" } });
    } catch (error: any) {
      const code = error?.code || "";
      if (code === "auth/requires-recent-login") {
        setErrorMessage("Please re-authenticate and try again.");
      } else if (code === "auth/weak-password") {
        setErrorMessage("Password is too weak.");
      } else {
        setErrorMessage("Failed to update password.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="flex-1 bg-white p-safe">
        <Header />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        {/* Back button on left + Title in center */}
        <View className="flex-row items-center justify-between px-4 mb-6 mt-4">
          <Pressable
            onPress={() => router.back()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {({ pressed }) => (
              <IconGeneral
                type="arrow-backward-ios"
                fill={pressed ? color.primary : "hsl(0, 0%, 50%)"}
                size={spacing.lg}
              />
            )}
          </Pressable>

          <Tt className="text-2xl font-interBold">Update Password</Tt>

          <View style={{ width: spacing.xxl }} />
        </View>

        {/* Form Container */}
        <View className="px-4 flex-1">
          {/* New Password Field */}
          <View className="mt-20 mb-8">
            <Tt className="text-xl font-interBold text-hsl30 mb-2">New Password</Tt>
            <View className="flex-row items-center border border-hsl90 rounded-lg px-3 bg-white">
              <TextInput
                placeholder="Enter new Password"
                placeholderTextColor="hsl(0, 0%, 70%)"
                secureTextEntry={!showNewPassword}
                value={newPassword}
                onChangeText={setNewPassword}
                className="flex-1 py-3 text-base"
              />
              <Pressable
                onPress={() => setShowNewPassword(!showNewPassword)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {({ pressed }) => (
                  <IconGeneral
                    type={showNewPassword ? "visibility" : "visibility-off"}
                    fill={pressed ? color.primary : color.iconDefault}
                    size={spacing.lg}
                  />
                )}
              </Pressable>
            </View>
          </View>

          {/* Confirm Password Field */}
          <View className="mb-6">
            <Tt className="text-xl font-interBold text-hsl30 mb-2">Confirm Password</Tt>
            <View className="flex-row items-center border border-hsl90 rounded-lg px-3 bg-white">
              <TextInput
                placeholder="Confirm Password"
                placeholderTextColor="hsl(0, 0%, 70%)"
                secureTextEntry={!showConfirmPassword}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                className="flex-1 py-3 text-base"
              />
              <Pressable
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {({ pressed }) => (
                  <IconGeneral
                    type={showConfirmPassword ? "visibility" : "visibility-off"}
                    fill={pressed ? color.primary : color.iconDefault}
                    size={spacing.lg}
                  />
                )}
              </Pressable>
            </View>
          </View>

          {/* Reset Password Button */}
          <View className="mt-6 mb-6">
            <Pressable
              onPress={handleResetPassword}
              disabled={saving}
              className="py-3 px-4 rounded-lg bg-red-500 active:bg-red-600 disabled:opacity-60"
            >
              {({ pressed }) => (
                <Tt className="text-xl text-center font-interBold text-white text-base">
                  {saving ? "Updating..." : "Reset Password"}
                </Tt>
              )}
            </Pressable>
          </View>

          {/* Success Message */}
          {successMessage && (
            <Tt className="text-xl text-center font-interMedium text-red-500">
              {successMessage}
            </Tt>
          )}
          {errorMessage && (
            <Tt className="text-xl text-center font-interMedium text-red-500 mt-2">
              {errorMessage}
            </Tt>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
