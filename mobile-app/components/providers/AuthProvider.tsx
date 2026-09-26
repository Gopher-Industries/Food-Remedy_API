// mobile-app/components/providers/AuthProvider.tsx
// Auth Provider 

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { signInWithEmail, signOutUser } from "@/services";
import { useNotification } from "./NotificationProvider";
import { onAuthStateChanged, sendEmailVerification, User } from "firebase/auth";
import { auth } from "@/config/firebaseConfig";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { syncProfiles } from "../../services/sync/syncProfilesServices";



export type SessionType = "restoring" | "unauthenticated" | "guest" | "authenticated";

const SESSION_STORAGE_KEY = "foodremedy.session.type";

type AuthContextType = {
  user: User | null;
  loading: boolean;
  emailVerified: boolean;
  sessionType: SessionType;
  pendingRoute: string | null;

  handleSignIn: (email: string, password: string) => Promise<string>;
  handleSignOut: () => Promise<void>;
  resendEmailVerification: () => void;
  enterGuestMode: () => Promise<void>;
  setPendingRoute: (route: string) => void;
  clearPendingRoute: () => void;
  completeAuthentication: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const { addNotification } = useNotification();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [emailVerified, setEmailVerified] = useState(false);
  const [sessionType, setSessionType] = useState<SessionType>("restoring");
  const [pendingRoute, setPendingRouteState] = useState<string | null>(null);


  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      const authenticatedUser = user && !user.isAnonymous ? user : null;
      setUser(authenticatedUser);
      if (user && !user.isAnonymous) {
        setEmailVerified(user.emailVerified);
        setSessionType("authenticated");
        await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
      } else {
        setEmailVerified(false);
        const persistedSession = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
        setSessionType(persistedSession === "guest" ? "guest" : "unauthenticated");
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
  if (sessionType === "authenticated" && user?.uid) {
    syncProfiles(user.uid);
  }
}, [sessionType, user]);

  const enterGuestMode = useCallback(async () => {
    await AsyncStorage.setItem(SESSION_STORAGE_KEY, "guest");
    setPendingRouteState(null);
    setSessionType("guest");
  }, []);

  const setPendingRoute = useCallback((route: string) => {
    setPendingRouteState(route);
  }, []);

  const clearPendingRoute = useCallback(() => {
    setPendingRouteState(null);
  }, []);

  const completeAuthentication = useCallback(async () => {
    await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
    setSessionType("authenticated");
    const destination = pendingRoute;
    setPendingRouteState(null);
    router.replace((destination || "/(app)/(tabs)") as never);
  }, [pendingRoute]);

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

      await completeAuthentication();
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
      await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
      setPendingRouteState(null);
      setSessionType("unauthenticated");
      router.replace("/login");
    } catch (error) {
      addNotification("Error Signout Out", "e");
      console.error("Error Signing Out: ", error)
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user, loading, emailVerified, sessionType, pendingRoute,
        handleSignIn, handleSignOut, resendEmailVerification,
        enterGuestMode, setPendingRoute, clearPendingRoute, completeAuthentication,
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
