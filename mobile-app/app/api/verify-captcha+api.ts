import { createCaptchaVerificationHandler } from "@/server/captchaVerificationHandler";

/** POST /api/verify-captcha — server-side hCaptcha token verification. */
export async function POST(request: Request): Promise<Response> {
  return createCaptchaVerificationHandler({
    secret: process.env.HCAPTCHA_SECRET_KEY,
  })(request);
}
