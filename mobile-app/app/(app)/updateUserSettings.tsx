import { useRouter, useFocusEffect } from "expo-router";
import { Pressable, ScrollView, View, Image } from "react-native";
import { useState, useEffect, useCallback } from "react";
import Tt from "@/components/ui/UIText";
import Input from "@/components/ui/UIInput";
import IconGeneral from "@/components/icons/IconGeneral";
import { color, spacing } from "@/app/design/token";
import { useAuth } from "@/components/providers/AuthProvider";
import { useNotification } from "@/components/providers/NotificationProvider";
import { useProfile } from "@/components/providers/ProfileProvider";
import getUserProfileName from "@/services/database/user/getUserProfileName";
import updateUserValue from "@/services/database/user/updateUserValue";
import { listUserProfiles } from "@/services/database/user/profiles";
import getUserValue from "@/services/database/user/getUserValue";
import { getProfileAvatarDownloadUrl } from "@/services/storage/uploadProfileAvatar";
import ProfilePhotoEditModal from "../../components/modals/profilePhotoEditModal";

export default function UpdateUserSettingsScreen() {
  const router = useRouter();
  const { user, handleSignOut } = useAuth();
  const { addNotification } = useNotification();
  const { clearAvatarCache, refreshSelfDisplayName, refresh: refreshProfiles } = useProfile();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [dietaryPreference, setDietaryPreference] = useState("");
  const accountStatus = "Active";
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [selfProfileId, setSelfProfileId] = useState<string | null>(null);
  
  // Linked accounts state
  const [linkedAccounts, setLinkedAccounts] = useState({
    facebook: "",
    instagram: "",
    x: ""
  });
  const [originalData, setOriginalData] = useState({
    name: "",
    dietaryPreference: "",
    linkedAccounts: { facebook: "", instagram: "", x: "" }
  });

  // Fetch user data from Firebase
  useEffect(() => {
    const fetchUserData = async () => {
      if (user?.uid) {
        // Fetch email from Firebase Auth
        if (user.email) {
          setEmail(user.email);
        }
        
        // Fetch name from Firestore
        const profileName = await getUserProfileName(user.uid);
        if (profileName) {
          const fullName = `${profileName.firstName || ''} ${profileName.lastName || ''}`.trim() || profileName.userName || '';
          setName(fullName);
          setOriginalData(prev => ({ ...prev, name: fullName }));
        }

        // Fetch dietary preferences from user's Self profile
        try {
          const profiles = await listUserProfiles(user.uid);
          const selfProfile = profiles.find(p => p.relationship === 'Self');
          if (selfProfile && selfProfile.dietaryForm && selfProfile.dietaryForm.length > 0) {
            const dietary = selfProfile.dietaryForm.join(', ');
            setDietaryPreference(dietary);
            setOriginalData(prev => ({ ...prev, dietaryPreference: dietary }));
          }
          if (selfProfile?.profileId) {
            setSelfProfileId(selfProfile.profileId);
          }
        } catch (error) {
          console.error('Error fetching dietary preferences:', error);
        }

        // Fetch linked accounts from Firestore
        try {
          const accounts = await getUserValue(user.uid, 'linkedAccounts');
          if (accounts) {
            setLinkedAccounts(accounts);
            setOriginalData(prev => ({ ...prev, linkedAccounts: accounts }));
          }
        } catch {
          // Silently handle error - user document or linkedAccounts field may not exist yet
          // This is normal for new users, just use default empty values
        }

      }
    };
    
    fetchUserData();
  }, [user, selfProfileId]);

  const refreshAvatar = useCallback(async () => {
    if (!user?.uid || !selfProfileId) return;
    try {
      const url = await getProfileAvatarDownloadUrl(user.uid, selfProfileId);
      // Add timestamp to bust image cache
      setProfilePhotoUrl(url ? `${url}&t=${Date.now()}` : null);
    } catch {
      setProfilePhotoUrl(null);
    }
  }, [user?.uid, selfProfileId]);

  useEffect(() => {
    refreshAvatar();
  }, [refreshAvatar]);

  useFocusEffect(
    useCallback(() => {
      refreshAvatar();
    }, [refreshAvatar])
  );

  const handleEditToggle = () => {
    setIsEditing(!isEditing);
  };

  const handleSave = async () => {
    if (!user?.uid) {
      addNotification("User not authenticated", "e");
      return;
    }

    try {
      // Split name by first space - first word is firstName, rest is lastName
      const nameParts = name.trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      // Save firstName and lastName to Firebase
      await updateUserValue(user.uid, 'firstName', firstName);
      await updateUserValue(user.uid, 'lastName', lastName);

      // Save linked accounts to Firebase
      await updateUserValue(user.uid, 'linkedAccounts', linkedAccounts);

      // Update original data
      setOriginalData({
        name,
        dietaryPreference,
        linkedAccounts: { ...linkedAccounts }
      });

      // Refresh the selfDisplayName in ProfileProvider so it updates immediately
      await refreshSelfDisplayName();

      addNotification("Profile updated successfully", "s");
      setIsEditing(false);
    } catch (error) {
      console.error("Error saving profile:", error);
      addNotification("Failed to update profile", "e");
    }
  };

  const handleCancel = () => {
    // Reset to original values
    setName(originalData.name);
    setDietaryPreference(originalData.dietaryPreference);
    setLinkedAccounts({ ...originalData.linkedAccounts });
    setIsEditing(false);
  };

  const handleSync = () => {
    addNotification("Syncing linked accounts...", "s");
    // Sync functionality would go here
  };

  const handleLogout = async () => {
    try {
      await handleSignOut();
      router.replace("/login");
    } catch (error) {
      console.error("Error logging out:", error);
      addNotification("Failed to log out", "e");
    }
  };

  return (
    <View className="flex-1 bg-white p-safe">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        {/* Back button on top left */}
        <View className="flex-row items-center px-4 mb-8 mt-4">
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
        </View>

        {/* Profile Avatar with Edit Icon */}
        <View className="items-center mb-6">
          <Pressable
            onPress={() => setShowPhotoModal(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <View className="relative">
              {/* Avatar Circle */}
              <View className="w-28 h-28 rounded-full bg-hsl98 flex items-center justify-center overflow-hidden">
                {profilePhotoUrl ? (
                  <Image source={{ uri: profilePhotoUrl }} className="w-full h-full" resizeMode="cover" />
                ) : (
                  <IconGeneral type="account" fill="hsl(0, 0%, 60%)" size={96} />
                )}
              </View>

              {/* Edit Icon on Bottom Right */}
              <View className="absolute bottom-0 right-0 p-1 bg-white rounded-full">
                <IconGeneral type="edit" fill="hsl(0, 0%, 60%)" size={24} />
              </View>
            </View>
          </Pressable>
        </View>

        {/* User Name */}
        <View className="items-center mb-2">
          <Tt className="text-3xl font-interBold">{name || "Enter your name"}</Tt>
        </View>

        {/* Label */}
        <View className="items-center px-4 mb-8">
          <Tt className="text-center font-interMedium text-hsl30">
            View, edit and manage your details
          </Tt>
        </View>

        {/* Preferences Button */}
        <View className="mb-8 items-center">
          <Pressable
            onPress={() => router.push("/(app)/(tabs)/settings")}
            className="p-3 rounded-2xl bg-primary active:bg-opacity-90 w-40 items-center justify-center" 
          >
            {({ pressed }) => (
              <Tt className="font-interSemiBold text-white text-[16px] text-base">
                Preferences
              </Tt>
            )}
          </Pressable>
        </View>

        {/* Profile Overview Card */}
        <View className="mx-4 mb-8 bg-white rounded-lg border border-hsl90 p-4 shadow-md" style={{ elevation: 3, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 }}>
          {/* Card Title */}
          <Tt className="text-lg font-interBold mb-4">Profile Overview</Tt>

          {/* Key-Value Pairs */}
          <View className="mb-4 space-y-2">
            {/* Name */}
            <View className="mb-2">
              <Tt className="font-interMedium text-hsl30 mb-1">User name:</Tt>
              {isEditing ? (
                <Input
                  value={name}
                  onChangeText={setName}
                  placeholder="Enter your name"
                  className="border border-hsl90 rounded-lg px-3 py-2"
                />
              ) : (
                <Tt className="font-interBold">{name || "Not set"}</Tt>
              )}
            </View>

            {/* Email */}
            <View className="mb-2">
              <Tt className="font-interMedium text-hsl30 mb-1">Email:</Tt>
              <Tt className="font-interBold">{email || "Not set"}</Tt>
            </View>

            {/* Dietary Preference Tag */}
            <View className="mb-2">
              <Tt className="font-interMedium text-hsl30 mb-1">Dietary Preference Tag:</Tt>
              {isEditing ? (
                <Input
                  value={dietaryPreference}
                  onChangeText={setDietaryPreference}
                  placeholder="Enter your dietary preference"
                  className="border border-hsl90 rounded-lg px-3 py-2"
                />
              ) : (
                <Tt className="font-interBold">{dietaryPreference || "Not set"}</Tt>
              )}
            </View>

            {/* Account Status */}
            <View>
              <Tt className="font-interMedium text-hsl30 mb-1">Account Status:</Tt>
              <Tt className="font-interBold">{accountStatus}</Tt>
            </View>
          </View>

          {/* Buttons on Right Side */}
          <View className="flex-row justify-end gap-2 mt-4">
            {isEditing ? (
              <>
                {/* Cancel Button */}
                <Pressable
                  onPress={handleCancel}
                  className="py-2 px-4 rounded-lg border border-black bg-gray-200 active:bg-gray-300"
                >
                  {({ pressed }) => (
                    <Tt className="font-interMedium text-black text-sm">
                      Cancel
                    </Tt>
                  )}
                </Pressable>

                {/* Save Button */}
                <Pressable
                  onPress={handleSave}
                  className="py-2 px-4 rounded-lg border border-black bg-primary active:bg-opacity-90"
                >
                  {({ pressed }) => (
                    <Tt className="font-interMedium text-white text-sm">
                      Save
                    </Tt>
                  )}
                </Pressable>
              </>
            ) : (
              <>
                {/* Log out Button */}
                <Pressable
                  onPress={handleLogout}
                  className="py-2 px-4 rounded-lg border border-black bg-gray-200 active:bg-gray-300"
                >
                  {({ pressed }) => (
                    <Tt className="font-interMedium text-black text-sm">
                      Log out
                    </Tt>
                  )}
                </Pressable>

                {/* Edit Profile Button */}
                <Pressable
                  onPress={handleEditToggle}
                  className="py-2 px-4 rounded-lg border border-black bg-primary active:bg-opacity-90"
                >
                  {({ pressed }) => (
                    <Tt className="font-interMedium text-white text-sm">
                      Edit Profile
                    </Tt>
                  )}
                </Pressable>
              </>
            )}
          </View>
        </View>

        {/* Linked Accounts Card */}
        <View className="mx-4 mb-8 bg-white rounded-lg border border-hsl90 p-4 shadow-md" style={{ elevation: 3, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 }}>
          {/* Card Title */}
          <Tt className="text-lg font-interBold mb-4">Linked Accounts</Tt>

          {/* Key-Value Pairs */}
          <View className="mb-4 space-y-2">
            {/* Facebook */}
            <View className="mb-2">
              <Tt className="font-interMedium text-hsl30 mb-1">Facebook:</Tt>
              {isEditing ? (
                <Input
                  value={linkedAccounts.facebook}
                  onChangeText={(text) => setLinkedAccounts(prev => ({ ...prev, facebook: text }))}
                  placeholder="Enter Facebook username"
                  className="border border-hsl90 rounded-lg px-3 py-2"
                />
              ) : (
                <Tt className="font-interBold">
                  {linkedAccounts.facebook ? `${linkedAccounts.facebook} (Linked)` : "Not linked"}
                </Tt>
              )}
            </View>

            {/* Instagram */}
            <View className="mb-2">
              <Tt className="font-interMedium text-hsl30 mb-1">Instagram:</Tt>
              {isEditing ? (
                <Input
                  value={linkedAccounts.instagram}
                  onChangeText={(text) => setLinkedAccounts(prev => ({ ...prev, instagram: text }))}
                  placeholder="Enter Instagram username"
                  className="border border-hsl90 rounded-lg px-3 py-2"
                />
              ) : (
                <Tt className="font-interBold">
                  {linkedAccounts.instagram ? `${linkedAccounts.instagram} (Linked)` : "Not linked"}
                </Tt>
              )}
            </View>

            {/* X */}
            <View>
              <Tt className="font-interMedium text-hsl30 mb-1">X:</Tt>
              {isEditing ? (
                <Input
                  value={linkedAccounts.x}
                  onChangeText={(text) => setLinkedAccounts(prev => ({ ...prev, x: text }))}
                  placeholder="Enter X username"
                  className="border border-hsl90 rounded-lg px-3 py-2"
                />
              ) : (
                <Tt className="font-interBold">
                  {linkedAccounts.x ? `${linkedAccounts.x} (Linked)` : "Not linked"}
                </Tt>
              )}
            </View>
          </View>

          {/* Buttons on Right Side */}
          <View className="flex-row justify-end gap-2 mt-4">
            {/* Sync Button */}
            <Pressable
              onPress={handleSync}
              className="py-2 px-4 rounded-lg border border-black bg-gray-200 active:bg-gray-300"
            >
              {({ pressed }) => (
                <Tt className="font-interMedium text-black text-sm">
                  Sync
                </Tt>
              )}
            </Pressable>

            {/* Manage Button */}
            <Pressable
              onPress={handleEditToggle}
              className="py-2 px-4 rounded-lg border border-black bg-primary active:bg-opacity-90"
            >
              {({ pressed }) => (
                <Tt className="font-interMedium text-white text-sm">
                  {isEditing ? "Save" : "Manage"}
                </Tt>
              )}
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {/* Profile Photo Edit Modal */}
      <ProfilePhotoEditModal
        visible={showPhotoModal}
        onClose={() => setShowPhotoModal(false)}
        userName={name}
        profileId={selfProfileId}
        onPhotoUpdated={async () => {
          // Clear avatar cache and refresh all profile displays
          if (selfProfileId) {
            await clearAvatarCache(selfProfileId);
          } else {
            await clearAvatarCache();
          }
          // Refresh profile photo from Storage after update
          await refreshAvatar();
        }}
      />
    </View>
  );
}
