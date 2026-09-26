// Forgot Password Page tsx

import { useEffect, useReducer, useState } from "react";
import { router } from "expo-router";
import { useDirtyForm } from "@/hooks/useDirtyForm";
import {
  View,
  Image,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import Input from "@/components/ui/UIInput";
import Tt from "@/components/ui/UIText";
import { useTheme } from "@/theme";
import { useAccessibilityAnnouncement } from "@/hooks/useAccessibilityAnnouncement";
import { sendPasswordReset } from "@/services";
import {
  createInitialForgotPasswordState,
  forgotPasswordMemoryState,
  forgotPasswordReducer,
  syncForgotPasswordMemory,
} from "@/app/forgotPasswordState";

export default function ForgotPasswordPage() {
  const [state, dispatch] = useReducer(
    forgotPasswordReducer,
    forgotPasswordMemoryState || createInitialForgotPasswordState()
  );
  const [submissionAttempt, setSubmissionAttempt] = useState(0);
  const theme = useTheme();
  const { markDirty, markClean, confirmLeave } = useDirtyForm();

  const statusAnnouncement = state.status === "error" && state.errorMessage
    ? `Error. ${state.errorMessage}`
    : state.status === "success"
      ? state.successMessage
      : null;

  useAccessibilityAnnouncement(statusAnnouncement, {
    announceOnAndroid: true,
    eventKey: submissionAttempt,
  });

  useEffect(() => {
    syncForgotPasswordMemory(state);
  }, [state]);

  const handleResetLink = async () => {
    if (state.status === "submitting") {
      return;
    }

    setSubmissionAttempt((attempt) => attempt + 1);
    const email = state.email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      dispatch({
        type: "SUBMIT_FAILURE",
        message: "Invalid Email. Please try again",
      });
      return;
    }

    dispatch({ type: "SUBMIT_STARTED" });

    try {
      await sendPasswordReset(email);
      markClean();
      dispatch({
        type: "SUBMIT_SUCCESS",
        message: "Reset link sent. Check your inbox.",
      });
    } catch (error) {
      console.error("[Forgot Password] Reset request failed:", error);
      dispatch({
        type: "SUBMIT_FAILURE",
        message: "We couldn't send a reset link. Please try again.",
      });
    }
  };

  const isSubmitting = state.status === "submitting";

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1"
    >
      <ScrollView
        className="flex-1 p-safe"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
        style={{ backgroundColor: theme.colors.background }}
      >
        <View className="justify-center flex-1 w-[90%] self-center">
          {/* Brand Image */}
          <View className="items-center">
            <Image
              source={require("../assets/images/FoodRemedyLogo.png")}
              className="w-[50%] aspect-[3/1] max-w-[300px] h-auto"
              resizeMode="contain"
              accessible
              accessibilityRole="image"
              accessibilityLabel="Food Remedy"
            />
          </View>

          <Tt
            className="text-xl font-bold text-center mt-8"
            accessibilityRole="header"
          >
            Forgot Password?
          </Tt>

          <Tt className="text-center mb-4 italic text-balance text-sm">
            Enter your email address and we&apos;ll send you a link to reset your
            password.
          </Tt>

          {state.status === "success" && state.successMessage && (
            <View
              className="bg-green-50 border border-emerald-500 rounded-md px-4 py-2 mt-8"
              accessible
              accessibilityRole="text"
              accessibilityLabel={state.successMessage}
            >
              <Tt className="text-center text-emerald-700 font-interSemiBold">
                {state.successMessage}
              </Tt>
            </View>
          )}

          {state.status === "error" && state.errorMessage && (
            <View
              className="bg-[#FCCACA] border border-primary rounded-md px-4 py-2 mt-8"
              accessible
              accessibilityRole="alert"
              accessibilityLabel={`Error. ${state.errorMessage}`}
            >
              <Tt className="text-center text-primary font-interSemiBold">
                {state.errorMessage}
              </Tt>
            </View>
          )}

          {/* Email Input */}
          <Input
            className="py-3 mt-8 "
            placeholder="Email"
            accessibilityLabel="Email address"
            textContentType="emailAddress"
            value={state.email}
            onChangeText={(nextEmail) => {
              dispatch({ type: "SET_EMAIL", email: nextEmail });
              markDirty();
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect={false}
          />

          {/* Reset Button */}
          <Pressable
            onPress={handleResetLink}
            accessibilityRole="button"
            accessibilityLabel="Send reset link"
            accessibilityHint="Emails you a link to reset your password"
            accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
            disabled={isSubmitting}
            className="bg-primary rounded-lg py-3 mt-4 border border-primary active:bg-transparent disabled:opacity-60"
          >
            {({ pressed }) => (
              <View className="flex-row items-center justify-center">
                {isSubmitting && (
                  <ActivityIndicator
                    size="small"
                    color={pressed ? "#FF3F3F" : "#FFFFFF"}
                    style={{ marginRight: 8 }}
                  />
                )}

                <Tt
                  className={`text-center text-2xl font-interSemiBold ${
                    pressed && !isSubmitting ? "text-primary" : "text-white"
                  }`}
                >
                  {isSubmitting ? "Sending..." : "Send Reset Link"}
                </Tt>
              </View>
            )}
          </Pressable>

          <View className="flex-row justify-center items-center mt-12">
            <Tt className="font-interMedium">Go Back to </Tt>
            <Pressable
              onPress={() => confirmLeave(() => router.replace("/login"))}
              accessibilityRole="link"
              accessibilityLabel="Login"
              accessibilityHint="Goes back to the login screen"
            >
              <Tt className="text-primary font-interSemiBold">Login</Tt>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
