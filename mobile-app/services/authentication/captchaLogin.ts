import { CaptchaVerificationError, verifyCaptchaToken } from "@/services/security/verifyCaptchaToken";

export interface CaptchaLoginOptions {
  captchaEnabled: boolean;
  captchaToken?: string;
  email: string;
  password: string;
  signIn: (email: string, password: string) => Promise<string>;
  verifyCaptcha?: (token: string) => Promise<void>;
}

/** Enforces verification ordering without moving Firebase credentials to the backend. */
export async function signInWithCaptchaGate(options: CaptchaLoginOptions): Promise<string> {
  if (options.captchaEnabled) {
    if (!options.captchaToken) throw new CaptchaVerificationError();
    await (options.verifyCaptcha ?? verifyCaptchaToken)(options.captchaToken);
  }
  return options.signIn(options.email, options.password);
}
