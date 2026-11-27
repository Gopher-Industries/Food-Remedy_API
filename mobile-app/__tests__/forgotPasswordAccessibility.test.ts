import { Children, isValidElement, ReactNode, useEffect, useReducer, useState } from "react";
import ForgotPasswordPage from "@/app/forgotPassword";
import {
  createInitialForgotPasswordState,
  ForgotPasswordAction,
  ForgotPasswordState,
  forgotPasswordMemoryState,
  forgotPasswordReducer,
  syncForgotPasswordMemory,
} from "@/app/forgotPasswordState";
import { useAccessibilityAnnouncement } from "@/hooks/useAccessibilityAnnouncement";
import { useDirtyForm } from "@/hooks/useDirtyForm";
import { sendPasswordReset } from "@/services";

jest.mock("react", () => ({
  ...jest.requireActual("react"),
  useState: jest.fn(),
  useReducer: jest.fn(),
  useEffect: jest.fn(),
}));
jest.mock("react-native", () => ({
  View: "View", Image: "Image", ScrollView: "ScrollView", Pressable: "Pressable",
  KeyboardAvoidingView: "KeyboardAvoidingView", ActivityIndicator: "ActivityIndicator",
  Platform: { OS: "ios" },
}));
jest.mock("expo-router", () => ({ router: { replace: jest.fn() } }));
jest.mock("@/components/ui/UIInput", () => "Input");
jest.mock("@/components/ui/UIText", () => "Text");
jest.mock("@/assets/images/FoodRemedyLogo.png", () => 1);
jest.mock("@/theme", () => ({ useTheme: () => ({ colors: { background: "white" } }) }));
jest.mock("@/hooks/useDirtyForm", () => ({ useDirtyForm: jest.fn() }));
jest.mock("@/hooks/useAccessibilityAnnouncement", () => ({ useAccessibilityAnnouncement: jest.fn() }));
jest.mock("@/services", () => ({ sendPasswordReset: jest.fn() }));

interface ControlProps {
  children?: ReactNode;
  accessibilityLabel?: string;
  accessibilityState?: { disabled: boolean; busy: boolean };
  disabled?: boolean;
  onPress?: () => Promise<void>;
  onChangeText?: (value: string) => void;
}

function control(node: ReactNode, label: string): ControlProps | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<ControlProps>(child)) continue;
    if (child.props.accessibilityLabel === label) return child.props;
    const nested = control(child.props.children, label);
    if (nested) return nested;
  }
}

const render = () => ForgotPasswordPage();
const submit = () => control(render(), "Send reset link")!.onPress!();
const enterEmail = (email: string) => control(render(), "Email address")!.onChangeText!(email);
const reset = jest.mocked(sendPasswordReset);
const announce = jest.mocked(useAccessibilityAnnouncement);
const markClean = jest.fn();
let state: ForgotPasswordState | undefined;
let attempt: number;

// Invoke the page's real handlers and reducer with mocked hooks/native elements.
// This verifies merge behavior, not native rendering or screen-reader speech.
beforeEach(() => {
  jest.clearAllMocks();
  state = undefined;
  attempt = 0;
  syncForgotPasswordMemory(createInitialForgotPasswordState());
  reset.mockResolvedValue(undefined);
  jest.mocked(useDirtyForm).mockReturnValue({
    markDirty: jest.fn(), markClean, confirmLeave: jest.fn(), allowLeave: jest.fn(), isDirty: false,
  });
  jest.mocked(useEffect).mockImplementation((effect) => { effect(); });
  jest.mocked(useState).mockImplementation((() => [attempt, (next: number | ((value: number) => number)) => {
    attempt = typeof next === "function" ? next(attempt) : next;
  }]) as typeof useState);
  jest.mocked(useReducer).mockImplementation(((
    reducer: typeof forgotPasswordReducer,
    initial: ForgotPasswordState,
  ) => {
    state ??= initial;
    return [state, (action: ForgotPasswordAction) => { state = reducer(state!, action); }];
  }) as typeof useReducer);
});

afterEach(() => jest.restoreAllMocks());

it("repeats invalid-email announcements without calling the reset service", async () => {
  enterEmail("invalid");
  await submit();
  render();
  expect(announce).toHaveBeenLastCalledWith("Error. Invalid Email. Please try again", {
    announceOnAndroid: true, eventKey: 1,
  });
  await submit();
  render();
  expect(announce).toHaveBeenLastCalledWith("Error. Invalid Email. Please try again", {
    announceOnAndroid: true, eventKey: 2,
  });
  expect(reset).not.toHaveBeenCalled();
});

it("preserves the async reset flow, busy state, success announcement and memory", async () => {
  let finish!: () => void;
  reset.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
  enterEmail(" User@Example.com ");
  const pending = submit();
  const button = control(render(), "Send reset link")!;
  expect(button.disabled).toBe(true);
  expect(button.accessibilityState).toEqual({ busy: true, disabled: true });
  expect(announce).toHaveBeenLastCalledWith(null, { announceOnAndroid: true, eventKey: 1 });
  await button.onPress!();
  expect(reset).toHaveBeenCalledTimes(1);
  expect(reset).toHaveBeenCalledWith("user@example.com");
  finish();
  await pending;
  render();
  expect(markClean).toHaveBeenCalledTimes(1);
  expect(announce).toHaveBeenLastCalledWith("Reset link sent. Check your inbox.", {
    announceOnAndroid: true, eventKey: 1,
  });
  expect(forgotPasswordMemoryState).toMatchObject({ email: " User@Example.com ", status: "success" });
});

it("announces a service failure, clears it on editing and allows a retry", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  reset.mockRejectedValueOnce(new Error("network unavailable"));
  enterEmail("user@example.com");
  await submit();
  render();
  expect(announce).toHaveBeenLastCalledWith("Error. We couldn't send a reset link. Please try again.", {
    announceOnAndroid: true, eventKey: 1,
  });
  expect(markClean).not.toHaveBeenCalled();
  enterEmail("retry@example.com");
  render();
  expect(announce).toHaveBeenLastCalledWith(null, { announceOnAndroid: true, eventKey: 1 });
  await submit();
  render();
  expect(reset).toHaveBeenLastCalledWith("retry@example.com");
  expect(announce).toHaveBeenLastCalledWith("Reset link sent. Check your inbox.", {
    announceOnAndroid: true, eventKey: 2,
  });
});
