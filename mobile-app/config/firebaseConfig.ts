// Firebase Config js
import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { Auth, getAuth, initializeAuth } from "firebase/auth";
import { Platform } from 'react-native';
import { Firestore, getFirestore } from "firebase/firestore";
import { FirebaseStorage, getStorage } from "firebase/storage";
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};


const initializeFirebase = (): { firebaseApp: FirebaseApp, auth: Auth, fdb: Firestore, storage: FirebaseStorage } => {
  if (!getApps().length) {
    const app = initializeApp(firebaseConfig);
    const firestore = getFirestore(app);
    const storage = getStorage(app);
    let authentication: Auth;
    // On web, the react-native persistence module doesn't exist — use default getAuth.
    if (Platform.OS === 'web') {
      authentication = getAuth(app);
    } else {
      try {
        // Require the react-native persistence helper at runtime to avoid bundling it for web.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getReactNativePersistence } = require('firebase/auth/react-native');
        authentication = initializeAuth(app, {
          persistence: getReactNativePersistence(ReactNativeAsyncStorage)
        });
      } catch (e) {
        // Fallback to default auth if the native persistence helper isn't available.
        authentication = getAuth(app);
      }
    }
    return { firebaseApp: app, auth: authentication, fdb: firestore, storage };
  } else {
    const app = getApp();
    const firestore = getFirestore(app);
    const authentication = getAuth(app);
    const storage = getStorage(app);
    return { firebaseApp: app, auth: authentication, fdb: firestore, storage };
  }
};

console.log("THIS IS MY FIREBASE FILE");
console.log("ENV direct:", process.env.EXPO_PUBLIC_FIREBASE_API_KEY);
console.log("Firebase config runtime:", firebaseConfig);
const { firebaseApp, auth, fdb, storage } = initializeFirebase();

export { firebaseApp, auth, fdb, storage };
