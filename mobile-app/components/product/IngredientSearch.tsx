// components/product/IngredientSearch.tsx

import React, { useState, useMemo } from "react";
import { View, TextInput, Pressable } from "react-native";
import Tt from "../ui/UIText";
import IconGeneral from "../icons/IconGeneral";
import { color } from "@/app/design/token";

interface IngredientSearchProps {
  ingredientsText: string | null;
  className?: string;
}

interface Match {
  start: number;
  end: number;
  text: string;
}

/**
 * IngredientSearch Component
 * 
 * Allows users to search for specific keywords within ingredients text.
 * Features:
 * - Real-time search input
 * - Highlights all matching keywords
 * - Navigate between matches with previous/next buttons
 * - Shows current match position (e.g., "2 of 5")
 */
const IngredientSearch: React.FC<IngredientSearchProps> = ({
  ingredientsText,
  className,
}) => {
  const [searchKeyword, setSearchKeyword] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  // Find all matches of the search keyword in the ingredients text
  const matches = useMemo(() => {
    if (!searchKeyword.trim() || !ingredientsText) return [];

    const keyword = searchKeyword.toLowerCase();
    const text = ingredientsText.toLowerCase();
    const foundMatches: Match[] = [];
    let index = 0;

    while (index < text.length) {
      const matchIndex = text.indexOf(keyword, index);
      if (matchIndex === -1) break;

      foundMatches.push({
        start: matchIndex,
        end: matchIndex + keyword.length,
        text: ingredientsText.substring(matchIndex, matchIndex + keyword.length),
      });

      index = matchIndex + 1; // Move forward to find overlapping matches
    }

    return foundMatches;
  }, [searchKeyword, ingredientsText]);

  // Reset current match index when search keyword changes
  React.useEffect(() => {
    setCurrentMatchIndex(0);
  }, [searchKeyword]);

  // Navigate to previous match
  const handlePrevious = () => {
    if (matches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev === 0 ? matches.length - 1 : prev - 1));
  };

  // Navigate to next match
  const handleNext = () => {
    if (matches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev === matches.length - 1 ? 0 : prev + 1));
  };

  // Render ingredients text with highlighted matches
  const renderHighlightedText = () => {
    if (!ingredientsText) {
      return (
        <Tt className="text-sm text-hsl40 dark:text-hsl80 italic">
          No ingredient information available.
        </Tt>
      );
    }

    if (!searchKeyword.trim() || matches.length === 0) {
      return (
        <Tt className={`text-sm text-hsl30 dark:text-hsl90 leading-relaxed text-justify ${className || ""}`}>
          {ingredientsText}
        </Tt>
      );
    }

    // Build segments with highlights
    const segments: React.ReactNode[] = [];
    let lastIndex = 0;

    matches.forEach((match, idx) => {
      // Add text before this match
      if (match.start > lastIndex) {
        segments.push(
          <Tt key={`text-${idx}`} className="text-sm text-hsl30 dark:text-hsl90">
            {ingredientsText.substring(lastIndex, match.start)}
          </Tt>
        );
      }

      // Add highlighted match
      const isCurrentMatch = idx === currentMatchIndex;
      segments.push(
        <Tt
          key={`match-${idx}`}
          className={`text-sm font-interSemiBold rounded-sm ${
            isCurrentMatch
              ? "bg-[#FFD700] text-[#000000]" // Current match - bright yellow
              : "bg-[#FFEB99] text-[#4D4D00]" // Other matches - light yellow
          }`}
        >
          {match.text}
        </Tt>
      );

      lastIndex = match.end;
    });

    // Add remaining text after last match
    if (lastIndex < ingredientsText.length) {
      segments.push(
        <Tt key="text-end" className="text-sm text-hsl30 dark:text-hsl90">
          {ingredientsText.substring(lastIndex)}
        </Tt>
      );
    }

    return (
      <Tt className="text-sm leading-relaxed text-justify">
        {segments}
      </Tt>
    );
  };

  return (
    <View className="mb-6">
      {/* SEARCH INPUT & CONTROLS */}
      <View className="mb-4 bg-white dark:bg-hsl15 rounded-lg border border-hsl85 dark:border-hsl20 overflow-hidden">
        {/* Search Input Row */}
        <View className="flex-row items-center px-3 py-2">
          <IconGeneral type="search" fill={color.iconDefault} size={20} />
          <TextInput
            value={searchKeyword}
            onChangeText={setSearchKeyword}
            placeholder="Search ingredients (e.g., peanut, dairy)..."
            placeholderTextColor="#999"
            className="flex-1 ml-2 text-sm text-hsl20 font-interRegular"
            style={{ outlineStyle: "none" } as any}
          />
          {searchKeyword.length > 0 && (
            <Pressable onPress={() => setSearchKeyword("")} className="p-1">
              <IconGeneral type="close" fill={color.iconDefault} size={20} />
            </Pressable>
          )}
        </View>

        {/* Navigation Controls - Only show when there are matches */}
        {matches.length > 0 && (
          <View className="flex-row items-center justify-between px-3 py-2 border-t border-hsl90 dark:border-hsl20 bg-hsl98 dark:bg-hsl10">
            <Tt className="text-xs text-hsl30 dark:text-hsl90 font-interMedium">
              {matches.length} {matches.length === 1 ? "match" : "matches"} found
            </Tt>

            <View className="flex-row items-center gap-x-2">
              <Tt className="text-xs text-hsl30 dark:text-hsl90 font-interMedium mr-2">
                {currentMatchIndex + 1} of {matches.length}
              </Tt>

              <Pressable
                onPress={handlePrevious}
                disabled={matches.length === 0}
                className="p-2 rounded bg-hsl95 dark:bg-hsl10 active:bg-hsl90 dark:bg-hsl15"
              >
                <IconGeneral
                  type="arrow-backward-ios"
                  fill={matches.length === 0 ? color.textMuted : color.iconDefault}
                  size={16}
                />
              </Pressable>

              <Pressable
                onPress={handleNext}
                disabled={matches.length === 0}
                className="p-2 rounded bg-hsl95 dark:bg-hsl10 active:bg-hsl90 dark:bg-hsl15"
              >
                <IconGeneral
                  type="arrow-forward-ios"
                  fill={matches.length === 0 ? color.textMuted : color.iconDefault}
                  size={16}
                />
              </Pressable>
            </View>
          </View>
        )}

        {/* No matches message */}
        {searchKeyword.trim() && matches.length === 0 && ingredientsText && (
          <View className="px-3 py-2 border-t border-hsl90 dark:border-hsl20 bg-[#FFF9E6]">
            <Tt className="text-xs text-[#8B7300] font-interMedium">
              No matches found for &quot;{searchKeyword}&quot;
            </Tt>
          </View>
        )}
      </View>

      {/* INGREDIENTS TEXT WITH HIGHLIGHTS */}
      {renderHighlightedText()}
    </View>
  );
};

export default IngredientSearch;
