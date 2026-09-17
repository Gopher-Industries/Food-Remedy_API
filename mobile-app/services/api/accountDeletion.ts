import { auth } from "@/config/firebaseConfig";

export type AccountDeletionRequestResponse = {
  requestId: string;
  state: "accepted" | "in-progress" | "completed" | "retryable-failure";
  accepted: true;
  duplicate: boolean;
};

export async function requestAccountDeletion(): Promise<AccountDeletionRequestResponse> {
  const user = auth.currentUser;
  if (!user) throw new Error("User not authenticated");

  const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (!baseUrl) throw new Error("Account deletion service is unavailable");

  const token = await user.getIdToken(true);
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/account-deletion`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({}),
  });

  const body = (await response.json().catch(() => null)) as
    | AccountDeletionRequestResponse
    | { message?: string }
    | null;

  if (!response.ok) {
    throw new Error(body && "message" in body ? body.message : "Unable to request account deletion");
  }

  return body as AccountDeletionRequestResponse;
}