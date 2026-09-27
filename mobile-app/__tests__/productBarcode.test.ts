import { normalizeBarcodeCandidate } from "@/server/productBarcode";

describe("canonical server barcode validation", () => {
  it.each([
    ["EAN-8", "96385074"],
    ["UPC-A with a leading zero", "036000291452"],
    ["EAN-13", "4006381333931"],
    ["GTIN-14 with leading zeroes", "00012345600012"],
  ])("accepts a valid %s without converting it to a number", (_name, barcode) => {
    expect(normalizeBarcodeCandidate(`  ${barcode}  `)).toEqual({
      ok: true,
      barcode,
      length: barcode.length,
    });
  });

  it.each([
    "1234567",
    "123456789",
    "4006381333932",
    "03600029145a",
    "036000-291452",
    "",
  ])("rejects malformed or unsupported barcode candidates: %s", (barcode) => {
    expect(normalizeBarcodeCandidate(barcode)).toEqual({ ok: false });
  });
});
