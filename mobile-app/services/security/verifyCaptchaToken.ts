import { apiPost } from "@/services/apiClient";

type VerifyCaptchaResponse = {
  verified: boolean;
  message?: string;
};

export async function verifyCaptchaToken(token: string): Promise<void> {
  const response = await apiPost<VerifyCaptchaResponse>("/verify-captcha", {
    token,
  });

  if (!response.verified) {
    throw new Error(response.message || "Captcha verification failed.");
  }
}
