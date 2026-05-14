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

  const {
    profiles,
    startEdit,
    startEditForNew,
    clearEdit,
    refresh,
    selfDisplayName,
  } = useProfile();

  const [refreshing, setRefreshing] = useState(false);
  const [firebaseUserName, setFirebaseUserName] = useState<string>("");

  useEffect(() => {
    const fetchUserName = async () => {
      if (!user?.uid) return;

      const profileName = await getUserProfileName(user.uid);

      if (profileName) {
        const fullName =
          `${profileName.firstName || ""} ${profileName.lastName || ""}`.trim() ||
          profileName.userName ||
          "";

        setFirebaseUserName(fullName);
      }
    };

    fetchUserName();
  }, [user?.uid]);

  useFocusEffect(
    useCallback(() => {
      if (user?.uid) {
        refresh();
      }
    }, [user?.uid, refresh])
  );

  const handleAddMember = () => {
    clearEdit();
    startEditForNew();
    router.push("/(app)/membersEdit");
  };

  const handleEditMember = (id: string) => {
    const existing = profiles.find((p) => p.profileId === id);
    if (!existing) return;

    startEdit(existing);
    router.push("/(app)/membersEdit");
  };

  const onRefresh = useCallback(async () => {
    if (!user?.uid) return;

    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [user?.uid, refresh]);

  const visibleProfiles = profiles
    .filter((profile) => {
      const profileId = String(profile.profileId || "").toLowerCase().trim();
      const relationship = String(profile.relationship || "").toLowerCase().trim();
      const firstName = String(profile.firstName || "").toLowerCase().trim();

      return (
        profile.profileId !== "demographics" &&
        profile.relationship !== "Demographics" &&
        profile.firstName !== "User (Demographics)"
      );
    })
    .filter(
      (profile, index, self) =>
        index === self.findIndex((p) => p.profileId === profile.profileId)
    );

  return (
    <View className="flex-1 bg-white p-safe">
      <Header />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View className="w-[95%] mx-auto mt-4 mb-6 flex-row items-center justify-between">
          <Pressable
            onPress={() => router.back()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="px-2 py-1"
          >
            {({ pressed }) => (
              <IconGeneral
                type="arrow-backward-ios"
                fill={pressed ? "#FF3F3F" : "hsl(0 0%, 30%)"}
              />
            )}
          </Pressable>

          <Tt className="text-xl font-interBold">Nutritional Profiles</Tt>

          <View style={{ width: 24, height: 24 }} />
        </View>

        <View className="w-[95%] mx-auto">
          {visibleProfiles.map((profile) => (
            <View
              key={profile.profileId}
              className="mb-4 flex-row items-center px-4 py-4 rounded-lg border border-hsl90 bg-white"
              style={{
                elevation: 2,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.08,
                shadowRadius: 3,
              }}
            >
              <View className="w-12 h-12 rounded-full bg-hsl98 flex items-center justify-center border-2 border-hsl90">
                {profile.avatarUrl ? (
                  <ProfileAvatar
                    uri={profile.avatarUrl}
                    name={
                      profile.relationship === "Self"
                        ? selfDisplayName
                        : undefined
                    }
                    size={48}
                  />
                ) : (
                  <IconGeneral
                    type="account"
                    fill="hsl(0, 0%, 40%)"
                    size={24}
                  />
                )}
              </View>

              <View className="flex-1 ml-4">
                <Tt className="font-interBold text-base">
                  {profile.relationship === "Self" && firebaseUserName
                    ? firebaseUserName
                    : profile.firstName ||
                      getProfileLabel(
                        profile.relationship,
                        profile.relationship === "Self"
                          ? selfDisplayName
                          : undefined
                      )}
                </Tt>

                <Tt className="text-sm text-hsl30">{profile.relationship}</Tt>
              </View>

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

        <View className="w-[95%] mx-auto">
          <Pressable
            onPress={() => router.push("/(app)/demographics" as any)}
            hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
            className="mt-4 flex-row justify-between items-center py-3 px-4 rounded-lg border border-hsl90 active:border-primary bg-white"
          >
            {({ pressed }) => (
              <>
                <Tt
                  className={`text-lg font-interSemiBold flex-grow ${
                    pressed ? "text-primary" : "text-hsl30"
                  }`}
                >
                  Edit Demographics
                </Tt>

                <IconGeneral
                  type="edit"
                  fill={pressed ? color.primary : color.iconDefault}
                  size={spacing.xl}
                />
              </>
            )}
          </Pressable>
        </View>

        <View className="w-[95%] mx-auto">
          <Pressable
            onPress={handleAddMember}
            hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
            className="mt-4 flex-row justify-between items-center py-3 px-4 rounded-lg border border-hsl90 active:border-primary bg-white"
          >
            {({ pressed }) => (
              <>
                <Tt
                  className={`text-lg font-interSemiBold flex-grow ${
                    pressed ? "text-primary" : "text-hsl30"
                  }`}
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

        <View className="w-[95%] mx-auto">
          <Pressable
            onPress={() => router.push("/(app)/(tabs)" as any)}
            hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
            className="mt-4 mb-16 py-3 px-4 rounded-lg border bg-primary border-hsl90 dark:border-hsl20 active:bg-transparent active:border-primary"
          >
            {({ pressed }) => (
              <Tt
                className={`text-lg text-center font-interSemiBold ${
                  pressed ? "text-primary" : "text-white"
                }`}
              >
                Main Menu
              </Tt>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}