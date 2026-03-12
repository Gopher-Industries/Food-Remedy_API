// Profile Product Check tsx

import React from "react";
import { Pressable, View } from "react-native";
import IconGeneral from "../icons/IconGeneral";
import ProfileAvatar from "../ui/ProfileAvatar";
import Tt from "../ui/UIText";
import { NutritionalProfile } from "@/types/NutritionalProfile";
import { normaliseRetrictionsForProfileCheck } from "@/services/utils/normaliseRestrictionsForProfileCheck";
import { ProductSimple } from "@/types/ProductSimple";
import { useProfile } from "../providers/ProfileProvider";
import { router } from "expo-router";
import { getProfileLabel } from "@/services/utils/profileLabel";

interface ProfileProductCheckProps {
  profile: NutritionalProfile;
  product: ProductSimple | null;
  completeBound: number;
  showContains?: boolean;
}

/** --- Helpers --- */
const asList = (v?: string[] | null): string[] =>
  Array.isArray(v) ? v.filter(Boolean) : [];

const toLowerSet = (arr: string[]) => new Set(arr.map((s) => s.toLowerCase()));

const hit = (
  source: string[] | null | undefined,
  target: string[] | null | undefined,
) => {
  const src = asList(source);
  const tgtSet = toLowerSet(asList(target));
  return src.filter((x) => tgtSet.has(x.toLowerCase()));
};

/**
 * Get Dietary Hits
 * @param dietaryForm
 * @param ingredientAnalysis
 * @returns
 */
const getDietaryHits = (
  dietaryForm: string[],
  ingredientAnalysis: string[],
) => {
  const tags = toLowerSet(ingredientAnalysis);
  return dietaryForm.filter((f) => {
    const fL = f.toLowerCase();
    if (fL === "vegan") return tags.has("non-vegan");
    if (fL === "vegetarian") return tags.has("non-vegetarian");
    return false;
  });
};

/**
 * Handle onPress for Contains display
 * Opens modal or navigates to detailed allergen view
 * @param allergens - Array of allergen strings to display
 * @param profileName - Name of the profile for context
 */
export const handleContainsPress = (
  allergens: string[],
  profileName: string,
) => {
  if (!allergens || allergens.length === 0) return;

  console.log(
    `[ProfileProductCheck] Contains pressed for ${profileName}:`,
    allergens,
  );
};

const ProfileProductCheck: React.FC<ProfileProductCheckProps> = ({
  profile,
  product,
  completeBound,
  showContains = true,
}) => {
  const { profiles, startEdit, selfDisplayName } = useProfile();
  if (!product) return null;
  const missingInformation = product.completeness <= completeBound;

  const mapped = normaliseRetrictionsForProfileCheck(product);

  const additiveHits = hit(profile.additives, mapped.additives);
  const allergenHits = hit(profile.allergies, mapped.allergens);
  const intoleranceHits = hit(profile.intolerances, mapped.intolerances);

  const analysis = asList(product.ingredientAnalysis);
  const dietaryHits = getDietaryHits(profile.dietaryForm ?? [], analysis);

  const allHits = [
    ...additiveHits,
    ...allergenHits,
    ...intoleranceHits,
    ...dietaryHits,
  ];

  const isSafe = allHits.length === 0;

  /**
   * To edit, we set the edit-id in context and
   * navigate in.
   */
  const handleEditMember = (id: string) => {
    const existing = profiles.find((p) => p.profileId === id);
    if (!existing) return; // guard, though we should never hit this
    startEdit(existing);
    router.push("/(app)/membersEdit");
  };

  return (
    <Pressable
      onPress={() => handleEditMember(profile.profileId)}
      className="bg-white dark:bg-hsl15 rounded-lg px-4 py-4 shadow-sm my-2"
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-x-4">
          {profile.avatarUrl ? (
            <ProfileAvatar
              uri={profile.avatarUrl}
              name={
                profile.relationship === "Self" ? selfDisplayName : undefined
              }
              size={40}
            />
          ) : (
            <IconGeneral type="account" fill="hsl(0 0% 40%)" size={40} />
          )}
          <View>
            <Tt className="text-lg font-interMedium">
              {getProfileLabel(
                profile.relationship,
                profile.relationship === "Self" ? selfDisplayName : undefined,
              )}
            </Tt>
            <Tt className="font-interBold text-lg">
              {missingInformation ? "Check" : isSafe ? "Safe to Eat" : "Avoid"}
            </Tt>
          </View>
        </View>

        <IconGeneral
          size={30}
          type={missingInformation ? "warning" : isSafe ? "check" : "report"}
          fill={missingInformation ? "#FCA130" : isSafe ? "#16A34A" : "#DC2626"}
        />
      </View>

      {showContains && !isSafe && (
        <>
          <Pressable
            onPress={() =>
              handleContainsPress(
                allHits,
                getProfileLabel(
                  profile.relationship,
                  profile.relationship === "Self" ? selfDisplayName : undefined,
                ),
              )
            }
          >
            <Tt className="mt-1 font-interSemiBold">Contains</Tt>
          </Pressable>

          <View className="flex-row flex-wrap -m-1">
            {allHits.map((warn, idx) => (
              <View key={idx} className="m-1 px-3 py-1 rounded-full bg-primary">
                <Tt className="text-white font-interMedium">{warn}</Tt>
              </View>
            ))}
          </View>
        </>
      )}
    </Pressable>
  );
};

export default ProfileProductCheck;
