import React, { useState } from "react";
import {
  ScrollView,
  View,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import Tt from "@/components/ui/UIText";
import { router } from "expo-router";
import { useAuth } from "@/components/providers/AuthProvider";
import { useNotification } from "@/components/providers/NotificationProvider";

// Option Types
type Option = {
  label: string;
  value: string;
};

// Options 
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
};

const SingleSelectField = ({
  label,
  hint,
  options,
  selected,
  onSelect,
}: SingleSelectFieldProps) => {
  return (
    <View className="mb-6">
      <Tt className="text-lg font-interMedium text-hsl25 dark:text-hsl85 mb-1">
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
                  : "bg-transparent border-hsl80 dark:border-hsl30"
              }`}
            >
              <Tt
                className={`font-interMedium text-sm ${
                  isSelected
                    ? "text-white"
                    : "text-hsl30 dark:text-hsl90"
                }`}
              >
                {option.label}
              </Tt>
            </Pressable>
          );
        })}
      </View>

      <Tt className="text-xs text-hsl50 dark:text-hsl70 mt-2 leading-5">
        {hint}
      </Tt>
    </View>
  );
};

// Main Demographics Form 
const DemographicsForm = () => {
  const { user } = useAuth();
  const { addNotification } = useNotification();

  const [ageBand, setAgeBand] = useState<string>("36-50");
  const [sex, setSex] = useState<string>("female");
  const [guardrailLevel, setGuardrailLevel] = useState<string>("moderate");
  const [submitting, setSubmitting] = useState(false);

  const handleSave = async () => {
    if (!ageBand || !sex || !guardrailLevel) {
      addNotification("Please fill in all fields.", "e");
      return;
    }

    try {
      setSubmitting(true);

      const demographicsData = {
        ageBand,
        sex,
        guardrailLevel,
      };

      // TODO: Save information to Database

      console.log("Saving demographics:", demographicsData);

      addNotification("Demographics saved!", "s");
    } catch (err: any) {
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
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1"
    >
      <ScrollView keyboardShouldPersistTaps="handled">
        <View className="flex-1 w-[90%] self-center">

          {/* Header */}
          <Tt className="text-xl font-interBold text-center my-4">
            Your Health Profile
          </Tt>
          <Tt className="text-sm font-interMedium text-center text-hsl50 dark:text-hsl70 mb-6">
            Demographics shape reference portions and risk rules for recommendations.
          </Tt>

          {/* Demographics Section Header */}
          <Tt className="text-base font-interBold text-hsl25 dark:text-hsl85 mb-4 uppercase tracking-wide">
            Demographics (for personalisation)
          </Tt>

          {/* Age Band */}
          <SingleSelectField
            label="Age band"
            hint="Used to apply age-appropriate reference portions and nutrition guardrails in recommendations."
            options={ageBandOptions}
            selected={ageBand}
            onSelect={setAgeBand}
          />

          {/* Sex */}
          <SingleSelectField
            label="Sex (reference intakes)"
            hint="Used to align reference intake values where sex-specific nutrition guidance applies."
            options={sexOptions}
            selected={sex}
            onSelect={setSex}
          />

          {/* Guardrail Level */}
          <SingleSelectField
            label="Nutrition guardrail level"
            hint="Controls how strict sodium and sugar limits should be in recommendations."
            options={guardrailOptions}
            selected={guardrailLevel}
            onSelect={setGuardrailLevel}
          />

          {/* Save Button */}
          <Pressable
            onPress={handleSave}
            disabled={submitting}
            className="w-[90%] self-center py-3 px-4 my-4 rounded-lg border bg-primary border-hsl90 dark:border-hsl20 active:bg-transparent active:border-primary disabled:opacity-60"
          >
            {({ pressed }) => (
              <Tt className={`text-lg text-center font-interSemiBold ${pressed ? "text-primary" : "text-white"}`}>
                {submitting ? "Saving…" : "Save"}
              </Tt>
            )}
          </Pressable>

          {/* Next Button */}
          <Pressable
            onPress={handleNext}
            className="w-[90%] self-center py-3 px-4 mb-8 rounded-lg border border-primary active:bg-primary"
          >
            {({ pressed }) => (
              <Tt className={`text-lg text-center font-interSemiBold ${pressed ? "text-white" : "text-primary"}`}>
                Next
              </Tt>
            )}
          </Pressable>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default DemographicsForm;
