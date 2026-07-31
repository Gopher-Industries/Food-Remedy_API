// Firebase Config js
import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { Auth, getAuth, initializeAuth,getReactNativePersistence } from "firebase/auth";
import { Platform } from 'react-native';
import { Firestore, getFirestore } from "firebase/firestore";
import { FirebaseStorage, getStorage } from "firebase/storage";
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCF7i09IXwAkYE5VGd0rgXVz_axnN2iv3c",
  authDomain: "foodremedy-deakin.firebaseapp.com",
  projectId: "foodremedy-deakin",
  storageBucket: "foodremedy-deakin.firebasestorage.app",
  messagingSenderId: "314092160331",
  appId: "1:314092160331:web:13e345f7d961f31489d4ce",
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Initialize app (only once)
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Initialize Auth properly
let auth: Auth;

if (Platform.OS === "web") {
  // Web → default auth
  auth = getAuth(app);
} else {
  

  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage),
  });
}

// Firestore & Storage
const fdb = getFirestore(app);
const storage = getStorage(app);

// Exports
export { app as firebaseApp, auth, fdb, storage };