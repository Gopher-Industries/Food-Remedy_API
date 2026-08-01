export type AppRouteAccess = "public" | "authenticated";

const PUBLIC_APP_ROUTES = new Set([
  "/scan",
  "/search",
  "/product",
  "/emptyState",
  "/errorState",
  "/skeletonLoading",
]);

/**
 * App routes are protected by default. Adding a future authenticated screen
 * therefore requires no widget-level checks or additional guard code.
 */
export function getAppRouteAccess(pathname: string): AppRouteAccess {
  return PUBLIC_APP_ROUTES.has(normalizePath(pathname))
    ? "public"
    : "authenticated";
}

export function normalizePath(pathname: string): string {
  const withoutGroups = pathname.replace(/\/\([^/]+\)/g, "");
  const normalized = withoutGroups.replace(/\/{2,}/g, "/").replace(/\/$/, "");
  return normalized || "/";
}

