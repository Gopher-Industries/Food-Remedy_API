import { getEmptySearchSuggestions } from "../services/search/emptySearchSuggestions";

describe("empty search guidance", () => {
  it("includes multiple actionable next steps for empty results", () => {
    const suggestions = getEmptySearchSuggestions("mikk");

    expect(suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Try barcode scan" }),
        expect.objectContaining({ label: "Clear filters" }),
        expect.objectContaining({ label: "Check spelling" }),
      ])
    );
  });
});
