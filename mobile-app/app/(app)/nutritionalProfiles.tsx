import { useFocusEffect, useRouter } from "expo-router";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useCallback, useState, useEffect } from "react";
import Tt from "@/components/ui/UIText";
import IconGeneral from "@/components/icons/IconGeneral";
import { color, spacing } from "@/app/design/token";
import Header from "@/components/layout/Header";
import { useProfile } from "@/components/providers/ProfileProvider";
import ProfileAvatar from "@/components/ui/ProfileAvatar";
import { getProfileLabel } from "@/services/utils/profileLabel";
import getUserProfileName from "@/services/database/user/getUserProfileName";
import { useAuth } from "@/components/providers/AuthProvider";

export default function NutritionalProfilesScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const { profiles, startEdit, startEditForNew, clearEdit, refresh, selfDisplayName } = useProfile();
  const [refreshing, setRefreshing] = useState(false);
  const [firebaseUserName, setFirebaseUserName] = useState<string>("");

  useEffect(() => {
    const fetchUserName = async () => {
      if (user?.uid) {
        const profileName = await getUserProfileName(user.uid);
        if (profileName) {
          const fullName = `${profileName.firstName || ''} ${profileName.lastName || ''}`.trim() || profileName.userName || '';
          setFirebaseUserName(fullName);
        }
      }
    };
    fetchUserName();
  }, [user?.uid]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  /**
   * When tap “Add Member” we clear any edit‐id
   * and then navigate into the same edit screen—treating it
   * as a brand-new member.
   */
  const handleAddMember = () => {
    clearEdit();
    startEditForNew();
    router.push("/(app)/membersEdit");
  };

  const handleEditMember = (id: string) => {
    const existing = profiles.find(p => p.profileId === id);
    if (!existing) return;
    startEdit(existing);
    router.push("/(app)/membersEdit");
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  return (
    <View className="flex-1 bg-white p-safe">
        
        <Header />


      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Title + Back */}
        <View className="w-[95%] mx-auto mt-4 mb-6 flex-row items-center justify-between">
          <Pressable
            onPress={() => router.back()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="px-2 py-1"
          >
            {({ pressed }) => (
              <IconGeneral type="arrow-backward-ios" fill={pressed ? "#FF3F3F" : "hsl(0 0%, 30%)"} />
            )}
          </Pressable>
          <Tt className="text-xl font-interBold">Nutritional Profiles</Tt>
          <View style={{ width: 24, height: 24 }} />
        </View>

        {/* Profile List Items */}
        <View className="w-[95%] mx-auto">
          {profiles.map((profile) => (
            <View
              key={profile.profileId}
              className="mb-4 flex-row items-center px-4 py-4 rounded-lg border border-hsl90 bg-white"
              style={{ elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 3 }}
            >
              {/* User Avatar */}
              <View className="w-12 h-12 rounded-full bg-hsl98 flex items-center justify-center border-2 border-hsl90">
                {profile.avatarUrl ? (
                  <ProfileAvatar
                    uri={profile.avatarUrl}
                    name={profile.relationship === "Self" ? selfDisplayName : undefined}
                    size={48}
                  />
                ) : (
                  <IconGeneral type="account" fill="hsl(0, 0%, 40%)" size={24} />
                )}
              </View>

              {/* User Info */}
              <View className="flex-1 ml-4">
                <Tt className="font-interBold text-base">
                  {profile.relationship === "Self" && firebaseUserName
                    ? firebaseUserName
                    : profile.firstName || getProfileLabel(profile.relationship, profile.relationship === "Self" ? selfDisplayName : undefined)}
                </Tt>
                <Tt className="text-sm text-hsl30">{profile.relationship}</Tt>
              </View>

              {/* Edit Icon */}
              <Pressable
                onPress={() => handleEditMember(profile.profileId)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {({ pressed }) => (
                  <IconGeneral
                    type="edit"
                    fill={pressed ? color.primary : color.iconDefault}
                    size={spacing.lg}
                  />
                )}
              </Pressable>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* ADD MEMBER */}
      <View className="w-[95%] mx-auto">
        <Pressable
          onPress={handleAddMember}
          hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
          className="mt-8 mb-16 flex-row justify-between items-center py-3 px-4 rounded-lg 
                border border-hsl90 active:border-primary bg-white self-center"
        >
          {({ pressed }) => (
            <>
              <Tt
                className={`text-lg font-interSemiBold flex-grow  ${pressed ? "text-primary" : "text-hsl30"}`}
              >
                Add New Nutritional Profile
              </Tt>
              <IconGeneral
                type="member-add"
                fill={pressed ? color.primary : color.iconDefault}
                size={spacing.xl}
              />
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}
