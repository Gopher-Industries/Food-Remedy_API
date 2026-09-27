/**
 * FE031 - announce a status change to screen reader users.
 *
 * `accessibilityLiveRegion` only exists on Android, so a message that appears
 * without moving focus (a login error, a search result count) is silent on iOS.
 * By default this supplements Android live regions on iOS. Callers without a
 * live region can opt in on Android too. An event key lets a new submission
 * announce the same error again.
 */

import { useEffect } from "react";
import { AccessibilityInfo, Platform } from "react-native";

interface AnnouncementOptions {
  enabled?: boolean;
  announceOnAndroid?: boolean;
  eventKey?: number;
}

export function useAccessibilityAnnouncement(
  message: string | null | undefined,
  { enabled = true, announceOnAndroid = false, eventKey = 0 }: AnnouncementOptions = {}
) {
  useEffect(() => {
    const next = message?.trim();
    if (!enabled || !next || (Platform.OS === "android" && !announceOnAndroid)) {
      return;
    }

    let cancelled = false;
    // Only speak when a screen reader is actually running, so the announcement
    // does not interrupt any other audio for sighted users.
    AccessibilityInfo.isScreenReaderEnabled()
      .then((screenReaderEnabled) => {
        if (!cancelled && screenReaderEnabled) {
          AccessibilityInfo.announceForAccessibility(next);
        }
      })
      .catch(() => {
        // An unavailable accessibility service must not break the form.
      });

    return () => {
      cancelled = true;
    };
  }, [message, enabled, announceOnAndroid, eventKey]);
}

export default useAccessibilityAnnouncement;
