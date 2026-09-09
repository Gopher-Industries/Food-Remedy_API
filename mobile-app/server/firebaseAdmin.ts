import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function serviceAccountCredential() {
  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!rawServiceAccount) return applicationDefault();

  try {
    return cert(JSON.parse(rawServiceAccount));
  } catch {
    // Do not include configuration contents in an error or a log. The route
    // converts startup failures to a sanitized service-unavailable response.
    throw new Error("Firebase Admin credentials are invalid.");
  }
}

function getAdminApp(): App {
  return getApps()[0] ?? initializeApp({ credential: serviceAccountCredential() });
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminFirestore() {
  return getFirestore(getAdminApp());
}
