import { apiPost } from "@/services/apiClient";

export class CaptchaVerificationError extends Error {
  constructor() {
    super("Captcha verification failed. Please try again.");
    this.name = "CaptchaVerificationError";
  }
}

/** Sends only the provider token to the server and accepts a strict success response. */
export async function verifyCaptchaToken(token: string): Promise<void> {
  try {
    const response = await apiPost<{ verified?: unknown }>("/api/verify-captcha", { token });
    if (response?.verified !== true) throw new CaptchaVerificationError();
  } catch {
    throw new CaptchaVerificationError();
  }
}
