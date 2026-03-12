import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { fdb } from "@/config/firebaseConfig";
import type { Status } from "@/types/Status";

export interface FeedbackPayload {
  message: string;
  email?: string | null;
  uid?: string | null;
  platform?: string | null;
  appVersion?: string | null;
}

export interface SubmitFeedbackResult extends Status {
  id?: string;
}

export default async function submitFeedback(payload: FeedbackPayload): Promise<SubmitFeedbackResult> {
  try {
    const docRef = await addDoc(collection(fdb, "FEEDBACK"), {
      message: payload.message,
      email: payload.email ?? null,
      uid: payload.uid ?? null,
      platform: payload.platform ?? null,
      appVersion: payload.appVersion ?? null,
      createdAt: serverTimestamp(),
    });

    return { success: true, id: docRef.id };
  } catch (error: any) {
    return {
      success: false,
      message: error?.message ?? "Failed to submit feedback",
    };
  }
}
