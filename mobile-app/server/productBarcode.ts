/** Canonical GTIN validation. Barcode values remain strings to preserve zeroes. */
export const SUPPORTED_GTIN_LENGTHS = [8, 12, 13, 14] as const;
export type SupportedGtinLength = (typeof SUPPORTED_GTIN_LENGTHS)[number];
export type BarcodeValidationResult = { ok: true; barcode: string; length: SupportedGtinLength } | { ok: false };

function hasValidCheckDigit(barcode: string): boolean {
  let sum = 0;
  for (let index = barcode.length - 2, offset = 0; index >= 0; index -= 1, offset += 1) {
    sum += Number(barcode[index]) * (offset % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === Number(barcode[barcode.length - 1]);
}

export function normalizeBarcodeCandidate(value: unknown): BarcodeValidationResult {
  if (typeof value !== "string") return { ok: false };
  const barcode = value.normalize("NFKC").trim();
  if (!/^\d+$/.test(barcode)) return { ok: false };
  const length = barcode.length as SupportedGtinLength;
  if (!SUPPORTED_GTIN_LENGTHS.includes(length) || !hasValidCheckDigit(barcode)) return { ok: false };
  return { ok: true, barcode, length };
}
