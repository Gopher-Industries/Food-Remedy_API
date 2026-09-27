export type ForgotPasswordStatus = "idle" | "submitting" | "success" | "error";

export interface ForgotPasswordState {
  email: string;
  status: ForgotPasswordStatus;
  errorMessage: string | null;
  successMessage: string | null;
  submittedAt: number | null;
}

export type ForgotPasswordAction =
  | { type: "SET_EMAIL"; email: string }
  | { type: "SUBMIT_STARTED" }
  | { type: "SUBMIT_SUCCESS"; message?: string }
  | { type: "SUBMIT_FAILURE"; message: string }
  | { type: "CLEAR_EMAIL" }
  | { type: "RESET_TO_IDLE" };

export const createInitialForgotPasswordState = (
  email = ""
): ForgotPasswordState => ({
  email,
  status: "idle",
  errorMessage: null,
  successMessage: null,
  submittedAt: null,
});

export let forgotPasswordMemoryState = createInitialForgotPasswordState();

export const syncForgotPasswordMemory = (state: ForgotPasswordState) => {
  forgotPasswordMemoryState = state;
};

export const forgotPasswordReducer = (
  state: ForgotPasswordState,
  action: ForgotPasswordAction
): ForgotPasswordState => {
  switch (action.type) {
    case "SET_EMAIL":
      return {
        ...state,
        email: action.email,
        errorMessage: null,
      };
    case "SUBMIT_STARTED":
      return {
        ...state,
        status: "submitting",
        errorMessage: null,
        successMessage: null,
        submittedAt: Date.now(),
      };
    case "SUBMIT_SUCCESS":
      return {
        ...state,
        status: "success",
        errorMessage: null,
        successMessage:
          action.message ?? "Reset link sent. Check your inbox.",
        submittedAt: Date.now(),
      };
    case "SUBMIT_FAILURE":
      return {
        ...state,
        status: "error",
        errorMessage: action.message,
        successMessage: null,
        submittedAt: Date.now(),
      };
    case "CLEAR_EMAIL":
      return {
        ...state,
        email: "",
        status: "idle",
        errorMessage: null,
        successMessage: null,
        submittedAt: null,
      };
    case "RESET_TO_IDLE":
      return createInitialForgotPasswordState(state.email);
    default:
      return state;
  }
};
