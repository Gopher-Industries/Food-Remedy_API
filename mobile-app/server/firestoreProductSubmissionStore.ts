import { createHash } from "node:crypto";
import {
  FieldValue,
  type Firestore,
} from "firebase-admin/firestore";
import {
  ProductAlreadyExistsError,
  type ProductSubmissionResult,
  type ProductSubmissionStore,
  type SubmissionStatus,
  SubmissionRateLimitError,
  SubmissionStorageTimeoutError,
  type ValidatedProductSubmission,
} from "@/server/productSubmissions";

const PRODUCTS_COLLECTION = "PRODUCTS";
const SUBMISSIONS_COLLECTION = "PRODUCT_SUBMISSIONS";
const REPORTERS_COLLECTION = "PRODUCT_SUBMISSION_REPORTERS";
const RATE_LIMITS_COLLECTION = "PRODUCT_SUBMISSION_RATE_LIMITS";

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1_000;
const RATE_LIMIT_MAX_SUBMISSIONS = 10;
const MAX_DISTINCT_REPORTS_PER_BARCODE = 100;
const STORE_TIMEOUT_MS = 5_000;

type ExistingSubmission = {
  status?: SubmissionStatus;
  reportCount?: number;
};

function opaqueKey(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(
      () => reject(new SubmissionStorageTimeoutError("Firestore request timed out.")),
      timeoutMs
    );
  });

  return Promise.race([operation, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
  }) as Promise<T>;
}

/**
 * Firestore persistence for the v1 moderation boundary.
 *
 * One queue document exists per barcode. A bounded, opaque reporter ledger
 * provides per-user idempotency without exposing or storing a raw UID.
 */
export class FirestoreProductSubmissionStore implements ProductSubmissionStore {
  constructor(
    private readonly firestore: Firestore,
    private readonly now: () => number = () => Date.now(),
    private readonly timeoutMs = STORE_TIMEOUT_MS
  ) {}

  async submit(
    reporterUid: string,
    submission: ValidatedProductSubmission
  ): Promise<ProductSubmissionResult> {
    return withTimeout(
      this.firestore.runTransaction(async (transaction) => {
        const submissionId = `ps_${submission.barcode}`;
        const productRef = this.firestore.collection(PRODUCTS_COLLECTION).doc(submission.barcode);
        const submissionRef = this.firestore.collection(SUBMISSIONS_COLLECTION).doc(submissionId);
        const reporterRef = this.firestore
          .collection(REPORTERS_COLLECTION)
          .doc(opaqueKey(`${reporterUid}\u0000${submission.barcode}`));
        const rateLimitRef = this.firestore
          .collection(RATE_LIMITS_COLLECTION)
          .doc(opaqueKey(reporterUid));

        // Every read happens before the first write, as required by Firestore
        // transactions. The PRODUCTS read also protects against a catalogue
        // entry appearing while this request is being processed.
        const [productSnapshot, reporterSnapshot, submissionSnapshot, rateSnapshot] =
          await Promise.all([
            transaction.get(productRef),
            transaction.get(reporterRef),
            transaction.get(submissionRef),
            transaction.get(rateLimitRef),
          ]);

        if (productSnapshot.exists) {
          throw new ProductAlreadyExistsError("Product exists in catalogue.");
        }

        const existingSubmission = submissionSnapshot.exists
          ? (submissionSnapshot.data() as ExistingSubmission)
          : undefined;
        const status = existingSubmission?.status ?? "PENDING";

        if (reporterSnapshot.exists) {
          return {
            submissionId,
            barcode: submission.barcode,
            status,
            idempotent: true,
          };
        }

        const reportCount = Math.max(0, Number(existingSubmission?.reportCount) || 0);
        if (reportCount >= MAX_DISTINCT_REPORTS_PER_BARCODE) {
          // The moderation queue is deliberately one document per barcode and
          // the per-reporter ledger is capped. Returning the same active
          // submission avoids turning a popular missing product into unbounded
          // moderation storage.
          return {
            submissionId,
            barcode: submission.barcode,
            status,
            idempotent: true,
          };
        }

        const now = this.now();
        const rateData = rateSnapshot.exists
          ? (rateSnapshot.data() as { windowStartedAt?: number; count?: number })
          : {};
        const windowStartedAt = Number(rateData.windowStartedAt) || now;
        const inCurrentWindow = now - windowStartedAt < RATE_LIMIT_WINDOW_MS;
        const count = inCurrentWindow ? Math.max(0, Number(rateData.count) || 0) : 0;

        if (count >= RATE_LIMIT_MAX_SUBMISSIONS) {
          const retryAfterSeconds = Math.max(
            1,
            Math.ceil((windowStartedAt + RATE_LIMIT_WINDOW_MS - now) / 1_000)
          );
          throw new SubmissionRateLimitError(retryAfterSeconds);
        }

        transaction.set(reporterRef, {
          submissionId,
          barcode: submission.barcode,
          createdAt: FieldValue.serverTimestamp(),
        });
        transaction.set(rateLimitRef, {
          windowStartedAt: inCurrentWindow ? windowStartedAt : now,
          count: count + 1,
          updatedAt: FieldValue.serverTimestamp(),
        });

        if (existingSubmission) {
          transaction.update(submissionRef, {
            reportCount: Math.min(MAX_DISTINCT_REPORTS_PER_BARCODE, reportCount + 1),
            lastReportedAt: FieldValue.serverTimestamp(),
          });
        } else {
          const { barcode: _barcode, ...submittedDetails } = submission;
          transaction.create(submissionRef, {
            submissionId,
            barcode: submission.barcode,
            status: "PENDING",
            unverified: true,
            reportCount: 1,
            ...submittedDetails,
            createdAt: FieldValue.serverTimestamp(),
            lastReportedAt: FieldValue.serverTimestamp(),
          });
        }

        return {
          submissionId,
          barcode: submission.barcode,
          status: "PENDING" as SubmissionStatus,
          idempotent: false,
        };
      }),
      this.timeoutMs
    );
  }
}
