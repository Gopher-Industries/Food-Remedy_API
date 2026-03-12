// Members Page

import { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import Header from "@/components/layout/Header";
import Screen from "@/components/layout/Screen";
import Tt from "@/components/ui/UIText";
import IconGeneral from "@/components/icons/IconGeneral";
import { useProfile } from "@/components/providers/ProfileProvider";
import ActiveProfileBadge from "@/components/ui/ActiveProfileBadge";
import { useModalManager } from "@/components/providers/ModalManagerProvider";
import ProfileAvatar from "@/components/ui/ProfileAvatar";
import { getProfileLabel } from "@/services/utils/profileLabel";


/**
 * High contrast helpers (className strings)
 */
const hcSection = (on: boolean) => (on ? "bg-white border-b border-black" : "bg-hsl90");
const hcRow = (on: boolean) => (on ? "bg-white border-b border-black" : "border-b border-hsl85");
const hcText = (on: boolean) => (on ? "text-black" : "text-hsl30");

export default function MembersPage() {
  const { profiles, startEdit, startEditForNew, clearEdit, refresh, selfDisplayName } = useProfile();
  const { openModal } = useModalManager();
  const [refreshing, setRefreshing] = useState(false);
  

  // High contrast mode - would come from PreferencesProvider in a real implementation
  const highContrast = false;

  // Refresh when screen is focused
  useFocusEffect(
    useCallback(() => {
      (async () => { await refresh(); })();
    }, [refresh])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const handleOpenProfileSelector = () => {
    openModal("profileSelector");
  };

  /**
   * To edit, we set the edit-id in context and
   * navigate in.
   */
  const handleEditMember = (id: string) => {
    const existing = profiles.find(p => p.profileId === id);
    if (!existing) return;  // guard, though we should never hit this
    startEdit(existing);
    router.push("/(app)/membersEdit");
  };

  return (
    <Screen className="p-safe">
      <Header />

      <Tt className="text-xl font-interBold text-center my-4">Profiles</Tt>

      {/* ACTIVE PROFILE SELECTION */}
      <View className="w-[95%] mx-auto mb-4">
        <ActiveProfileBadge onPress={handleOpenProfileSelector} />
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        <View className="w-[100%] mx-auto">
          {/* ACCOUNT */}
          <View className={`px-4 py-2 ${hcSection(highContrast)}`}>
            <Tt className={`${hcText(highContrast)} font-interMedium`}>Account</Tt>
          </View>

          <Pressable
            onPress={() => router.push("/(app)/accountProfile")}
            className={`flex-row justify-between items-center px-4 py-6 active:bg-hsl98 ${hcRow(
              highContrast
            )}`}
          >
            {({ pressed }) => (
              <>
                <View className="flex-row items-center gap-3">
                  <IconGeneral
                    type="account"
                    fill="hsl(0, 0%, 40%)"
                    size={32}
                  />
                  <View>
                    <Tt className="font-interMedium">Account & Profile</Tt>
                    <Tt className="text-sm">Update Account and Profile</Tt>
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

          <Pressable
            onPress={() => router.push("/(app)/nutritionalProfiles")}
            className={`flex-row justify-between items-center px-4 py-6 active:bg-hsl98 ${hcRow(
              highContrast
            )}`}
          >
            {({ pressed }) => (
              <>
                <View className="flex-row items-center gap-3">
                  <IconGeneral
                    type="nutrition"
                    fill="hsl(0, 0%, 40%)"
                    size={34}
                  />
                  <View>
                    <Tt className="font-interMedium">Nutritional Profiles</Tt>
                    <Tt className="text-sm">View Member Nutritional Profiles</Tt>
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

          {/* {profiles.map((member) => (
            <Pressable
              key={member.profileId}
              onPress={() => handleEditMember(member.profileId)}
              className="mb-4 flex-row justify-between items-center px-6 rounded-2xl py-4
                border border-hsl90 dark:border-hsl20 active:border-primary bg-white dark:bg-hsl15 dark:border-hsl20 self-center"
            >
              {({ pressed }) => (
                <View className="flex-row items-center">
                  {member.avatarUrl ? (
                    <ProfileAvatar
                      uri={member.avatarUrl}
                      name={member.relationship === "Self" ? selfDisplayName : undefined}
                      size={50}
                    />
                  ) : (
                    <IconGeneral type="account" fill="hsl(0 0% 40%)" size={50} />
                  )}

                  <View className="px-2 flex-grow">
                    <Tt className="font-interBold text-lg">
                      {getProfileLabel(member.relationship, member.relationship === "Self" ? selfDisplayName : undefined)}
                    </Tt>
                  </View>

                  <IconGeneral type="edit" fill={pressed ? "#FF3F3F" : "hsl(0 0%, 30%)"} />
                </View>
              )}
            </Pressable>
          ))} */}
        </View>
      </ScrollView>
    </Screen>
  );
}
