/**
 * FE031 - Accessibility compliance pass across critical flows.
 *
 * These are static guards, not renders: the mobile app has no react-test-renderer
 * setup, so instead of mounting screens we assert on their source. They exist to
 * stop the two regressions this ticket fixed from coming back:
 *
 *   1. an interactive control shipped without an accessible name, and
 *   2. a text/background pair that drops below the WCAG 2.1 AA contrast ratio.
 */

import * as fs from "fs";
import * as path from "path";

const APP_ROOT = path.resolve(__dirname, "..");

/** Screens and shared components that make up the critical flows in FE031. */
const CRITICAL_FLOW_FILES = [
  // onboarding
  "components/onboarding/OnboardingScreen1.tsx",
  "components/onboarding/OnboardingScreen2.tsx",
  "components/onboarding/OnboardingScreen3.tsx",
  "components/onboarding/PaginationIndicator.tsx",
  // auth
  "app/login.tsx",
  "app/register.tsx",
  "app/forgotPassword.tsx",
  // search
  "app/(app)/search.tsx",
  "components/ui/ProductSearchTab.tsx",
  "components/product/ProductSearchResults.tsx",
  "components/product/ProductBanner.tsx",
  "components/shared/BackButton.tsx",
  // scan
  "app/(app)/(tabs)/scan.tsx",
  "components/ui/CameraPermission.tsx",
  // product detail
  "app/(app)/product.tsx",
  // settings
  "app/(app)/(tabs)/settings.tsx",
];

const read = (relativePath: string) =>
  fs.readFileSync(path.join(APP_ROOT, relativePath), "utf8");

/**
 * Returns the opening tag of every `<Pressable ...>` in the source, respecting
 * nested braces and quotes so that inline JSX expressions do not end the tag early.
 */
function pressableOpeningTags(source: string): string[] {
  const tags: string[] = [];
  const TAG = "<Pressable";

  for (let index = source.indexOf(TAG); index !== -1; index = source.indexOf(TAG, index + 1)) {
    let depth = 0;
    let quote: string | null = null;

    for (let cursor = index; cursor < source.length; cursor++) {
      const char = source[cursor];

      if (quote) {
        if (char === quote) quote = null;
        continue;
      }
      if (char === '"' || char === "'" || char === "`") {
        quote = char;
        continue;
      }
      if (char === "{") depth++;
      else if (char === "}") depth--;
      else if (char === ">" && depth === 0) {
        tags.push(source.slice(index, cursor + 1));
        break;
      }
    }
  }

  return tags;
}

