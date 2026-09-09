import { normalizeBarcodeCandidate } from "@/server/productBarcode";

export const PRODUCT_SUBMISSIONS_CONTRACT_VERSION = "v1" as const;
export const MAX_SUBMISSION_BODY_BYTES = 2_048;
export const MAX_PRODUCT_NAME_LENGTH = 140;
export const MAX_BRAND_LENGTH = 100;
export const MAX_RETAILER_LENGTH = 100;
export const MAX_NOTE_LENGTH = 500;

export type SubmissionStatus = "PENDING";

export interface ValidatedProductSubmission {
  barcode: string;
  productName?: string;
  brand?: string;
  retailer?: string;
  note?: string;
}

export class SubmissionValidationError extends Error {
  constructor(
    readonly code:
      | "INVALID_REQUEST"
      | "INVALID_BARCODE"
      | "UNSUPPORTED_FIELD"
      | "REQUEST_TOO_LARGE",
    readonly message: string
  ) {
    super(message);
  }
}

const OPTIONAL_TEXT_FIELDS = {
  productName: MAX_PRODUCT_NAME_LENGTH,
  brand: MAX_BRAND_LENGTH,
  retailer: MAX_RETAILER_LENGTH,
  note: MAX_NOTE_LENGTH,
} as const;

const ALLOWED_FIELDS = new Set([
  "version",
  "barcode",
  ...Object.keys(OPTIONAL_TEXT_FIELDS),
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeOptionalText(
  value: unknown,
  fieldName: string,
  maximumLength: number
): string | undefined {
  if (value === undefined) return undefined;

  if (typeof value !== "string") {
    throw new SubmissionValidationError(
      "INVALID_REQUEST",
      `${fieldName} must be a string when supplied.`
    );
  }

  // Reject controls rather than silently storing a value whose meaning differs
  // between logs, Firestore consoles, and any future moderation UI.
  if (/[\u0000-\u001F\u007F]/.test(value)) {
    throw new SubmissionValidationError(
      "INVALID_REQUEST",
      `${fieldName} contains unsupported characters.`
    );
  }

  const normalized = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!normalized) {
    throw new SubmissionValidationError(
      "INVALID_REQUEST",
      `${fieldName} must not be empty when supplied.`
    );
  }
  if (normalized.length > maximumLength) {
    throw new SubmissionValidationError(
      "INVALID_REQUEST",
      `${fieldName} is too long.`
    );
  }

  return normalized;
}

/** Validates the complete v1 request before it reaches Firestore. */
export function validateProductSubmission(value: unknown): ValidatedProductSubmission {
  if (!isPlainObject(value)) {
    throw new SubmissionValidationError(
      "INVALID_REQUEST",
      "Request body must be a JSON object."
    );
  }

  for (const fieldName of Object.keys(value)) {
    if (!ALLOWED_FIELDS.has(fieldName)) {
      throw new SubmissionValidationError(
        "UNSUPPORTED_FIELD",
        "Request contains an unsupported field."
      );
    }
  }

  if (value.version !== PRODUCT_SUBMISSIONS_CONTRACT_VERSION) {
    throw new SubmissionValidationError(
      "INVALID_REQUEST",
      "Request must use the v1 submission contract."
    );
  }

  const barcodeResult = normalizeBarcodeCandidate(value.barcode);
  if (!barcodeResult.ok) {
    throw new SubmissionValidationError(
      "INVALID_BARCODE",
      "barcode must be a valid EAN-8, UPC-A, EAN-13, or GTIN-14 value."
    );
  }

  const submission: ValidatedProductSubmission = { barcode: barcodeResult.barcode };
  for (const [fieldName, maximumLength] of Object.entries(OPTIONAL_TEXT_FIELDS)) {
    const text = sanitizeOptionalText(value[fieldName], fieldName, maximumLength);
    if (text !== undefined) {
      submission[fieldName as keyof Omit<ValidatedProductSubmission, "barcode">] = text;
    }
  }

  return submission;
}

export interface ProductSubmissionResult {
  submissionId: string;
  barcode: string;
  status: SubmissionStatus;
  idempotent: boolean;
}

export interface ProductSubmissionStore {
  submit(
    reporterUid: string,
    submission: ValidatedProductSubmission
  ): Promise<ProductSubmissionResult>;
}

export class ProductAlreadyExistsError extends Error {}
export class SubmissionRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("Submission rate limit exceeded.");
  }
}
export class SubmissionStorageTimeoutError extends Error {}
