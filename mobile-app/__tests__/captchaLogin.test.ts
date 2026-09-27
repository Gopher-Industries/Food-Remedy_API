import { signInWithCaptchaGate } from "@/services/authentication/captchaLogin";
import { CaptchaVerificationError } from "@/services/security/verifyCaptchaToken";

describe("BE072 CAPTCHA-gated Firebase login", () => {
  it("invokes Firebase sign-in only after CAPTCHA verification succeeds", async () => {
    const verifyCaptcha = jest.fn().mockResolvedValue(undefined);
    const signIn = jest.fn().mockResolvedValue("");

    await expect(signInWithCaptchaGate({
      captchaEnabled: true,
      captchaToken: "client-token",
      email: "user@example.com",
      password: "firebase-password",
      verifyCaptcha,
      signIn,
    })).resolves.toBe("");

    expect(verifyCaptcha).toHaveBeenCalledWith("client-token");
    expect(signIn).toHaveBeenCalledWith("user@example.com", "firebase-password");
    expect(verifyCaptcha.mock.invocationCallOrder[0]).toBeLessThan(signIn.mock.invocationCallOrder[0]);
  });

  it.each([
    ["rejected token", new CaptchaVerificationError()],
    ["provider timeout", new Error("timeout")],
    ["provider failure", new Error("unavailable")],
  ])("blocks Firebase sign-in after %s", async (_name, failure) => {
    const verifyCaptcha = jest.fn().mockRejectedValue(failure);
    const signIn = jest.fn();

    await expect(signInWithCaptchaGate({
      captchaEnabled: true,
      captchaToken: "client-token",
      email: "user@example.com",
      password: "firebase-password",
      verifyCaptcha,
      signIn,
    })).rejects.toBe(failure);
    expect(signIn).not.toHaveBeenCalled();
  });

  it("blocks Firebase sign-in when CAPTCHA is enabled but no token is supplied", async () => {
    const signIn = jest.fn();
    await expect(signInWithCaptchaGate({
      captchaEnabled: true,
      email: "user@example.com",
      password: "firebase-password",
      signIn,
    })).rejects.toBeInstanceOf(CaptchaVerificationError);
    expect(signIn).not.toHaveBeenCalled();
  });

  it("preserves CAPTCHA-disabled development login behaviour", async () => {
    const verifyCaptcha = jest.fn();
    const signIn = jest.fn().mockResolvedValue("");
    await expect(signInWithCaptchaGate({
      captchaEnabled: false,
      email: "dev@example.com",
      password: "firebase-password",
      verifyCaptcha,
      signIn,
    })).resolves.toBe("");
    expect(verifyCaptcha).not.toHaveBeenCalled();
    expect(signIn).toHaveBeenCalledTimes(1);
  });
});
