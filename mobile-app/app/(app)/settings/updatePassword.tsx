// Update Password Page

import { useState } from "react";
import {
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import Tt from "@/components/ui/UIText";
import Header from "@/components/layout/Header";
import { useNotification } from "@/components/providers/NotificationProvider";
import IconGeneral from "@/components/icons/IconGeneral";
import { color } from "@/app/design/token";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const { addNotification } = useNotification();

  const [newPassword, setNewPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [showNewPassword, setShowNewPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");

  // Track if fields have errors for styling
  const [newPasswordError, setNewPasswordError] = useState<boolean>(false);
  const [confirmPasswordError, setConfirmPasswordError] = useState<boolean>(false);

  /**
   * Validate password inputs
   * @returns boolean - true if valid, false otherwise
   */
  const validatePasswords = (): boolean => {
    setErrorMessage("");
    setSuccessMessage("");
    setNewPasswordError(false);
    setConfirmPasswordError(false);

    // Check if passwords are empty
    if (!newPassword.trim()) {
      setErrorMessage("Please enter a new password");
      setNewPasswordError(true);
      return false;
    }

    // Check minimum length (Firebase requires at least 6 characters)
    if (newPassword.length < 6) {
      setErrorMessage("Password must be at least 6 characters");
      setNewPasswordError(true);
      return false;
    }

    // Check if passwords match
    if (newPassword !== confirmPassword) {
      setErrorMessage("Passwords do not match. Try again");
      setNewPasswordError(true);
      setConfirmPasswordError(true);
      return false;
    }

    return true;
  };

  /**
   * Handle Reset Password
   */
  const handleResetPassword = async () => {
    if (!validatePasswords()) {
      return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
      // TODO: Implement actual password update with Firebase
      // For a full implementation, you would need to prompt for current password
      // and call: await updatePassword(currentPassword, newPassword);

      // Simulate API call delay
      await new Promise((resolve) => setTimeout(resolve, 500));

      setSuccessMessage("Password updated successfully");
      addNotification("Password updated successfully", "s");

      // Clear form
      setNewPassword("");
      setConfirmPassword("");

      // Navigate back after delay
      setTimeout(() => {
        router.back();
      }, 1500);
    } catch (error: any) {
      console.error("Error updating password:", error);
      setErrorMessage(error.message || "Failed to update password");
      addNotification("Failed to update password", "e");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Clear error state when user starts typing
   */
  const handleNewPasswordChange = (text: string) => {
    setNewPassword(text);
    setNewPasswordError(false);
    setErrorMessage("");
    setSuccessMessage("");
  };

  const handleConfirmPasswordChange = (text: string) => {
    setConfirmPassword(text);
    setConfirmPasswordError(false);
    setErrorMessage("");
    setSuccessMessage("");
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-white"
    >
      <View className="flex-1 p-safe">
        <Header />

        <View className="w-[95%] mx-auto">
          {/* Header with back button */}
          <View className="flex-row items-center justify-between mb-6">
            <Pressable
              onPress={() => router.back()}
              className="flex-row justify-center items-center px-2 py-1"
            >
              {({ pressed }) => (
                <IconGeneral
                  type="arrow-backward-ios"
                  fill={pressed ? color.primary : color.iconDefault}
                />
              )}
            </Pressable>
            <Tt className="font-interBold text-xl">Update Password</Tt>
            {/* Invisible placeholder to center title */}
            <IconGeneral type="arrow-backward-ios" fill="transparent" />
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1 }}
        >
          <View className="w-[90%] mx-auto mt-4">
            {/* New Password Input */}
            <Tt className="font-interSemiBold text-base mb-2">New Password</Tt>
            <View
              className={`flex-row items-center bg-white border rounded-lg px-4 mb-6 ${
                newPasswordError ? "border-primary" : "border-gray-300"
              }`}
            >
              <TextInput
                value={newPassword}
                onChangeText={handleNewPasswordChange}
                placeholder="Enter new password"
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!showNewPassword}
                autoCapitalize="none"
                autoCorrect={false}
                className="flex-1 py-4 text-base text-black"
                cursorColor={color.primary}
              />
              <Pressable
                onPress={() => setShowNewPassword(!showNewPassword)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <IconGeneral
                  type={showNewPassword ? "visibility" : "visibility-off"}
                  fill="hsl(0 0% 70%)"
                />
              </Pressable>
            </View>

            {/* Confirm Password Input */}
            <Tt className="font-interSemiBold text-base mb-2">Confirm Password</Tt>
            <View
              className={`flex-row items-center bg-white border rounded-lg px-4 mb-6 ${
                confirmPasswordError ? "border-primary" : "border-gray-300"
              }`}
            >
              <TextInput
                value={confirmPassword}
                onChangeText={handleConfirmPasswordChange}
                placeholder="Re-Enter new password"
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                autoCorrect={false}
                className="flex-1 py-4 text-base text-black"
                cursorColor={color.primary}
              />
              <Pressable
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <IconGeneral
                  type={showConfirmPassword ? "visibility" : "visibility-off"}
                  fill="hsl(0 0% 70%)"
                />
              </Pressable>
            </View>
          </View>
        </ScrollView>

        {/* Bottom Section: Button and Messages */}
        <View className="w-[90%] mx-auto pb-6">
          {/* Reset Password Button */}
          <Pressable
            onPress={handleResetPassword}
            disabled={loading}
            className={`py-4 px-4 rounded-lg border ${
              loading
                ? "bg-gray-300 border-gray-300"
                : "bg-primary border-primary active:bg-transparent"
            }`}
          >
            {({ pressed }) =>
              loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Tt
                  className={`text-lg text-center font-interSemiBold ${
                    pressed ? "text-primary" : "text-white"
                  }`}
                >
                  Reset Password
                </Tt>
              )
            }
          </Pressable>

          {/* Success Message */}
          {successMessage && (
            <View className="mt-4">
              <Tt className="text-center text-success font-interMedium">
                {successMessage}
              </Tt>
            </View>
          )}

          {/* Error Message */}
          {errorMessage && (
            <View className="mt-4 border border-primary rounded-lg px-4 py-2">
              <Tt className="text-center text-primary font-interMedium">
                {errorMessage}
              </Tt>
            </View>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
