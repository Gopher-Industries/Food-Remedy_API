// Profile Create Form

import React, { useCallback, useState } from "react";
import { View, ScrollView, Pressable, Image, KeyboardAvoidingView, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import Tt from "@/components/ui/UIText";
import Input from "@/components/ui/UIInput";
import IconGeneral from "@/components/icons/IconGeneral";
import ProfileAvatar from "@/components/ui/ProfileAvatar";
import { useProfile } from "@/components/providers/ProfileProvider";
import { useNotification } from "@/components/providers/NotificationProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { upsertUserProfile } from "@/services/database/user/profiles";
import { uploadProfileAvatar } from "@/services/storage/uploadProfileAvatar";
import ProfileMultiSelectSection from "./ui/ProfileMultiSelectSection";
import { router } from "expo-router";
import { ADDITIVES, ALLERGIES, DIETARIES, INTOLERANCES } from "@/services/constants/NutritionalTags";


const ProfileCreateForm = () => {
  const { create, refresh, selfDisplayName } = useProfile();
  const { addNotification } = useNotification();
  const { user } = useAuth();

  // form state
  const [name, setName] = useState<string>("");
  const [age, setAge] = useState<string>("");
  const [selectedAllergies, setAllergies] = useState<string[]>([]);
  const [selectedIntolerances, setIntolerances] = useState<string[]>([]);
  const [selectedDietaries, setDietaries] = useState<string[]>([]);
  const [selectedAdditives, setAdditives] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [deletingAvatar, setDeletingAvatar] = useState(false);

  const toggle = useCallback(
    (setter: React.Dispatch<React.SetStateAction<string[]>>, item: string) => {
      setter((prev) => (prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]));
    },
    []
  );

  const handleImageModal = useCallback(async () => {
    try {
      // Request permission (library); camera can be added later if needed
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        addNotification("Permission to access photos is required.", "e");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.85,
      });

      if (!result.canceled && result.assets?.length) {
        const uri = result.assets[0].uri;
        setAvatarUri(uri);
        addNotification("Profile picture selected.", "s");
      }
    } catch (err: any) {
      console.error("Image pick failed:", err);
      addNotification("Failed to pick image.", "e");
    }
  }, [addNotification]);


  const handleSave = async () => {
    const nAge = Number(age);
    if (!age.trim() || Number.isNaN(nAge) || nAge < 0 || nAge > 120) {
      addNotification("Enter a valid age between 0 and 120.", "e");
      return;
    }

    try {
      setSubmitting(true);
      const created = await create({
        firstName: name.trim(),
        lastName: "",
        status: true,
        relationship: "Self",
        age: Number(age),
        avatarUrl: "",
        additives: selectedAdditives,
        allergies: selectedAllergies,
        intolerances: selectedIntolerances,
        dietaryForm: selectedDietaries,
      });
      // If we have a local image, upload to storage
      if (avatarUri && user?.uid) {
        try {
          await uploadProfileAvatar(user.uid, created.profileId, avatarUri);
        } catch (e) {
          console.warn('Avatar upload failed:', e);
        }
      }
      if (user?.uid) {
        // Ensure Firestore has the profile as well
        try { await upsertUserProfile(user.uid, created.profileId, created); } catch {}
      }
      await refresh();
      // Do not navigate here; App layout gate will redirect to tabs when ready.
      addNotification("Profile created", "s");
    } catch (err: any) {
      console.error(err);
      addNotification("Failed to save profile", "e");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAvatar = async () => {
    if (!avatarUri) return;
    setDeletingAvatar(true);
    try {
      setAvatarUri(null);
      addNotification("Profile picture removed.", "s");
    } catch (err: any) {
      console.warn("Avatar delete failed:", err);
      setAvatarUri(null);
      addNotification("Failed to delete avatar from storage.", "e");
    } finally {
      setDeletingAvatar(false);
    }
  };

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <View className="flex-1 w-[90%] self-center">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1"
        >

          <Tt className="text-xl font-interBold text-center my-4">Create Your Nutritional Profile</Tt>

          <Pressable onPress={handleImageModal} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} className="justify-center items-center my-2">
            {avatarUri ? (
              <ProfileAvatar uri={avatarUri} name={selfDisplayName} size={120} />
            ) : (
              <IconGeneral type="account" fill="hsl(0 0% 40%)" size={100} />
            )}
            <Tt className="text-xl font-interMedium text-left">{avatarUri ? "Change Picture" : "Upload Picture"}</Tt>
          </Pressable>
          {avatarUri ? (
            <Pressable
              onPress={handleDeleteAvatar}
              disabled={deletingAvatar}
              hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
              className="self-center px-3 py-2 rounded-md border border-hsl80"
            >
              <Tt className={`text-sm font-interMedium ${deletingAvatar ? "text-hsl50 dark:text-hsl70" : "text-hsl30 dark:text-hsl90"}`}>
                {deletingAvatar ? "Removing…" : "Remove Photo"}
              </Tt>
            </Pressable>
          ) : null}

          {/* Name Input */}
          <Input
            value={name}
            onChangeText={setName}
            placeholder="Name"
            className="my-2 py-3"
          />

          {/* Age Input */}
          <Input
            value={age}
            onChangeText={setAge}
            placeholder="Age"
            keyboardType="number-pad"
            className="my-2 py-3 mb-8"
          />

          {/* Preferences */}
          <ProfileMultiSelectSection
            title="Select Allergies"
            items={ALLERGIES}
            selected={selectedAllergies}
            onToggle={(i) => toggle(setAllergies, i)}
          />

          <ProfileMultiSelectSection
            title="Select Additives"
            items={ADDITIVES}
            selected={selectedAdditives}
            onToggle={(i) => toggle(setAdditives, i)}
          />

          <ProfileMultiSelectSection
            title="Select Intolerances"
            items={INTOLERANCES}
            selected={selectedIntolerances}
            onToggle={(i) => toggle(setIntolerances, i)}
          />

          <ProfileMultiSelectSection
            title="Select Dietary Preferences"
            items={DIETARIES}
            selected={selectedDietaries}
            onToggle={(i) => toggle(setDietaries, i)}
          />

        </KeyboardAvoidingView>

        {/* Save */}
        <Pressable
          onPress={handleSave}
          disabled={submitting}
          hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
          className="w-[90%] self-center py-3 px-4 my-4 rounded-lg border bg-primary border-hsl90 dark:border-hsl20 active:bg-transparent active:border-primary disabled:opacity-60"
        >
          {({ pressed }) => (
            <Tt className={`text-lg text-center font-interSemiBold ${pressed ? "text-primary" : "text-white"}`}>
              {submitting ? "Saving…" : "Save Profile"}
            </Tt>
          )}
        </Pressable>

      </View>
    </ScrollView>
  );
}

export default ProfileCreateForm;
