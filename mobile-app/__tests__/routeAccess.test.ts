import { getAppRouteAccess, normalizePath } from "@/services/session/routeAccess";

describe("guest route access", () => {
  it.each([
    "/scan",
    "/(app)/(tabs)/scan",
    "/search",
    "/product",
    "/emptyState",
    "/errorState",
    "/skeletonLoading",
  ])("allows the public route %s", (route) => {
    expect(getAppRouteAccess(route)).toBe("public");
  });

  it.each([
    "/",
    "/cart",
    "/checkout",
    "/lists/abc",
    "/profiles",
    "/settings",
    "/accountProfile",
    "/membersEdit",
    "/nutritionalProfiles",
    "/future-account-feature",
    "/ProductTabs/ForYouTab",
  ])("protects the route %s", (route) => {
    expect(getAppRouteAccess(route)).toBe("authenticated");
  });

  it("normalizes Expo route groups", () => {
    expect(normalizePath("/(app)/(tabs)/scan/")).toBe("/scan");
  });
});