/** A control is acceptable when it is named, or deliberately hidden from assistive tech. */
const isAccessible = (tag: string) =>
  /accessibilityLabel[=\s]/.test(tag) ||
  /importantForAccessibility=["']no/.test(tag) ||
  /accessibilityElementsHidden/.test(tag);

describe("FE031 - critical controls expose an accessible name", () => {
  it.each(CRITICAL_FLOW_FILES)("%s", (relativePath) => {
    const unnamed = pressableOpeningTags(read(relativePath)).filter(
      (tag) => !isAccessible(tag)
    );

    expect(unnamed).toEqual([]);
  });
});

describe("FE031 - shared components keep their accessibility contract", () => {
  it("text inputs fall back to their placeholder as the accessible name", () => {
    const source = read("components/ui/UIInput.tsx");

    expect(source).toContain("accessibilityLabel={accessibilityLabel ?? props.placeholder}");
  });

  it("icons are decorative unless a label is supplied", () => {
    const source = read("components/icons/IconGeneral.tsx");

    expect(source).toContain("accessibilityElementsHidden={!label}");
    expect(source).toContain('accessibilityRole={label ? "image" : undefined}');
  });

  it("the shared button announces its role and busy/disabled state", () => {
    const source = read("components/shared/Button.tsx");

    expect(source).toContain('accessibilityRole="button"');
    expect(source).toContain("accessibilityState={{ disabled: disabled || loading, busy: loading }}");
  });

  it("the shared button preserves the system font scale", () => {
    const source = read("components/shared/Button.tsx");

    expect(source).not.toContain("maxFontSizeMultiplier={1.6}");
    expect(source).not.toContain("allowFontScaling={false}");
  });

  it("the product detail tabs are exposed as tabs, not plain buttons", () => {
    const source = read("app/(app)/product.tsx");

    expect(source).toContain('accessibilityRole="tab"');
    expect(source).toContain("accessibilityState={{ selected: isActive }}");
  });

  // Keep roles and selection state on the individual controls. Native focus
  // behaviour still needs a screen-reader walkthrough; this is a source guard.
  it("grouping semantics remain on the individual controls", () => {
    for (const screen of ["app/(app)/product.tsx", "app/(app)/(tabs)/settings.tsx"]) {
      const source = read(screen);

      expect(source).not.toContain('accessibilityRole="tablist"');
      expect(source).not.toContain('accessibilityRole="radiogroup"');
    }
  });

  it("each font size option is still an individually labelled control", () => {
    const source = read("app/(app)/(tabs)/settings.tsx");

    for (const size of ["small", "medium", "large"]) {
      expect(source).toContain(`accessibilityState={{ checked: fontSize === "${size}"`);
    }
  });

  it("both search screens announce statuses only while focused on both platforms", () => {
    for (const screen of ["app/(app)/search.tsx", "components/ui/ProductSearchTab.tsx"]) {
      const source = read(screen);

      expect(source).toContain("const isFocused = useIsFocused()");
      expect(source).toContain("useAccessibilityAnnouncement(searchAnnouncement,");
      expect(source).toContain("enabled: isFocused");
      expect(source).toContain("announceOnAndroid: true");
      expect(source).toContain("eventKey: searchAttempt");
      expect(source).not.toContain("accessibilityLiveRegion");

      // Guard all outcomes, including validation and progress, on the primary
      // scanner search as well as the full results screen.
      const announcement = source.match(/const searchAnnouncement = ([\s\S]*?);/)?.[1];
      expect(announcement).toBeDefined();
      for (const state of ["hasSearched", "queryInvalid", "loading", "productResults.length"]) {
        expect(announcement).toContain(state);
      }
      expect(announcement).toContain("Type at least 2 characters to search");
      expect(announcement).toContain("Searching…");
      expect(announcement).toContain("No results");
      expect(announcement).toContain("found");
    }
  });

  it("search buttons expose and enforce the same trimmed-query disabled state", () => {
    for (const screen of ["app/(app)/search.tsx", "components/ui/ProductSearchTab.tsx"]) {
      const source = read(screen);

      expect(source).toContain("const searchDisabled = query.trim().length < 2");
      const searchButton = pressableOpeningTags(source).find(
        (tag) => tag.includes('accessibilityLabel="Search"')
      );
      expect(searchButton).toContain("disabled={searchDisabled}");
      expect(searchButton).toContain("accessibilityState={{ disabled: searchDisabled }}");
      expect(searchButton).toContain("!searchDisabled ?");
    }
  });

  it("authentication errors are announced as alerts", () => {
    for (const screen of ["app/login.tsx", "app/register.tsx", "app/forgotPassword.tsx"]) {
      expect(read(screen)).toContain('accessibilityRole="alert"');
    }
  });

  it("status changes are also announced on iOS, which has no live regions", () => {
    for (const screen of [
      "app/login.tsx",
      "app/register.tsx",
      "app/forgotPassword.tsx",
      "app/(app)/search.tsx",
      "components/ui/ProductSearchTab.tsx",
    ]) {
      expect(read(screen)).toContain("useAccessibilityAnnouncement(");
    }
  });
});

/* ------------------------------------------------------------------ *
 * Contrast
 * ------------------------------------------------------------------ */

/** WCAG 2.1 relative luminance for an sRGB channel triplet in the 0-1 range. */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const linear = [r, g, b].map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  );

  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

/** Grey helper: HSL with 0% saturation collapses to a single channel value. */
const grey = (lightnessPercent: number): [number, number, number] => {
  const value = lightnessPercent / 100;
  return [value, value, value];
};

function contrastRatio(
  foreground: [number, number, number],
  background: [number, number, number]
): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [lighter, darker] = a > b ? [a, b] : [b, a];

  return (lighter + 0.05) / (darker + 0.05);
}

/** Read the shipped theme tokens so changing a palette also exercises contrast. */
function themeColor(themeName: "lightTheme" | "darkTheme", token: string): [number, number, number] {
  const colors = read("theme.ts").match(
    new RegExp(`const ${themeName}(?:: Theme)? = \\{\\s*colors: \\{([^}]+)\\}`)
  )?.[1];
  const hex = colors?.match(new RegExp(`${token}: "#([0-9a-fA-F]{6})"`))?.[1];

  if (!hex) throw new Error(`Missing ${themeName}.colors.${token}`);
  return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255) as [number, number, number];
}

describe("FE031 - contrast of the values used in the critical flows", () => {
  it.each(["lightTheme", "darkTheme"] as const)("the search placeholder meets AA in %s", (themeName) => {
    expect(contrastRatio(
      themeColor(themeName, "textMuted"),
      themeColor(themeName, "surface")
    )).toBeGreaterThanOrEqual(4.5);
  });

  it("both search inputs use the theme placeholder and surface colours", () => {
    for (const screen of ["app/(app)/search.tsx", "components/ui/ProductSearchTab.tsx"]) {
      expect(read(screen)).not.toContain("placeholderTextColor=");
    }

    const input = read("components/ui/UIInput.tsx");
    expect(input).toContain("placeholderTextColor={placeholderTextColor ?? theme.colors.textMuted}");
    expect(input).toContain("backgroundColor: theme.colors.surface");
  });

  it("the disabled search icon meets the AA non-text contrast minimum", () => {
    // hsl(0, 0%, 40%) glyph on the hsl(0, 0%, 80%) disabled button: >= 3:1.
    expect(contrastRatio(grey(40), grey(80))).toBeGreaterThanOrEqual(3);
  });

  it("body copy on the light surface meets AA", () => {
    // text-hsl30 on bg-hsl95, the default pairing used across the flows.
    expect(contrastRatio(grey(30), grey(95))).toBeGreaterThanOrEqual(4.5);
  });
});
