export function getProfileLabel(relationship?: string | null, displayName?: string | null): string {
  const rel = (relationship ?? "").trim();
  const name = (displayName ?? "").trim();
  if (rel === "Self") {
    return name ? `${name} (Self)` : "User (Self)";
  }
  return rel ? `User (${rel})` : "User";
}
