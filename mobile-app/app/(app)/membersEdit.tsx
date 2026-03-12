// Member Edit Page tsx

import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, ScrollView, Pressable, Image } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import Header from "@/components/layout/Header";
import Screen from "@/components/layout/Screen";
import Tt from "@/components/ui/UIText";
import Input from "@/components/ui/UIInput";
import IconGeneral from "@/components/icons/IconGeneral";
import ProfileAvatar from "@/components/ui/ProfileAvatar";
import { useModalManager } from "@/components/providers/ModalManagerProvider";
import { useProfile } from "@/components/providers/ProfileProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { upsertUserProfile } from "@/services/database/user/profiles";
import { deleteProfileAvatar, isRemoteUri, uploadProfileAvatar } from "@/services/storage/uploadProfileAvatar";
import ProfileMultiSelectSection from "@/components/ui/ProfileMultiSelectSection";
import { ADDITIVES, ALLERGIES, DIETARIES, INTOLERANCES } from "@/services/constants/NutritionalTags";
import { useNotification } from "@/components/providers/NotificationProvider";
import PdBlk from "@/components/ui/UIPaddingBlock";
import ModalWrapper from "@/components/modals/ModalAWrapper";
import ModalResponse from "@/components/modals/ModalResponse";
import getUserProfileName from "@/services/database/user/getUserProfileName";


