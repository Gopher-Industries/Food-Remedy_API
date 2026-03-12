// Feedback Page

import { View, ScrollView, Pressable, Platform } from "react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import Tt from "@/components/ui/UIText";
import Input from "@/components/ui/UIInput";
import Header from "@/components/layout/Header";
import Screen from "@/components/layout/Screen";
import { useNotification } from "@/components/providers/NotificationProvider";
import IconGeneral from "@/components/icons/IconGeneral";
import { color } from "@/app/design/token";
import submitFeedback from "@/services/database/feedback/submitFeedback";
import { auth } from "@/config/firebaseConfig";
import { useAuthUserId } from "@/hooks/useAuthUserId";
import { usePreferences } from "@/components/providers/PreferencesProvider";

export default function FeedbackPage() {
  const router = useRouter();
  const { addNotification } = useNotification();
  const [feedback, setFeedback] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const uid = useAuthUserId();
  const navigateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { darkMode } = usePreferences();

  const appVersion = useMemo(() => {
    return (
      Constants.expoConfig?.version ??
      (Constants as any).manifest?.version ??
      (Constants as any).nativeAppVersion ??
      "unknown"
    );
  }, []);

  const MAX_FEEDBACK_LENGTH = 500;

  const sanitizeFeedback = (input: string) => {
    return input
      .replace(/[\u0000-\u001F\u007F]/g, "") // strip control chars
      .replace(/\s+/g, " ") // collapse whitespace
      .trim();
  };

  useEffect(() => {
    return () => {
      if (navigateTimerRef.current) {
        clearTimeout(navigateTimerRef.current);
      }
    };
  }, []);

  /**
   * Handle Submit Feedback
   * @returns
   */
  const handleSubmitFeedback = async () => {
    const validFeedback = sanitizeFeedback(feedback);

    if (!validFeedback) {
      addNotification("Please enter valid feedback", "e");
      return;
    }

    if (validFeedback.length > MAX_FEEDBACK_LENGTH) {
      addNotification(`Feedback must be ${MAX_FEEDBACK_LENGTH} characters or less`, "e");
      return;
    }

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    const result = await submitFeedback({
      message: validFeedback,
      email: auth.currentUser?.email ?? null,
      uid: uid ?? null,
      platform: Platform.OS,
      appVersion,
    });
    setIsSubmitting(false);

    if (!result.success) {
      addNotification(result.message ?? "Submit failed", "e");
      return;
    }

    addNotification("Thanks for your feedback!", "s");
    setFeedback("");
    navigateTimerRef.current = setTimeout(() => {
      router.back();
    }, 800);
  };

  return (
    <Screen className="p-safe">
      <Header />

      <View className="w-[92%] mx-auto">
        <View className="flex-row items-center justify-between mb-3">
          <Pressable
            onPress={() => router.back()}
            className="flex-row justify-center items-center self-end px-2 py-1"
          >
            {({ pressed }) => (
              <IconGeneral
                type="arrow-backward-ios"
                fill={pressed ? color.primary : color.iconDefault}
              />
            )}
          </Pressable>
          <Tt className="font-interBold text-xl">Feedback</Tt>
          <View style={{ width: 24, height: 24 }} />
        </View>
      </View>

      <ScrollView>
        <View className="w-[92%] mx-auto">
          <Tt className="text-base my-4 text-center">
            We value your feedback. Please describe your issue or suggestions
            below.
          </Tt>

          {/* Feedback Input */}
          <Input
            value={feedback}
            onChangeText={setFeedback}
            placeholder="Feedback...."
            multiline
            textAlignVertical="top"
            placeholderTextColor={darkMode ? "#D1D5DB" : "#F5F5F5"}
            maxLength={MAX_FEEDBACK_LENGTH}
            className="h-44 my-2 py-4 rounded-2xl"
            style={{
              backgroundColor: darkMode ? "#2F333A" : "#C9C9C9",
              borderColor: darkMode ? "#4B505A" : "#2B2B2B",
              borderWidth: 1,
              color: "#FFFFFF",
            }}
          />
          <Tt className="text-xs text-right mt-1" style={{ color: darkMode ? "#9CA3AF" : "#6B7280" }}>
            {feedback.length}/{MAX_FEEDBACK_LENGTH}
          </Tt>
        </View>
      </ScrollView>

      {/* Submit Button */}
      <View className="w-[92%] mx-auto">
        <Pressable
          onPress={handleSubmitFeedback}
          disabled={isSubmitting}
          hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
          className={`w-full self-center py-4 px-4 my-6 rounded-lg border ${isSubmitting ? "bg-red-300 border-red-300" : "bg-red-600 border-red-600 active:bg-transparent active:border-red-600"}`}
        >
          {({ pressed }) => (
            <Tt
              className={`text-lg text-center font-interSemiBold ${pressed && !isSubmitting ? "text-red-600" : "text-white"}`}
            >
              {isSubmitting ? "Submitting..." : "Submit"}
            </Tt>
          )}
        </Pressable>
      </View>
    </Screen>
  );
}
