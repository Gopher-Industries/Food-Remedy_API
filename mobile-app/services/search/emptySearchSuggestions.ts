export interface EmptySearchSuggestion {
  label: string;
  action: "scan" | "clear" | "spelling" | "recent";
}

export function getEmptySearchSuggestions(lastQuery?: string): EmptySearchSuggestion[] {
  const base: EmptySearchSuggestion[] = [
    { label: "Try barcode scan", action: "scan" },
    { label: "Clear filters", action: "clear" },
    { label: "Check spelling", action: "spelling" },
  ];

  if (!lastQuery || lastQuery.trim().length === 0) {
    return base;
  }

  return [
    { label: "Try barcode scan", action: "scan" },
    { label: "Check spelling", action: "spelling" },
    { label: "Clear filters", action: "clear" },
  ];
}
