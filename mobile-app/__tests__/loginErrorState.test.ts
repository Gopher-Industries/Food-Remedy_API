import { handleLoginFieldChange } from "@/app/loginErrorState";

describe("handleLoginFieldChange", () => {
  it("clears the login error immediately when the email changes", () => {
    const setEmail = jest.fn();
    const setErrorMessage = jest.fn();

    handleLoginFieldChange("email", "new@example.com", setEmail, setErrorMessage);

    expect(setEmail).toHaveBeenCalledWith("new@example.com");
    expect(setErrorMessage).toHaveBeenCalledWith(null);
  });

  it("clears the login error immediately when the password changes", () => {
    const setPassword = jest.fn();
    const setErrorMessage = jest.fn();

    handleLoginFieldChange("password", "newPassword123", setPassword, setErrorMessage);

    expect(setPassword).toHaveBeenCalledWith("newPassword123");
    expect(setErrorMessage).toHaveBeenCalledWith(null);
  });
});
