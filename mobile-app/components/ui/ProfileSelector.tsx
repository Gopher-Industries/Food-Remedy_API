// Profile Selector Component

import React from "react";
import { Pressable, View, ScrollView } from "react-native";
import { useProfile } from "../providers/ProfileProvider";
import Tt from "./UIText";
import IconGeneral from "../icons/IconGeneral";
import ProfileAvatar from "./ProfileAvatar";

interface ProfileSelectorProps {
  onProfileSelected?: () => void;
}

const ProfileSelector: React.FC<ProfileSelectorProps> = ({
  onProfileSelected,
}) => {
  const { profiles, activeProfileId, setActiveProfile, selfDisplayName } = useProfile();

  const handleSelectProfile = async (profileId: string) => {
    await setActiveProfile(profileId);
    onProfileSelected?.();
  };

  const handleClearSelection = async () => {
    await setActiveProfile(null);
    onProfileSelected?.();
  };

  return (
    <View className="w-full">
      <Tt className="text-lg font-interBold mb-3">Select Active Profile</Tt>
      <Tt className="text-sm text-hsl30 mb-4">
        Choose which profile to use for scanning products
      </Tt>

      <ScrollView className="max-h-[400px]">
        {/* Show All Profiles Option */}
        <Pressable
          onPress={handleClearSelection}
          className={`mb-3 flex-row justify-between items-center px-4 py-4 rounded-xl border-2 ${
            activeProfileId === null
              ? "bg-primary/10 border-primary"
              : "bg-white border-hsl90"
          }`}
        >
          <View className="flex-row items-center flex-1">
            <View
              className={`w-[50px] h-[50px] rounded-full flex justify-center items-center border-2 ${
                activeProfileId === null
                  ? "border-primary bg-primary"
                  : "border-hsl90 bg-hsl95"
              }`}
            >
              <IconGeneral
                type="account"
                fill={activeProfileId === null ? "#FFFFFF" : "hsl(0, 0%, 30%)"}
                size={30}
              />
            </View>

            <View className="px-3 flex-1">
              <Tt className="font-interBold text-lg">All Profiles</Tt>
              <Tt className="text-hsl30 text-sm">Check against all profiles</Tt>
            </View>
          </View>

          {activeProfileId === null && (
            <IconGeneral type="check" fill="#FF3F3F" size={24} />
          )}
        </Pressable>

        {/* Individual Profiles */}
        {profiles.map((profile) => {
          const isActive = activeProfileId === profile.profileId;
          const avatarBorder = isActive ? "#FF3F3F" : "#E5E7EB";
          return (
            <Pressable
              key={profile.profileId}
              onPress={() => handleSelectProfile(profile.profileId)}
              className={`mb-3 flex-row justify-between items-center px-4 py-4 rounded-xl border-2 ${
                isActive
                  ? "bg-primary/10 border-primary"
                  : "bg-white border-hsl90"
              }`}
            >
              <View className="flex-row items-center flex-1">
                <ProfileAvatar
                  uri={profile.avatarUrl}
                  name={profile.firstName}
                  size={50}
                  borderColor={avatarBorder}
                />

                <View className="px-3 flex-1">
                  <Tt className="font-interBold text-lg">
                    {profile.relationship === "Self" && selfDisplayName
                      ? selfDisplayName
                      : profile.firstName || "Unnamed Profile"}
                  </Tt>
                  <Tt className="text-hsl30 text-sm">{profile.relationship}</Tt>
                </View>
              </View>

              {isActive && (
                <IconGeneral type="check" fill="#FF3F3F" size={24} />
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
};

export default ProfileSelector;
