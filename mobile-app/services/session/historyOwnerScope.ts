import type { SessionType } from "@/components/providers/AuthProvider";
import {
  GUEST_HISTORY_OWNER_SCOPE,
  getAuthenticatedHistoryOwnerScope,
} from "@/services/sqlDatabase/history.dao";

export function getHistoryOwnerScope(
  sessionType: SessionType,
  uid?: string | null
): string | null {
  if (sessionType === "authenticated" && uid) {
    return getAuthenticatedHistoryOwnerScope(uid);
  }

  if (sessionType === "guest") {
    return GUEST_HISTORY_OWNER_SCOPE;
  }

  return null;
}
