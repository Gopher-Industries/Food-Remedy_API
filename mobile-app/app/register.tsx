// Register Page tsx

import React, { useState } from "react";
import {
  View,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  Pressable,
} from "react-native";
import { Link, useRouter } from "expo-router";
import Input from "@/components/ui/UIInput";
import IconGeneral from "@/components/icons/IconGeneral";
import Tt from "@/components/ui/UIText";
import { useNotification } from "@/components/providers/NotificationProvider";
import { registerWithEmail } from "@/services";
import { color } from "@/app/design/token";
import { useTheme } from "@/theme";

export default function RegisterPage() {
  const router = useRouter();
  const { addNotification } = useNotification();
  const theme = useTheme();
  const [firstName, setFirstName] = useState<string>("");
  const [lastName, setLastName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(true);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  /**
   * Handle Register account
   * @returns
   */
  const handleRegister = async () => {
    setErrorMessage("");
    const validFirstName = firstName.trim();
    const validLastName = lastName.trim();
    const validEmail = email.trim().toLowerCase();
    const validPassword = password.trim();
    const validConfirmPassword = confirmPassword.trim();

    if (!validFirstName) {
      setErrorMessage("Enter a valid first name");
      return;
    }
    if (!validLastName) {
      setErrorMessage("Enter a valid last name");
      return;
    }
    if (!validEmail) {
      setErrorMessage("Enter a valid email");
      return;
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(validEmail)) {
      setErrorMessage("Enter a valid email format");
      return;
    }
    if (!validPassword) {
      setErrorMessage("Enter a valid password");
      return;
    }
    if (validPassword.length < 8) {
      setErrorMessage("Password must be at least 8 characters long.");
      return;
    }
    if (validPassword !== validConfirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const status = await registerWithEmail(
        validFirstName,
        validLastName,
        validEmail,
        validPassword
      );
      if ("success" in status && !status.success) {
        setErrorMessage(status.message!);
        return;
      }

      addNotification("Registered Account!", "s");
      router.replace("/login");
    } catch (error: any) {
      console.error("Error logging in: ", error);
      setErrorMessage("Unknown Error Occured");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      className="flex-1 p-safe"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
      style={{ backgroundColor: theme.colors.background }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <View className="justify-center flex-1 w-[90%] self-center">
          <View className="items-center">
            <Image
              source={require("../assets/images/FoodRemedyLogo.png")}
              className="w-[50%] aspect-[3/1] max-w-[300px] h-auto"
              resizeMode="contain"
            />
          </View>

          {!loading && (
            <>
              {errorMessage && (
                <View className="bg-[#FCCACA] border border-primary rounded-md px-4 py-2 mt-8">
                  <Tt className="text-center text-primary font-interSemiBold">
                    {errorMessage}
                  </Tt>
                </View>
              )}

              {/* First Name Input */}
              <Input
                className="py-3 mt-8"
                placeholder="First Name"
                value={firstName}
                onChangeText={setFirstName}
                keyboardType="default"
                autoCapitalize="none"
                autoComplete="off"
                autoCorrect={false}
              />

              {/* Last Name Input */}
              <Input
                className="py-3 mt-4"
                placeholder="Last Name"
                value={lastName}
                onChangeText={setLastName}
                keyboardType="default"
                autoCapitalize="none"
                autoComplete="off"
                autoCorrect={false}
              />

              {/* Email Input */}
              <Input
                className="py-3 mt-4"
                placeholder="Email"
                value={email}
                onChangeText={setEmail}
                keyboardType="default"
                autoCapitalize="none"
                autoComplete="off"
                autoCorrect={false}
              />

              {/* Password Input */}
              <View className="relative mt-4">
                <Input
                  className="py-3"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  secureTextEntry={showPassword}
                  autoCapitalize="none"
                  autoComplete="off"
                  autoCorrect={false}
                />

                <Pressable
                  onPress={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2"
                  style={({ pressed }) => [
                    { borderColor: pressed ? "#FF3EB5" : "hsl(0 0% 13%)" },
                  ]}
                  hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                >
                  {({ pressed }) => (
                    <IconGeneral
                      type={showPassword ? "visibility" : "visibility-off"}
                      fill={pressed ? color.primary : "hsl(0 0% 70%)}"}
                    />
                  )}
                </Pressable>
              </View>

              {/* Confirm Password Input */}
              <View className="relative mt-4">
                <Input
                  className="py-3"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm Password"
                  secureTextEntry={showConfirmPassword}
                  autoCapitalize="none"
                  autoComplete="off"
                  autoCorrect={false}
                />

                <Pressable
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2"
                  style={({ pressed }) => [
                    { borderColor: pressed ? "#FF3EB5" : "hsl(0 0% 13%)" },
                  ]}
                  hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                >
                  {({ pressed }) => (
                    <IconGeneral
                      type={
                        showConfirmPassword ? "visibility" : "visibility-off"
                      }
                      fill={pressed ? color.primary : "hsl(0 0% 70%)}"}
                    />
                  )}
                </Pressable>
              </View>

              {/* Register Button */}
              <Pressable
                onPress={handleRegister}
                className="bg-primary rounded-lg py-3 mt-8 border border-primary active:bg-transparent"
              >
                {({ pressed }) => (
                  <Tt
                    className={`text-center text-2xl font-interSemiBold 
              ${pressed ? "text-primary" : "text-white"}`}
                  >
                    Register
                  </Tt>
                )}
              </Pressable>

              {/* Navigating to login */}
              <Tt className="text-sm mt-12 text-center">
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="text-primary font-interSemiBold active:underline"
                >
                  Log in
                </Link>
              </Tt>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </ScrollView>
  );
}
