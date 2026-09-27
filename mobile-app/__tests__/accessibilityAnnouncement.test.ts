import { useEffect } from "react";
import { AccessibilityInfo, Platform } from "react-native";
import { useAccessibilityAnnouncement } from "@/hooks/useAccessibilityAnnouncement";

jest.mock("react", () => ({ useEffect: jest.fn() }));
jest.mock("react-native", () => ({
  AccessibilityInfo: {
    isScreenReaderEnabled: jest.fn(),
    announceForAccessibility: jest.fn(),
  },
  Platform: { OS: "ios" },
}));

const screenReaderEnabled = jest.mocked(AccessibilityInfo.isScreenReaderEnabled);
const announce = jest.mocked(AccessibilityInfo.announceForAccessibility);
const flushAnnouncements = () => new Promise<void>((resolve) => setImmediate(resolve));

// Exercise effect updates and cleanup without loading a native renderer.
let previousDependencies: readonly unknown[] | undefined;
let cleanup: (() => void) | undefined;

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = "ios";
  previousDependencies = undefined;
  cleanup = undefined;
  screenReaderEnabled.mockResolvedValue(true);
  jest.mocked(useEffect).mockImplementation((effect, dependencies) => {
    if (
      previousDependencies &&
      dependencies &&
      previousDependencies.length === dependencies.length &&
      dependencies.every((value, index) => Object.is(value, previousDependencies![index]))
    ) {
      return;
    }

    cleanup?.();
    previousDependencies = dependencies;
    const dispose = effect();
    cleanup = typeof dispose === "function" ? dispose : undefined;
  });
});

afterEach(() => cleanup?.());

describe("accessibility announcements", () => {
  it.each([null, undefined, "", " \t "])("ignores the empty message %p", async (message) => {
    useAccessibilityAnnouncement(message);
    await flushAnnouncements();

    expect(screenReaderEnabled).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalled();
  });

  it("announces a message once across unrelated renders", async () => {
    useAccessibilityAnnouncement("  Login error. Try again  ");
    await flushAnnouncements();
    useAccessibilityAnnouncement("  Login error. Try again  ");
    await flushAnnouncements();

    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith("Login error. Try again");
  });

  it.each(["ios", "android"] as const)(
    "repeats the same validation error for a new submission on %s",
    async (platform) => {
      Platform.OS = platform;
      useAccessibilityAnnouncement("Enter a valid first name", {
        announceOnAndroid: true,
        eventKey: 1,
      });
      await flushAnnouncements();

      // Batched clear + validation failure leaves the same message value.
      useAccessibilityAnnouncement("Enter a valid first name", {
        announceOnAndroid: true,
        eventKey: 2,
      });
      await flushAnnouncements();

      expect(announce.mock.calls).toEqual([
        ["Enter a valid first name"],
        ["Enter a valid first name"],
      ]);
    }
  );

  it("leaves Android live-region announcements alone by default", async () => {
    Platform.OS = "android";
    useAccessibilityAnnouncement("3 products found");
    await flushAnnouncements();

    expect(screenReaderEnabled).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalled();
  });

  it("waits until the owning screen is enabled", async () => {
    useAccessibilityAnnouncement("3 products found", { enabled: false });
    await flushAnnouncements();
    expect(announce).not.toHaveBeenCalled();

    useAccessibilityAnnouncement("3 products found", { enabled: true });
    await flushAnnouncements();
    expect(announce).toHaveBeenCalledWith("3 products found");
  });

  it("does not announce without an active screen reader", async () => {
    screenReaderEnabled.mockResolvedValue(false);
    useAccessibilityAnnouncement("Login error. Try again");
    await flushAnnouncements();

    expect(announce).not.toHaveBeenCalled();
  });

  it("discards a stale message while its screen-reader check is pending", async () => {
    let resolveOldCheck!: (enabled: boolean) => void;
    screenReaderEnabled.mockReturnValueOnce(
      new Promise<boolean>((resolve) => { resolveOldCheck = resolve; })
    );
    useAccessibilityAnnouncement("Searching");
    useAccessibilityAnnouncement("3 products found");
    await flushAnnouncements();
    resolveOldCheck(true);
    await flushAnnouncements();

    expect(announce.mock.calls).toEqual([["3 products found"]]);
  });

  it.each(["unmount", "disable", "clear"])(
    "cancels a pending announcement on %s",
    async (action) => {
      let resolveCheck!: (enabled: boolean) => void;
      screenReaderEnabled.mockReturnValueOnce(
        new Promise<boolean>((resolve) => { resolveCheck = resolve; })
      );
      useAccessibilityAnnouncement("Searching");

      if (action === "unmount") cleanup?.();
      else if (action === "disable") useAccessibilityAnnouncement("Searching", { enabled: false });
      else useAccessibilityAnnouncement(null);

      resolveCheck(true);
      await flushAnnouncements();
      expect(announce).not.toHaveBeenCalled();
    }
  );

  it("handles an unavailable accessibility service without an unhandled rejection", async () => {
    screenReaderEnabled.mockRejectedValue(new Error("service unavailable"));
    useAccessibilityAnnouncement("Login error. Try again");
    await flushAnnouncements();

    expect(announce).not.toHaveBeenCalled();
  });
});
