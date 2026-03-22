// Login Page tsx

import { useState } from "react";
import {
  View,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from "react-native";
import { Link } from "expo-router";
import Input from "@/components/ui/UIInput";
import IconGeneral from "@/components/icons/IconGeneral";
import Tt from "@/components/ui/UIText";
import { Image } from "react-native";
import { useAuth } from "@/components/providers/AuthProvider";
import { sendPasswordReset, signInWithEmail } from "@/services";
import { useNotification } from "@/components/providers/NotificationProvider";
import ModalWrapper from "@/components/modals/ModalAWrapper";
import ModalResponse from "@/components/modals/ModalResponse";
import { useModalManager } from "@/components/providers/ModalManagerProvider";
import { color } from "@/app/design/token";
import CaptchaModal from "@/components/security/CaptchaModal";
import { CAPTCHA_ENABLED, HCAPTCHA_SITE_KEY } from "@/config/captchaConfig";
import { useTheme } from "@/theme";


export default function LoginPage() {
  const { loading, handleSignIn } = useAuth();
  const { addNotification } = useNotification();
  const { openModal } = useModalManager();
  const theme = useTheme();
  const [showPassword, setShowPassword] = useState<boolean>(true);
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [loadingLogin, setLoadingLogin] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [captchaVisible, setCaptchaVisible] = useState<boolean>(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  /**
   * Handle Log In
   * @returns
   */
  const proceedLogin = async () => {
    try {
      setLoadingLogin(true);
      setErrorMessage("");

      const response = await handleSignIn(email, password);

      if (response.trim().length > 0) {
        setErrorMessage(response);
        // Require captcha again for the next attempt
        setCaptchaToken(null);
      }
    } catch (error) {
      console.error("Error Logging in: ", error);
      addNotification("Login Error Occured", "e");
    } finally {
      setLoadingLogin(false);
    }
  };

  const handleLogin = async () => {
    // Only show captcha on user-initiated login
    setErrorMessage("");
    if (CAPTCHA_ENABLED && !captchaToken) {
      setCaptchaVisible(true);
      return;
    }
    await proceedLogin();
  };

  const onCaptchaVerified = async (token: string) => {
    console.log('[Login] Captcha verified token:', token);
    setCaptchaToken(token);
    setCaptchaVisible(false);
    addNotification('Captcha verified', 's');
    // Note: Proper security requires server-side verification of the token
    // Proceed with login after captcha success
    await proceedLogin();
  };

  /**
   * Send Password Reset Email
   */
  const resetPasswordWithEmail = async (email: string) => {
    console.log("[PASSWORD RESET] Function called with:", email);
    
    const validEmail = email.trim().toLowerCase();

    // Check if email is empty
    if (!validEmail) {
      console.log("[PASSWORD RESET] Email is empty");
      Alert.alert("Invalid Email", "Please enter an email address");
      throw new Error("Empty email");
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(validEmail)) {
      console.log("[PASSWORD RESET] Invalid email format:", validEmail);
      Alert.alert("Invalid Email", "Please enter a valid email address (e.g., user@example.com)");
      throw new Error("Invalid email format");
    }

    console.log("[PASSWORD RESET] Email is valid, sending reset email...");
    Alert.alert("Sending...", "Please wait while we send the reset email...");
    
    try {
      await sendPasswordReset(validEmail);
      console.log("[PASSWORD RESET] Email sent successfully!");
      Alert.alert("Success!", "Password reset email has been sent. Check your inbox.");
    } catch (error) {
      console.error("[PASSWORD RESET] Error:", error);
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      Alert.alert("Error", `Failed to send email: ${errorMsg}`);
      throw error;
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
          {/* Brand Image */}
          <View className="items-center">
            <Image
              source={require("../assets/images/FoodRemedyLogo.png")}
              className="w-[50%] aspect-[3/1] max-w-[300px] h-auto"
              resizeMode="contain"
            />
          </View>

          {loading || loadingLogin ? (
            <View className="mt-40">
              <ActivityIndicator size="large" color="#FF3F3F" />
            </View>
          ) : (
            <>
              {errorMessage && (
                <View className="bg-[#FCCACA] border border-primary rounded-md px-4 py-2 mt-8">
                  <Tt className="text-center text-primary font-interSemiBold">
                    {errorMessage}
                  </Tt>
                </View>
              )}

              {/* Email Input */}
              <Input
                className="py-3 mt-8 "
                placeholder="Email or Username"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
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

              {/* Login Button */}
              <Pressable
                onPress={handleLogin}
                className="bg-primary rounded-lg py-3 mt-4 border border-primary active:bg-transparent"
              >
                {({ pressed }) => (
                  <Tt
                    className={`text-center text-2xl font-interSemiBold  ${pressed ? "text-primary" : "text-white"}`}
                  >
                    Login
                  </Tt>
                )}
              </Pressable>

              <Tt className="text-sm mt-12 text-center">
                Don't have an account?{" "}
                <Link
                  href="/register"
                  className="text-primary font-interSemiBold active:underline"
                >
                  Create Account
                </Link>
              </Tt>

              <Pressable
                onPress={() => openModal("resetEmail")}
                style={{ marginTop: 30 }}
              >
                <Tt className="text-sm text-center">
                  
                  <Tt>Forgot Password</Tt>
                </Tt>
              </Pressable>
            </>
          )}

          {loading && (
            <View className="mt-40">
              <ActivityIndicator size="large" color={color.primary} />
            </View>
          )}
        </View>

        <ModalWrapper modalKey="resetEmail">
          <ModalResponse
            modalKey="resetEmail"
            isInput={true}
            message="We will send a link to your email to reset your password. Enter account email address:"
            acceptLabel="Send Email"
            onAccept={(email) => {
              return resetPasswordWithEmail(email);
            }}
          />
        </ModalWrapper>
      </KeyboardAvoidingView>

      {/* Captcha Modal */}
      <CaptchaModal
        visible={CAPTCHA_ENABLED && captchaVisible}
        siteKey={HCAPTCHA_SITE_KEY}
        onVerified={onCaptchaVerified}
        onCancel={() => {
          setCaptchaVisible(false);
          setCaptchaToken(null);
          setLoadingLogin(false);
          setErrorMessage("Please complete the captcha to continue");
        }}
      />
    </ScrollView>
  );
}
