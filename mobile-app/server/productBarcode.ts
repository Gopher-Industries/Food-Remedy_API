/**
 * Canonical barcode validation shared by server-side product endpoints.
 *
 * Food Remedy stores product identifiers as digit strings.  They must never
 * pass through a numeric type because that would lose leading zeroes.
 */

export const SUPPORTED_GTIN_LENGTHS = [8, 12, 13, 14] as const;

export type SupportedGtinLength = (typeof SUPPORTED_GTIN_LENGTHS)[number];

export type BarcodeValidationResult =
  | { ok: true; barcode: string; length: SupportedGtinLength }
  | { ok: false };

function hasValidCheckDigit(barcode: string): boolean {
  let sum = 0;

  // Starting immediately to the left of the check digit, GTIN digits use
  // weights 3, 1, 3, 1… from right to left for every supported length.
  for (let index = barcode.length - 2, offset = 0; index >= 0; index -= 1, offset += 1) {
    const digit = Number(barcode[index]);
    sum += digit * (offset % 2 === 0 ? 3 : 1);
  }

  const expectedCheckDigit = (10 - (sum % 10)) % 10;
  return expectedCheckDigit === Number(barcode[barcode.length - 1]);
}

/**
 * Converts an input into its canonical digit string and validates the GTIN
 * check digit. Whitespace around a scanned value is ignored; every remaining
 * character must be an ASCII digit.
 */
export function normalizeBarcodeCandidate(value: unknown): BarcodeValidationResult {
  if (typeof value !== "string") return { ok: false };

  const barcode = value.normalize("NFKC").trim();
  if (!/^\d+$/.test(barcode)) return { ok: false };

  const length = barcode.length as SupportedGtinLength;
  if (!SUPPORTED_GTIN_LENGTHS.includes(length)) return { ok: false };
  if (!hasValidCheckDigit(barcode)) return { ok: false };

  return { ok: true, barcode, length };
}
