import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, View, Modal, ActivityIndicator, TextInput } from "react-native";
import { useEffect, useState } from "react";
import Tt from "@/components/ui/UIText";
import IconGeneral from "@/components/icons/IconGeneral";
import { color, spacing } from "@/app/design/token";
import Header from "@/components/layout/Header";
import Screen from "@/components/layout/Screen";
import { useAuth } from "@/components/providers/AuthProvider";
import { useNotification } from "@/components/providers/NotificationProvider";
import { deleteUser, EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { deleteUserAccountData } from "@/services/database/user/deleteUserAccount";
import { useProfile } from "@/components/providers/ProfileProvider";

/**
 * High contrast helpers (className strings)
 */
const hcSection = (on: boolean) =>
  on ? "bg-white border-b border-black" : "bg-hsl90";
const hcRow = (on: boolean) =>
  on ? "bg-white border-b border-black" : "border-b border-hsl85";
const hcText = (on: boolean) => (on ? "text-black" : "text-hsl30");

export default function AccountProfileScreen() {
  const router = useRouter();
  const { pwUpdated } = useLocalSearchParams<{ pwUpdated?: string }>();
  const { handleSignOut, user } = useAuth();
  const { clear } = useProfile();
  const { addNotification } = useNotification();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showReauthDialog, setShowReauthDialog] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [reauthenticating, setReauthenticating] = useState(false);
  const [reauthError, setReauthError] = useState("");
  const [reauthAction, setReauthAction] = useState<"update-password" | "delete-account" | null>(null);
  const [showPwUpdated, setShowPwUpdated] = useState(false);

  useEffect(() => {
    if (pwUpdated) {
      setShowPwUpdated(true);
      const t = setTimeout(() => setShowPwUpdated(false), 2500);
      return () => clearTimeout(t);
    }
  }, [pwUpdated]);
  

  // High contrast mode - would come from PreferencesProvider in a real implementation
  const highContrast = false;

  const handleLogout = async () => {
    try {
      await handleSignOut();
      router.replace("/login");
    } catch (error) {
      console.error("Error logging out:", error);
      addNotification("Failed to log out", "e");
    }
  };

  const handleOpenUpdatePassword = () => {
    setCurrentPassword("");
    setReauthError("");
    setReauthAction("update-password");
    setShowReauthDialog(true);
  };

  const handleReauthAndProceed = async () => {
    if (!user?.email) {
      addNotification("User email not available", "e");
      return;
    }
    if (!currentPassword.trim()) {
      setReauthError("Please enter current password");
      return;
    }

    const providers = user.providerData?.map(p => p.providerId) ?? [];
    if (!providers.includes("password")) {
      setReauthError("Your account doesn't use email/password. Please re-authenticate with your provider.");
      return;
    }

    setReauthenticating(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword.trim());
      await reauthenticateWithCredential(user, credential);
      setReauthError("");
      setShowReauthDialog(false);
      if (reauthAction === "delete-account") {
        await handleDeleteAccount(true);
      } else {
        router.push({ pathname: "/(app)/updatePassword", params: { currentPassword } });
      }
    } catch (error: any) {
      const code = error?.code || "";
      if (code === "auth/invalid-credential" || code === "auth/wrong-password") {
        setReauthError("Current password is incorrect");
      } else {
        setReauthError("Please try again in a moment");
      }
    } finally {
      setReauthenticating(false);
    }
  };

  const handleDeleteAccount = async (skipReauth = false) => {
    if (!user?.uid) {
      addNotification("User not authenticated", "e");
      return;
    }

    if (!skipReauth) {
      setShowDeleteDialog(false);
      setCurrentPassword("");
      setReauthError("");
      setReauthAction("delete-account");
      setShowReauthDialog(true);
      return;
    }

    setDeletingAccount(true);
    try {
      await deleteUserAccountData(user.uid);
      await clear();
      try {
        await deleteUser(user);
      } catch (err: any) {
        if (err?.code === "auth/requires-recent-login") {
          addNotification("Please log in again and retry delete.", "e");
          return;
        }
        throw err;
      }
      addNotification("Account deleted", "s");
      router.replace("/login");
    } catch (error) {
      console.error("Error deleting account:", error);
      addNotification("Failed to delete account", "e");
    } finally {
      setDeletingAccount(false);
      setShowDeleteDialog(false);
    }
  };

  return (    
    <Screen className="p-safe">
      <Header />

      {/* Back button and Title */}
      <View className="flex-row items-center justify-between px-4 my-4">
        <Pressable
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {({ pressed }) => (
            <IconGeneral
              type="arrow-backward-ios"
              fill={pressed ? color.primary : "hsl(0, 0%, 50%)"}
              size={24}
            />
          )}
        </Pressable>

        <Tt className="text-xl font-interBold">Account</Tt>

        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {showPwUpdated ? (
          <View className="mx-4 mb-4 rounded-lg bg-green-100 border border-green-200 px-4 py-3">
            <Tt className="text-green-700 text-center font-interMedium">
              Password updated successfully
            </Tt>
          </View>
        ) : null}
        <View className="w-[100%] mx-auto">
          {/* ACCOUNT SETTINGS */}
          <View className={`px-4 py-2 ${hcSection(highContrast)}`}>
            <Tt className={`${hcText(highContrast)} font-interMedium`}>
              Account Settings
            </Tt>
          </View>

          {/* Update User Settings */}
          <Pressable
            onPress={() => router.push("/(app)/updateUserSettings")}
            className={`flex-row justify-between items-center px-4 py-6 active:bg-hsl98 ${hcRow(
              highContrast,
            )}`}
          >
            {({ pressed }) => (
              <>
                <View className="flex-row items-center gap-2.5">
                  <IconGeneral
                    type="update-user-settings"
                    fill="hsl(0, 0%, 40%)"
                    size={26}
                  />
                  <View>
                    <Tt className="font-interMedium">Update User Settings</Tt>
                    <Tt className="text-sm text-hsl30">Update your details</Tt>
                  </View>
                </View>
                <IconGeneral
                  type="arrow-forward"
                  fill={pressed ? "#FF3F3F" : "hsl(0, 0%, 50%)"}
                  size={24}
                />
              </>
            )}
          </Pressable>

          {/* Update Password */}
          <Pressable
            onPress={handleOpenUpdatePassword}
            className={`flex-row justify-between items-center px-4 py-3 active:bg-hsl98 ${hcRow(
              highContrast,
            )}`}
          >
            {({ pressed }) => (
              <>
                <View className="flex-row items-center gap-3">
                  <IconGeneral
                    type="update-password"
                    fill="hsl(0, 0%, 40%)"
                    size={24}
                  />
                  <View>
                    <Tt className="font-interMedium">Update Password</Tt>
                    <Tt className="text-sm text-hsl30">
                      Keep your account secure
                    </Tt>
                  </View>
                </View>
                <IconGeneral
                  type="arrow-forward"
                  fill={pressed ? "#FF3F3F" : "hsl(0, 0%, 50%)"}
                  size={24}
                />
              </>
            )}
          </Pressable>

          {/* Delete Account */}
          <Pressable
            onPress={() => setShowDeleteDialog(true)}
            className={`flex-row justify-between items-center px-4 py-6 active:bg-hsl98 ${hcRow(
              highContrast,
            )}`}
          >
            {({ pressed }) => (
              <>
                <View className="flex-row items-center gap-2.5">
                  <IconGeneral type="delete" fill="hsl(0, 0%, 40%)" size={26} />
                  <View>
                    <Tt className="font-interMedium">Delete Account</Tt>
                    <Tt className="text-sm text-hsl30">
                      Remove your account and data
                    </Tt>
                  </View>
                </View>
                <IconGeneral
                  type="arrow-forward"
                  fill={pressed ? "#FF3F3F" : "hsl(0, 0%, 50%)"}
                  size={24}
                />
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>

      {/* Sign Out Button at Bottom */}
      <View className="px-4 py-4 border-t border-hsl90">
        <Pressable
          onPress={handleLogout}
          disabled={deletingAccount}
          className="py-3 px-4 rounded-lg border-2 border-red-500 bg-red-50 active:bg-red-100"
        >
          {({ pressed }) => (
            <Tt className="text-center font-interSemiBold text-red-500">
              Sign Out
            </Tt>
          )}
        </Pressable>
      </View>

      {/* Delete Account Alert Dialog */}
      <Modal
        visible={showDeleteDialog}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteDialog(false)}
      >
        <View className="flex-1 bg-black/40 flex items-center justify-center">
          {/* Modal Container: Updated to a light gray background with softer rounding */}
          <View className="bg-gray-300 rounded-3xl p-6 w-[85%] max-w-sm items-center">
            {/* Warning Icon: Changed fill to black as per image */}
            <View className="mb-4">
              <IconGeneral type="warning" fill="#000000" size={spacing.xxl} />
            </View>

            {/* Title: Adjusted font size and margin */}
            <Tt className="text-center text-xl font-interBold mb-8 text-black">
              Delete Account?
            </Tt>

            {/* Buttons Container */}
            <View className="flex-row gap-4 w-full mt-4">
              {/* No Button: Dark charcoal color with rounded-xl */}
              <Pressable
                onPress={() => setShowDeleteDialog(false)}
                className="flex-1 py-4 px-6 rounded-xl bg-[#333333] active:opacity-90"
                disabled={deletingAccount}
              >
                <Tt className="text-center font-interBold text-white text-lg">
                  No
                </Tt>
              </Pressable>

              {/* Yes Button: Red-orange shade with rounded-xl */}
              <Pressable
                onPress={() => handleDeleteAccount(false)}
                disabled={deletingAccount}
                className="flex-1 py-4 px-6 rounded-xl bg-[#C63328] active:opacity-90"
              >
                {() => (
                  <View className="flex-row items-center justify-center gap-2">
                    {deletingAccount ? <ActivityIndicator size="small" color="#fff" /> : null}
                    <Tt className="text-center font-interBold text-white text-lg">
                      {deletingAccount ? "Deleting..." : "Yes"}
                    </Tt>
                  </View>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Re-authenticate before Update Password */}
      <Modal
        visible={showReauthDialog}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReauthDialog(false)}
      >
        <View className="flex-1 bg-black/50 flex items-center justify-center">
          <View className="bg-white rounded-2xl p-6 w-[85%] max-w-sm">
            {reauthError ? (
              <View className="absolute -top-10 left-0 right-0 items-center z-50">
                <View className="bg-red-500 px-4 py-2 rounded-full shadow">
                  <Tt className="text-white text-sm">{reauthError}</Tt>
                </View>
              </View>
            ) : null}
            <Tt className="text-center text-lg font-interBold mb-4">
              Confirm Password
            </Tt>
            <Tt className="text-center text-sm text-hsl40 mb-4">
              Please enter your current password to continue.
            </Tt>

            <View className="border border-hsl90 rounded-lg px-3 bg-white mb-4">
              <TextInput
                placeholder="Current Password"
                placeholderTextColor="hsl(0, 0%, 70%)"
                secureTextEntry
                value={currentPassword}
                onChangeText={setCurrentPassword}
                className="py-3 text-base"
              />
            </View>

            <View className="flex-row gap-3">
              <Pressable
                onPress={() => setShowReauthDialog(false)}
                disabled={reauthenticating}
                className="flex-1 py-2 px-4 rounded-lg bg-gray-700 active:bg-gray-800"
              >
                {({ pressed }) => (
                  <Tt className="text-center font-interMedium text-white">
                    Cancel
                  </Tt>
                )}
              </Pressable>

              <Pressable
                onPress={handleReauthAndProceed}
                disabled={reauthenticating}
                className="flex-1 py-2 px-4 rounded-lg bg-primary active:bg-opacity-90"
              >
                {({ pressed }) => (
                  <View className="flex-row items-center justify-center gap-2">
                    {reauthenticating ? <ActivityIndicator size="small" color="#fff" /> : null}
                    <Tt className="text-center font-interMedium text-white">
                      {reauthenticating ? "Verifying..." : "Continue"}
                    </Tt>
                  </View>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
