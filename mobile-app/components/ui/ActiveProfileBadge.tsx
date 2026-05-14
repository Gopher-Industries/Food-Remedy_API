// Active Profile Badge Component

import React from "react";
import { Pressable, View } from "react-native";
import { useProfile } from "../providers/ProfileProvider";
import Tt from "./UIText";
import IconGeneral from "../icons/IconGeneral";
import ProfileAvatar from "./ProfileAvatar";

interface ActiveProfileBadgeProps {
  onPress?: () => void;
  compact?: boolean;
}

const ActiveProfileBadge: React.FC<ActiveProfileBadgeProps> = ({
  onPress,
  compact = false,
}) => {
  const { activeProfile, profiles, selfDisplayName } = useProfile();

  /**
   * IMPORTANT FIX:
   * Remove demographics profile from counts and display
   */
  const visibleProfiles = profiles.filter((profile) => {
    const profileId = String(profile.profileId || "")
      .toLowerCase()
      .trim();

    const relationship = String(profile.relationship || "")
      .toLowerCase()
      .trim();

    return (
      profileId !== "demographics" &&
      relationship !== "demographics"
    );
  });

  /**
   * Get display name
   */
  const getProfileDisplayName = () => {
    // No active profile selected
    if (!activeProfile) {
      return `All Profiles (${visibleProfiles.length})`;
    }

    // Ignore demographics profile
    if (
      activeProfile.profileId === "demographics" ||
      activeProfile.relationship === "Demographics"
    ) {
      return `All Profiles (${visibleProfiles.length})`;
    }

    // Self profile
    if (
      activeProfile.relationship === "Self" &&
      selfDisplayName
    ) {
      return selfDisplayName;
    }

    return (
      activeProfile.firstName ||
      activeProfile.relationship ||
      "Profile"
    );
  };

  const displayName = getProfileDisplayName();

  if (compact) {
    return (
      <Pressable
        onPress={onPress}
        className="flex-row items-center gap-x-2 px-3 py-2 rounded-full bg-primary/10 border border-primary"
      >
        {({ pressed }) => (
          <>
            {activeProfile?.avatarUrl ? (
              <ProfileAvatar
                uri={activeProfile.avatarUrl}
                name={activeProfile.firstName}
                size={24}
                borderColor={pressed ? "#FF3F3F" : "#FFFFFF"}
              />
            ) : (
              <View className="w-[24px] h-[24px] rounded-full bg-primary flex justify-center items-center">
                {activeProfile ? (
                  <Tt className="text-white font-interBold text-xs">
                    {(displayName || "P")[0].toUpperCase()}
                  </Tt>
                ) : (
                  <IconGeneral type="account" fill="#FFFFFF" size={16} />
                )}
              </View>
            )}

            <Tt
              className={`text-sm font-interSemiBold ${
                pressed ? "text-primary" : "text-hsl20"
              }`}
            >
              {displayName}
            </Tt>

            <IconGeneral
              type="arrow-forward-ios"
              fill={pressed ? "#FF3F3F" : "hsl(0, 0%, 30%)"}
              size={12}
            />
          </>
        )}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center justify-between px-4 py-3 rounded-lg bg-white border border-hsl90 active:border-primary"
    >
      {({ pressed }) => (
        <>
          <View className="flex-row items-center flex-1">
            {activeProfile?.avatarUrl ? (
              <ProfileAvatar
                uri={activeProfile.avatarUrl}
                name={activeProfile.firstName}
                size={40}
                borderColor={pressed ? "#FF3F3F" : "#E5E7EB"}
              />
            ) : (
              <View
                className={`w-[40px] h-[40px] rounded-full flex justify-center items-center border-2 ${
                  pressed
                    ? "border-primary bg-primary"
                    : "border-hsl90"
                }`}
              >
                {activeProfile ? (
                  <Tt
                    className={`font-interBold text-lg ${
                      pressed ? "text-white" : "text-primary"
                    }`}
                  >
                    {(displayName || "P")[0].toUpperCase()}
                  </Tt>
                ) : (
                  <IconGeneral
                    type="account"
                    fill={pressed ? "#FFFFFF" : "hsl(0, 0%, 30%)"}
                    size={24}
                  />
                )}
              </View>
            )}

            <View className="px-3 flex-1">
              <Tt className="text-xs text-hsl30">
                Active Profile
              </Tt>

              <Tt className="font-interBold text-base">
                {displayName}
              </Tt>
            </View>
          </View>

          <IconGeneral
            type="arrow-forward-ios"
            fill={pressed ? "#FF3F3F" : "hsl(0, 0%, 30%)"}
          />
        </>
      )}
    </Pressable>
  );
};

export default ActiveProfileBadge;