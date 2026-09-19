import { randomUUID, createHash } from "node:crypto";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import type { DecodedIdToken } from "firebase-admin/auth";
import {
  FieldValue,
  getFirestore,
  type Firestore,
} from "firebase-admin/firestore";

export const RECENT_AUTH_MAX_AGE_SECONDS = 15 * 60;
export const DELETION_REQUEST_STATES = [
  "accepted",
  "in-progress",
  "completed",
  "retryable-failure",
] as const;

export type DeletionRequestState = (typeof DELETION_REQUEST_STATES)[number];

export type DeletionRequestRecord = {
  requestId: string;
  uid: string;
  state: DeletionRequestState;
};

export type DeletionRequestStore = {
  createOrGet: (uid: string) => Promise<{
    record: DeletionRequestRecord;
    created: boolean;
  }>;
};

type DeletionDependencies = {
  verifyIdToken: (token: string) => Promise<DecodedIdToken>;
  store: DeletionRequestStore;
  now?: () => number;
};

type DeletionRequestBody = Record<string, unknown>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(code: string, message: string, status: number): Response {
  return jsonResponse({ error: code, message }, status);
}

function bearerToken(request: Request): string | null {
  const value = request.headers.get("Authorization");
  if (!value) return null;

  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function readBody(request: Request): Promise<DeletionRequestBody | null> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) return {};

  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    return body as DeletionRequestBody;
  } catch {
    return null;
  }
}

function hasUidSelector(request: Request, body: DeletionRequestBody): boolean {
  const query = new URL(request.url).searchParams;
  return ["uid", "userId", "user_id"].some(
    (key) => query.has(key) || Object.prototype.hasOwnProperty.call(body, key),
  );
}

function isRecentAuthentication(
  decodedToken: DecodedIdToken,
  now: () => number,
): boolean {
  return (
    typeof decodedToken.auth_time === "number" &&
    now() - decodedToken.auth_time <= RECENT_AUTH_MAX_AGE_SECONDS
  );
}

function requestKey(uid: string): string {
  return createHash("sha256").update(uid).digest("hex");
}

function adminServices(): { verifyIdToken: DeletionDependencies["verifyIdToken"]; firestore: Firestore } {
  // Keep the Admin Auth runtime out of client and Jest module initialization.
  // The route is the only code path that loads this trusted-server dependency.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getAuth } = require("firebase-admin/auth") as typeof import("firebase-admin/auth");
  const app = getApps()[0] ?? initializeApp({ credential: applicationDefault() });
  const auth = getAuth(app);
  return {
    verifyIdToken: (token) => auth.verifyIdToken(token, true),
    firestore: getFirestore(app),
  };
}

function firestoreStore(firestore: Firestore): DeletionRequestStore {
  const requests = firestore.collection("ACCOUNT_DELETION_REQUESTS");
  const keys = firestore.collection("ACCOUNT_DELETION_REQUEST_KEYS");

  return {
    createOrGet: async (uid) => {
      const keyRef = keys.doc(requestKey(uid));
      const requestRef = requests.doc(randomUUID());

      return firestore.runTransaction(async (transaction) => {
        const existingKey = await transaction.get(keyRef);
        if (existingKey.exists) {
          const existingKeyData = existingKey.data() as Pick<DeletionRequestRecord, "requestId" | "uid">;
          const existingRequest = await transaction.get(requests.doc(existingKeyData.requestId));
          const existing = existingRequest.data() as DeletionRequestRecord;
          return {
            record: existing,
            created: false,
          };
        }

        const record: DeletionRequestRecord = {
          requestId: requestRef.id,
          uid,
          state: "accepted",
        };

        transaction.set(requestRef, {
          ...record,
          acceptedAt: FieldValue.serverTimestamp(),
        });
        transaction.set(keyRef, {
          requestId: record.requestId,
          uid: record.uid,
        });

        return { record, created: true };
      });
    },
  };
}

export function createDeletionRequestHandler(
  dependencies: DeletionDependencies,
): (request: Request) => Promise<Response> {
  const now = dependencies.now ?? (() => Math.floor(Date.now() / 1000));

  return async (request) => {
    if (request.method !== "POST") {
      return errorResponse("METHOD_NOT_ALLOWED", "Use POST for deletion requests.", 405);
    }

    const body = await readBody(request);
    if (body === null) {
      return errorResponse("INVALID_REQUEST", "Request body must be a JSON object.", 400);
    }
    if (hasUidSelector(request, body)) {
      return errorResponse(
        "UID_NOT_ALLOWED",
        "The account UID is derived from the authenticated token.",
        400,
      );
    }

    const token = bearerToken(request);
    if (!token) {
      return errorResponse("UNAUTHENTICATED", "A Firebase ID token is required.", 401);
    }

    let decodedToken: DecodedIdToken;
    try {
      decodedToken = await dependencies.verifyIdToken(token);
    } catch {
      return errorResponse("UNAUTHENTICATED", "The Firebase ID token is invalid or revoked.", 401);
    }

    if (!decodedToken.uid) {
      return errorResponse("UNAUTHENTICATED", "The Firebase ID token has no user identity.", 401);
    }
    if (!isRecentAuthentication(decodedToken, now)) {
      return errorResponse("RECENT_AUTH_REQUIRED", "Please re-authenticate and try again.", 403);
    }

    try {
      const result = await dependencies.store.createOrGet(decodedToken.uid);
      return jsonResponse(
        {
          requestId: result.record.requestId,
          state: result.record.state,
          accepted: true,
          duplicate: !result.created,
        },
        result.created ? 201 : 200,
      );
    } catch (error) {
      console.error("Account deletion request failed:", error);
      return errorResponse("SERVER_ERROR", "Unable to accept the deletion request.", 500);
    }
  };
}

export async function POST(request: Request): Promise<Response> {
  const services = adminServices();
  return createDeletionRequestHandler({
    verifyIdToken: services.verifyIdToken,
    store: firestoreStore(services.firestore),
  })(request);
}