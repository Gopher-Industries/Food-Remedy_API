// Forgot Password Page tsx

import { useState } from "react";
import { Link } from "expo-router";
import { View, Image, ScrollView, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import Input from "@/components/ui/UIInput";
import Tt from "@/components/ui/UIText";
import { useTheme } from "@/theme";


export default function ForgotPasswordPage() {
  const [email, setEmail] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const theme = useTheme();


  // TODO: Update handle reset link to use backend

  /**
   * Handle Reset Link
   * @returns 
   */
  const handleResetLink = () => {
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
            />
          </View>

          <Tt className="text-xl font-bold text-center mt-8">Forgot Password?</Tt>

          <Tt className="text-center mb-4 italic text-balance text-sm">
            Enter your email address and we'll send you a link to reset your password.
          </Tt>


          {errorMessage && (
            <View className="bg-[#FCCACA] border border-primary rounded-md px-4 py-2 mt-8">
              <Tt className="text-center text-primary font-interSemiBold">{errorMessage}</Tt>
            </View>
          )}

          {/* Email Input */}
          <Input
            className="py-3 mt-8 "
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect={false}
          />



          {/* Reset Button */}
          <Pressable
            onPress={handleResetLink}
            className="bg-primary rounded-lg py-3 mt-4 border border-primary active:bg-transparent"
          >
            {({ pressed }) => (
              <Tt className={`text-center text-2xl font-interSemiBold 
              ${pressed ? 'text-primary' : 'text-white'}`}>Send Reset Link</Tt>
            )}
          </Pressable>

          <Tt className="font-interMedium mt-12 text-center">Go Back to <Link href='/login'
            className="text-primary font-interSemiBold active:underline">Login</Link>
          </Tt>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
