export type LoginField = "email" | "password";

export function handleLoginFieldChange(
  field: LoginField,
  value: string,
  setFieldValue: (nextValue: string) => void,
  setErrorMessage: (nextError: string | null) => void,
) {
  if (field !== "email" && field !== "password") {
    return;
  }

  setFieldValue(value);
  setErrorMessage(null);
}
