function decodeFirestoreValue(value) {
  if (!value || typeof value !== "object") return null;
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decodeFirestoreValue);
  if ("mapValue" in value) return decodeFirestoreFields(value.mapValue.fields || {});
  return null;
}

function decodeFirestoreFields(fields) {
  return Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key, decodeFirestoreValue(value)]));
}

function createFirebaseProfileRepository(options = {}) {
  const projectId = options.projectId || process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
  const fetchImpl = options.fetchImpl || fetch;
  return {
    async getOwnedProfile({ uid, profileId, idToken }) {
      if (!projectId) throw Object.assign(new Error("FIREBASE_PROJECT_ID is not configured"), { code: "PROFILE_STORE_UNAVAILABLE" });
      const encodedUid = encodeURIComponent(uid);
      const encodedProfile = encodeURIComponent(profileId);
      const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/USERS/${encodedUid}/PROFILES/${encodedProfile}`;
      const response = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${idToken}`, Accept: "application/json" },
        signal: typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(5000) : undefined
      });
      if (response.status === 404) return null;
      if (!response.ok) throw Object.assign(new Error(`Profile lookup failed (${response.status})`), { code: "PROFILE_STORE_UNAVAILABLE" });
      const document = await response.json();
      const profile = decodeFirestoreFields(document.fields || {});
      if ((profile.userId && profile.userId !== uid) || (profile.profileId && profile.profileId !== profileId)) return null;
      return { ...profile, userId: uid, profileId };
    }
  };
}

module.exports = { createFirebaseProfileRepository, decodeFirestoreFields, decodeFirestoreValue };
