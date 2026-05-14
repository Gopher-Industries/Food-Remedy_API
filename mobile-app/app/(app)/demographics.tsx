import React, { useState, useEffect } from "react";
import { ScrollView, View, Pressable } from "react-native";
import Tt from "@/components/ui/UIText";
import { router } from "expo-router";
import { useAuth } from "@/components/providers/AuthProvider";
import { useNotification } from "@/components/providers/NotificationProvider";
import { useProfile } from "@/components/providers/ProfileProvider";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import IconGeneral from "@/components/icons/IconGeneral";
import Header from "@/components/layout/Header";
import { color, spacing } from "@/app/design/token";

type Option = {
  label: string;
  value: string;
};

const ageBandOptions: Option[] = [
  { label: "18 - 25 years", value: "18-25" },
  { label: "26 - 35 years", value: "26-35" },
  { label: "36 - 50 years", value: "36-50" },
  { label: "51 - 70 years", value: "51-70" },
  { label: "71+ years", value: "71+" },
];

const sexOptions: Option[] = [
  { label: "Female", value: "female" },
  { label: "Male", value: "male" },
  { label: "Other / Prefer not to say", value: "other" },
];

const guardrailOptions: Option[] = [
  { label: "Relaxed", value: "relaxed" },
  { label: "Moderate", value: "moderate" },
  { label: "Strict", value: "strict" },
];

type SingleSelectFieldProps = {
  label: string;
  hint: string;
  options: Option[];
  selected: string;
  onSelect: (value: string) => void;
  darkMode: boolean;
};

const SingleSelectField = ({
  label,
  hint,
  options,
  selected,
  onSelect,
  darkMode,
}: SingleSelectFieldProps) => {
  return (
    <View className="mb-6">
      <Tt
        className={`text-lg font-interMedium mb-1 ${
          darkMode ? "text-hsl90" : "text-hsl25"
        }`}
      >
        {label}
      </Tt>

      <View className="flex-row flex-wrap gap-2 mt-1">
        {options.map((option) => {
          const isSelected = selected === option.value;

          return (
            <Pressable
              key={option.value}
              onPress={() => onSelect(option.value)}
              className={`px-4 py-2 rounded-full border ${
                isSelected
                  ? "bg-primary border-primary"
                  : darkMode
                  ? "bg-hsl20 border-hsl30"
                  : "bg-transparent border-hsl80"
              }`}
            >
              <Tt
                className={`font-interMedium text-sm ${
                  isSelected
                    ? "text-white"
                    : darkMode
                    ? "text-hsl90"
                    : "text-hsl30"
                }`}
              >
                {option.label}
              </Tt>
            </Pressable>
          );
        })}
      </View>

      <Tt
        className={`text-xs mt-2 leading-5 ${
          darkMode ? "text-hsl70" : "text-hsl50"
        }`}
      >
        {hint}
      </Tt>
    </View>
  );
};

