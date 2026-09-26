// Forgot Password Page tsx

import { useState } from "react";
import { router } from "expo-router";
import { useDirtyForm } from "@/hooks/useDirtyForm";
import { View, Image, ScrollView, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import Input from "@/components/ui/UIInput";
import Tt from "@/components/ui/UIText";
import { useTheme } from "@/theme";
import { useAccessibilityAnnouncement } from "@/hooks/useAccessibilityAnnouncement";


export default function ForgotPasswordPage() {
  const [email, setEmail] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [submissionAttempt, setSubmissionAttempt] = useState(0);
  const theme = useTheme();

  useAccessibilityAnnouncement(
    errorMessage ? `Error. ${errorMessage}` : null,
    { announceOnAndroid: true, eventKey: submissionAttempt }
  );
  const { markDirty, confirmLeave } = useDirtyForm();


  // TODO: Update handle reset link to use backend

  /**
   * Handle Reset Link
   * @returns 
   */
  const handleResetLink = () => {
    setSubmissionAttempt((attempt) => attempt + 1);
    setErrorMessage("");

    const emailRegex = /\S+@\S+\.\S+/;

    if (!emailRegex.test(email)) {
      setErrorMessage("Invalid Email. Please try again");
      return;
    }

    setErrorMessage("");
    console.log("Send reset link to:", email);
  };


  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1"
    >
      <ScrollView
        className="flex-1 p-safe"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
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
            Enter your email address and we&apos;ll send you a link to reset your password.
          </Tt>


          {errorMessage ? (
            <View
              className="bg-[#FCCACA] border border-primary rounded-md px-4 py-2 mt-8"
              accessible
              accessibilityRole="alert"
              accessibilityLabel={`Error. ${errorMessage}`}
            >
              <Tt className="text-center text-primary font-interSemiBold">{errorMessage}</Tt>
            </View>
          ) : null}

          {/* Email Input */}
          <Input
            className="py-3 mt-8 "
            placeholder="Email"
            accessibilityLabel="Email address"
            textContentType="emailAddress"
            value={email}
            onChangeText={(text) => { setEmail(text); markDirty(); }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect={false}
          />



          {/* Reset Button */}
          <Pressable
            onPress={handleResetLink}
            className="bg-primary rounded-lg py-3 mt-4 border border-primary active:bg-transparent"
            accessibilityRole="button"
            accessibilityLabel="Send reset link"
            accessibilityHint="Emails you a link to reset your password"
          >
            {({ pressed }) => (
              <Tt className={`text-center text-2xl font-interSemiBold 
              ${pressed ? 'text-primary' : 'text-white'}`}>Send Reset Link</Tt>
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
