import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { fdb } from "@/config/firebaseConfig";
import type { Status } from "@/types/Status";
import { getRequestId, safeLog } from "@/services/backend/safeErrors";

export interface FeedbackPayload {
  message: string;
  email?: string | null;
  uid?: string | null;
  platform?: string | null;
  appVersion?: string | null;
}

export interface SubmitFeedbackResult extends Status {
  id?: string;
  error?: "FEEDBACK_SUBMISSION_FAILED";
  requestId?: string;
}

export default async function submitFeedback(payload: FeedbackPayload): Promise<SubmitFeedbackResult> {
  const requestId = getRequestId();
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
    safeLog("error", "feedback_submission.failed", { requestId, error });
    return {
      success: false,
      error: "FEEDBACK_SUBMISSION_FAILED",
      message: "Unable to submit feedback. Please try again.",
      requestId,
    };
  }
}