export default function MembersEditPage() {
  const router = useRouter();
  const { addNotification } = useNotification();
  const { profiles, editableProfile, updateEdit, clearEdit, saveEdit, remove, update, selfDisplayName } = useProfile();
  const { openModal } = useModalManager();
  const { user } = useAuth();

  const [name, setName] = useState(editableProfile?.firstName ?? "");
  const [firebaseUserName, setFirebaseUserName] = useState<string>("");
  const [ageText, setAgeText] = useState(
    editableProfile?.age == null ? "" : String(editableProfile.age)
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingAvatar, setDeletingAvatar] = useState(false);

  const didMountRef = useRef(false);

  const targetProfile = profiles.find(p => p.profileId === editableProfile?.profileId);
  const isPersisted = !!targetProfile;
  const isSelf = targetProfile?.relationship === "Self";
  const canDelete = isPersisted && !isSelf;

  const onAgeBlur = () => {
    const n = Number(ageText)
    updateEdit({ age: isNaN(n) ? 0 : n })
  }

  const onNameChange = (text: string) => {
    setName(text);
    updateEdit({ firstName: text, lastName: "" });
  };

  /**
   * Toggle Handler using Functional Updates
   */
  type ListField = "allergies" | "intolerances" | "dietaryForm" | "additives";
  const toggle = useCallback(
    (field: ListField, item: string) => {
      const list = (editableProfile as any)?.[field] as string[] | undefined;
      const safe = Array.isArray(list) ? list : [];
      const next = safe.includes(item) ? safe.filter(i => i !== item) : [...safe, item];
      updateEdit({ [field]: next } as any);
    },
    [editableProfile, updateEdit]
  );

  // Sync local state when editableProfile changes
  useEffect(() => {
    if (editableProfile) {
      setName(editableProfile.firstName ?? "");
      setAgeText(editableProfile.age == null || editableProfile.age === 0 ? "" : String(editableProfile.age));
    }
  }, [editableProfile?.profileId]);

  // Fetch Firebase user name for Self profiles
  useEffect(() => {
    const fetchUserName = async () => {
      if (user?.uid && isSelf) {
        const profileName = await getUserProfileName(user.uid);
        if (profileName) {
          const fullName = `${profileName.firstName || ''} ${profileName.lastName || ''}`.trim() || profileName.userName || '';
          setFirebaseUserName(fullName);
        }
      }
    };
    fetchUserName();
  }, [user?.uid, isSelf]);

  // If the draft is cleared (save/delete), leave this screen instead of rendering blank.
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (!editableProfile) {
      router.back();
    }
  }, [editableProfile, router]);

  if (!editableProfile) return null;


  /**
   * Handle Save
   * @returns 
   */
  const handleSaveProfile = async () => {
    // normalize age (also done on blur, but safe to enforce here)
    const n = Number(ageText);
    const finalAge = Number.isNaN(n) || n < 0 ? 0 : n;
    updateEdit({ age: finalAge });

    try {
      setSaving(true);
      let uploadedUrl: string | null = null;
      // If avatarUrl is local, upload and replace with remote URL before saving
      if (editableProfile?.avatarUrl && !isRemoteUri(editableProfile.avatarUrl) && user?.uid) {
        try {
          uploadedUrl = await uploadProfileAvatar(user.uid, editableProfile.profileId, editableProfile.avatarUrl);
          if (uploadedUrl) {
            updateEdit({ avatarUrl: uploadedUrl });
          }
        } catch (e) {
          console.warn('Avatar upload failed during edit:', e);
        }
      }
      const saved = await saveEdit({ 
        avatarUrl: uploadedUrl ?? editableProfile.avatarUrl ?? "",
        age: finalAge
      });
      // Upsert to Firestore for cross-device consistency
      if (saved && user?.uid) {
        try { await upsertUserProfile(user.uid, saved.profileId, saved); } catch {}
      }
      addNotification("Profile saved", "s");
    } catch (error) {
      console.log("Error Saving Profile", error);
      addNotification("Error Saving Profile", "e");
    } finally {
      setSaving(false);
    }
  };

  /**
   * Handle Delete
   */
  const handleDeleteProfile = async () => {
    if (!canDelete) return;

    try {
      setDeleting(true);
      // Avoid navigating before root layout is ready; rely on back button.
      await remove(editableProfile.profileId);
      clearEdit();
    } catch (err) {
      console.error("Delete profile failed:", err);
      addNotification("Root profile cannot be deleted", "e");
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteAvatar = async () => {
    if (!editableProfile?.avatarUrl) return;
    setDeletingAvatar(true);
    try {
      updateEdit({ avatarUrl: "" });
      if (user?.uid) {
        await deleteProfileAvatar(user.uid, editableProfile.profileId);
      }
      const updated = await update(editableProfile.profileId, { avatarUrl: "" });
      if (user?.uid) {
        try { await upsertUserProfile(user.uid, updated.profileId, updated); } catch {}
      }
      addNotification("Profile picture removed.", "s");
    } catch (err) {
      console.error("Avatar delete failed:", err);
      addNotification("Failed to remove avatar.", "e");
    } finally {
      setDeletingAvatar(false);
    }
  };



  return (
    <Screen className="p-safe">
      <Header />

      <ScrollView keyboardShouldPersistTaps="handled">
        <View className="w-[90%] self-center">

          <View className="flex-row items-center justify-between mb-4">
            <Pressable onPress={() => router.back()}
              className="flex-row justify-center items-center self-end px-2 py-1">
              {({ pressed }) => (
                <IconGeneral type="arrow-backward-ios" fill={pressed ? "#FF3F3F" : "hsl(0 0%, 30%)"} />
              )}
            </Pressable>
            <Tt className="font-interBold text-xl">Nutritional Profile</Tt>
            <View style={{ width: 24, height: 24 }} />
          </View>


          <Pressable
            onPress={async () => {
              try {
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
                  updateEdit({ avatarUrl: uri });
                  addNotification("Profile picture updated.", "s");
                }
              } catch (err: any) {
                console.error("Image pick failed:", err);
                addNotification("Failed to pick image.", "e");
              }
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="justify-center items-center my-2 mb-4"
          >
            {editableProfile.avatarUrl ? (
              <ProfileAvatar
                uri={editableProfile.avatarUrl}
                name={editableProfile.relationship === "Self" ? selfDisplayName : undefined}
                size={120}
              />
            ) : (
              <IconGeneral type="account" fill="hsl(0 0% 40%)" size={100} />
            )}
            <Tt className="text-xl font-interMedium text-left">{editableProfile.avatarUrl ? "Change Picture" : "Upload Picture"}</Tt>
          </Pressable>
          {editableProfile.avatarUrl ? (
            <Pressable
              onPress={handleDeleteAvatar}
              disabled={deletingAvatar}
              hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
              className="self-center px-3 py-2 rounded-md border border-hsl80 mb-2"
            >
              <Tt className={`text-sm font-interMedium ${deletingAvatar ? "text-hsl50 dark:text-hsl70" : "text-hsl30 dark:text-hsl90"}`}>
                {deletingAvatar ? "Removing…" : "Remove Photo"}
              </Tt>
            </Pressable>
          ) : null}

          {/* Name Input */}
          <Input
            value={isSelf && firebaseUserName ? firebaseUserName : name}
            onChangeText={isSelf ? undefined : onNameChange}
            placeholder={isSelf ? "Name (from Account Settings)" : "Name"}
            editable={!isSelf}
            className="my-2 py-3"
            style={isSelf ? { opacity: 0.6 } : undefined}
          />

          {/* Age Input */}
          <Input
            value={ageText}
            onChangeText={setAgeText}
            onBlur={onAgeBlur}
            onFocus={() => setAgeText("")}
            placeholder="Age"
            keyboardType="number-pad"
            className="my-2 py-3"
          />

          {/* Relation Modal Open */}
          {!isSelf ? (
            <Pressable onPress={() => openModal('chooseMemberRelationship')}
              className="flex-row justify-between items-center py-3 px-4 my-2 mb-8 rounded
                border border-hsl70 active:border-primary bg-white dark:bg-hsl15">
              {({ pressed }) => (
                <>
                  <Tt className={editableProfile.relationship.trim().length! ? 'text-hsl20 font-interSemiBold' : 'text-hsl50 dark:text-hsl70 font-interSemiBold'}>
                    {editableProfile.relationship || "Relationship"}
                  </Tt>
                  <IconGeneral type="arrow-down" fill={pressed ? "#FF3F3F" : "hsl(0, 0%, 30%)"} />
                </>
              )}
            </Pressable>
          ) : (
            <PdBlk pad={15} />
          )}

          {/* Preferences */}
          <ProfileMultiSelectSection
            title="Select Allergies"
            items={ALLERGIES}
            selected={editableProfile.allergies ?? []}
            onToggle={(i) => toggle("allergies", i)}
          />

          <ProfileMultiSelectSection
            title="Select Additives"
            items={ADDITIVES}
            selected={editableProfile.additives ?? []}
            onToggle={(i) => toggle("additives", i)}
          />

          <ProfileMultiSelectSection
            title="Select Intolerances"
            items={INTOLERANCES}
            selected={editableProfile.intolerances ?? []}
            onToggle={(i) => toggle("intolerances", i)}
          />

          <ProfileMultiSelectSection
            title="Select Dietary Preferences"
            items={DIETARIES}
            selected={editableProfile.dietaryForm ?? []}
            onToggle={(i) => toggle("dietaryForm", i)}
          />

        </View>
      </ScrollView>

      {/* BUTTONS */}
      <View className="flex-row justify-around items-center my-4">
        <Pressable
          onPress={() => { !isPersisted ? router.back() : openModal("deleteProfile") }}
          disabled={deleting || isSelf}
          hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
          className="py-2 px-6 rounded-lg bg-white dark:bg-hsl15 active:border-primary"
        >
          {({ pressed }) => (
            <Tt className={`text-lg font-interSemiBold ${pressed ? 'text-primary' : 'text-hsl40 dark:text-hsl80'}`}>
              {!isPersisted ? "Cancel" : isSelf ? "Primary (Locked)" : deleting ? "Deleting…" : "Delete"}
            </Tt>
          )}
        </Pressable>

        <Pressable
          onPress={handleSaveProfile}
          disabled={saving}
          hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
          className="py-2 px-6 rounded-lg border bg-primary border-hsl90 dark:border-hsl20 active:bg-transparent active:border-primary"
        >
          {({ pressed }) => (
            <Tt className={`text-lg font-interSemiBold ${pressed ? 'text-primary' : 'text-white'}`}>
              {saving ? "Saving…" : "Save"}
            </Tt>
          )}
        </Pressable>
      </View>

      <ModalWrapper modalKey="deleteProfile">
        <ModalResponse modalKey="deleteProfile"
          isInput={false}
          message="Delete this Profile?"
          acceptLabel="Delete"
          onAccept={handleDeleteProfile}
        />
      </ModalWrapper>

    </Screen>
  );
}
