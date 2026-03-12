// mobile-app/components/providers/AuthProvider.tsx
// Auth Provider 

import { createContext, ReactNode, useContext, useEffect, useState, } from "react";
import { signInWithEmail, signOutUser } from "@/services";
import { useNotification } from "./NotificationProvider";
import { onAuthStateChanged, sendEmailVerification, User } from "firebase/auth";
import { auth } from "@/config/firebaseConfig";
import { router } from "expo-router";

type AuthContextType = {
  user: User | null;
  loading: boolean;
  emailVerified: boolean;

  handleSignIn: (email: string, password: string) => Promise<string>;
  handleSignOut: () => Promise<void>;
  resendEmailVerification: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const { addNotification } = useNotification();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [emailVerified, setEmailVerified] = useState(false);


  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
      if (user) {
        setEmailVerified(user.emailVerified);
      } else {
        setEmailVerified(false);
      }

    });

    return () => unsubscribe();
  }, []);

  /**
   * Resend Email Verification
   */
  const resendEmailVerification = async () => {
    if (!user) { addNotification("User Account Not Authenticated", "s"); return };

    try {
      await sendEmailVerification(user);
      addNotification(`Verification Email Sent. For email ${user.email}`, "s");
    } catch (error) {
      addNotification("Error sending verification", "e");
      console.error('Error sending verification email:', error);
    }
  };


  /**
   * Handle Sign In
   * @param email 
   * @param password 
   * @returns 
   */
  const handleSignIn = async (email: string, password: string): Promise<string> => {
    const validEmail = email.trim().toLowerCase();
    const validPassword = password.trim();

    if (!validEmail || !validPassword) {
      return "Enter a valid Email and Password";
    }

    try {
      const status = await signInWithEmail(validEmail, validPassword);
      if ("success" in status && !status.success) {
        return status.message!;
      }

      router.replace("/(app)/(tabs)");
      return "";
    } catch (error: any) {
      console.error("Error signing in: ", error)
      return "Unexpected Error Occured";
    }
  };

  /**
   * Sign Out
   */
  const handleSignOut = async () => {
    try {
      await signOutUser();
    } catch (error) {
      addNotification("Error Signout Out", "e");
      console.error("Error Signing Out: ", error)
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user, loading, emailVerified,
        handleSignIn, handleSignOut, resendEmailVerification,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};


export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
};
