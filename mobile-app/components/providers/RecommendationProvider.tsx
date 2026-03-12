/**
 * RecommendationProvider.tsx
 * Manages recommendation state and caching
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import type { RecommendationScore } from "@/services/recommendations";
import type { Product } from "@/types/Product";
import type { NutritionalProfile } from "@/types/NutritionalProfile";
import { getRecommendationsWithCandidates } from "@/services/api/recommendations";

interface RecommendationContextType {
  recommendations: RecommendationScore[];
  loading: boolean;
  error: string | null;

  // Load recommendations for a product given a set of candidates
  loadRecommendations: (
    product: Product,
    profile: NutritionalProfile,
    candidates: Product[],
    limit?: number
  ) => Promise<void>;

  // Clear cached recommendations
  clearRecommendations: () => void;
}

const RecommendationContext = createContext<RecommendationContextType | undefined>(undefined);

export const RecommendationProvider = ({ children }: { children: ReactNode }) => {
  const [recommendations, setRecommendations] = useState<RecommendationScore[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRecommendations = useCallback(
    async (
      product: Product,
      profile: NutritionalProfile,
      candidates: Product[],
      limit = 5
    ) => {
      setLoading(true);
      setError(null);
      try {
        const recs = await getRecommendationsWithCandidates(product, profile, candidates, limit);
        setRecommendations(recs);
      } catch (err: any) {
        console.error("[RecommendationProvider] Error loading recommendations:", err);
        setError(err?.message || "Failed to load recommendations");
        setRecommendations([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const clearRecommendations = useCallback(() => {
    setRecommendations([]);
    setError(null);
  }, []);

  return (
    <RecommendationContext.Provider
      value={{
        recommendations,
        loading,
        error,
        loadRecommendations,
        clearRecommendations,
      }}
    >
      {children}
    </RecommendationContext.Provider>
  );
};

export const useRecommendations = (): RecommendationContextType => {
  const ctx = useContext(RecommendationContext);
  if (!ctx) {
    throw new Error("useRecommendations must be used within a RecommendationProvider");
  }
  return ctx;
};
