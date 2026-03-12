// components/product/AllergenHighlighter.tsx

import React from "react";
import Tt from "../ui/UIText";
import { normaliseAllergen } from "@/types/allergens";

interface AllergenHighlighterProps {
  ingredientsText: string | null;
  highlightAllergens: string[]; // list of allergen words (raw or normalised)
  className?: string;
  enabled?: boolean; // toggle highlighting on/off
}

/**
 * Highlight allergen words inline in the ingredients text.
 */
const AllergenHighlighter: React.FC<AllergenHighlighterProps> = ({
  ingredientsText,
  highlightAllergens,
  className,
  enabled = true,
}) => {
  if (!ingredientsText) {
    return (
      <Tt className={className ?? "text-hsl40 dark:text-hsl80"}>
        No ingredient information available.
      </Tt>
    );
  }

  const highlightSet = new Set(
    highlightAllergens.map(normaliseAllergen).filter(Boolean),
  );

  // Split text but keep whitespace and punctuation so spacing stays intact
  const tokens = ingredientsText.split(/(\s+|,|;|\(|\)|\.|:)/g);

  return (
    <Tt className={className}>
      {tokens.map((token, idx) => {
        const core = token.replace(/[^a-z]/gi, "");
        const isAllergen =
          enabled &&
          core.length > 0 &&
          highlightSet.has(normaliseAllergen(core));

        if (!isAllergen) {
          // normal text segment
          return <Tt key={idx}>{token}</Tt>;
        }

        // highlighted allergen segment
        return (
          <Tt
            key={idx}
            className="bg-[#FEE2E2] text-[#B91C1C] font-interSemiBold rounded-sm"
          >
            {token}
          </Tt>
        );
      })}
    </Tt>
  );
};

export default AllergenHighlighter;