const DemographicsForm = () => {
  const { user } = useAuth();
  const { addNotification } = useNotification();
  const { refresh } = useProfile();
  const { darkMode } = usePreferences();

  const [ageBand, setAgeBand] = useState<string>("36-50");
  const [sex, setSex] = useState<string>("female");
  const [guardrailLevel, setGuardrailLevel] = useState<string>("moderate");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchDemographics = async () => {
      if (!user?.uid) return;

      try {
        const { getUserProfile } = await import(
          "@/services/database/user/profiles"
        );

        const profile = await getUserProfile(user.uid, "demographics");

        if (profile) {
          if (profile.ageBand) setAgeBand(profile.ageBand);
          if (profile.sex) setSex(profile.sex);
          if (profile.guardrailLevel) setGuardrailLevel(profile.guardrailLevel);
        }
      } catch (err) {
        console.log("Could not fetch demographics:", err);
      }
    };

    fetchDemographics();
  }, [user?.uid]);

  const handleSave = async () => {
    if (!ageBand || !sex || !guardrailLevel) {
      addNotification("Please fill in all fields.", "e");
      return;
    }

    try {
      setSubmitting(true);

      if (!user?.uid) {
        throw new Error("User not authenticated");
      }

      const { upsertUserProfile } = await import(
        "@/services/database/user/profiles"
      );

      const demographicsData: any = {
        userId: user.uid,
        profileId: "demographics",
        ageBand,
        sex,
        guardrailLevel,
      };

      await upsertUserProfile(user.uid, "demographics", demographicsData);

      await refresh();
      addNotification("Demographics saved!", "s");
    } catch (err) {
      console.error(err);
      addNotification("Failed to save demographics.", "e");
    } finally {
      setSubmitting(false);
    }
  };

  const handleNext = () => {
    router.push("/(app)/nutritionalProfiles");
  };

  return (
    <View className={`flex-1 p-safe ${darkMode ? "bg-hsl15" : "bg-white"}`}>
      <Header />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="w-[95%] mx-auto mt-4 mb-6 flex-row items-center justify-between">
          <Pressable
            onPress={() => router.push("/(app)/nutritionalProfiles" as any)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="px-2 py-1"
          >
            {({ pressed }) => (
              <IconGeneral
                type="arrow-backward-ios"
                fill={pressed ? "#FF3F3F" : darkMode ? "#FFFFFF" : "hsl(0, 0%, 30%)"}
              />
            )}
          </Pressable>

          <Tt className={`text-xl font-interBold ${darkMode ? "text-white" : "text-hsl20"}`}>
            Your Health Profile
          </Tt>

          <View style={{ width: 24, height: 24 }} />
        </View>

        <View className="w-[95%] mx-auto">
          <Tt className={`text-sm font-interMedium mb-6 ${darkMode ? "text-hsl70" : "text-hsl50"}`}>
            Demographics shape reference portions and risk rules for
            recommendations.
          </Tt>

          <Tt className={`text-base font-interBold mb-4 uppercase tracking-wide ${darkMode ? "text-hsl90" : "text-hsl25"}`}>
            Demographics (for personalisation)
          </Tt>

          <SingleSelectField
            label="Age band"
            hint="Used to apply age-appropriate reference portions and nutrition guardrails in recommendations."
            options={ageBandOptions}
            selected={ageBand}
            onSelect={setAgeBand}
            darkMode={darkMode}
          />

          <SingleSelectField
            label="Sex (reference intakes)"
            hint="Used to align reference intake values where sex-specific nutrition guidance applies."
            options={sexOptions}
            selected={sex}
            onSelect={setSex}
            darkMode={darkMode}
          />

          <SingleSelectField
            label="Nutrition guardrail level"
            hint="Controls how strict sodium and sugar limits should be in recommendations."
            options={guardrailOptions}
            selected={guardrailLevel}
            onSelect={setGuardrailLevel}
            darkMode={darkMode}
          />

          <Pressable
            onPress={handleSave}
            disabled={submitting}
            hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
            className="py-3 px-4 my-4 rounded-lg border bg-primary border-hsl90 active:bg-transparent active:border-primary disabled:opacity-60"
          >
            {({ pressed }) => (
              <Tt
                className={`text-lg text-center font-interSemiBold ${
                  pressed ? "text-primary" : "text-white"
                }`}
              >
                {submitting ? "Saving…" : "Save"}
              </Tt>
            )}
          </Pressable>

          <Pressable
            onPress={handleNext}
            hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
            className={`mb-16 flex-row justify-between items-center py-3 px-4 rounded-lg border active:border-primary ${
              darkMode ? "bg-hsl20 border-hsl30" : "bg-white border-hsl90"
            }`}
          >
            {({ pressed }) => (
              <>
                <Tt
                  className={`text-lg font-interSemiBold flex-grow ${
                    pressed ? "text-primary" : darkMode ? "text-hsl90" : "text-hsl30"
                  }`}
                >
                  Next
                </Tt>

                <IconGeneral
                  type="arrow-forward-ios"
                  fill={pressed ? color.primary : darkMode ? "#FFFFFF" : color.iconDefault}
                  size={spacing.xl}
                />
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
};

export default DemographicsForm;