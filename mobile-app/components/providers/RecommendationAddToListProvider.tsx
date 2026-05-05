// Recommendation Add To List Provider
// Context for managing products selected from recommendations to be added to shopping list

import React, { createContext, useContext, useState, useCallback } from "react";
import type { SuggestedProduct } from "@/types/SuggestedProduct";

interface RecommendationAddToListContextProps {
  productsToAdd: SuggestedProduct[];
  setProductsToAdd: (products: SuggestedProduct[]) => void;
  clearProductsToAdd: () => void;
  addProducts: (products: SuggestedProduct[]) => void;
}

const RecommendationAddToListContext = createContext<
  RecommendationAddToListContextProps | undefined
>(undefined);

export const RecommendationAddToListProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [productsToAdd, setProductsToAdd] = useState<SuggestedProduct[]>([]);

  const clearProductsToAdd = useCallback(() => {
    setProductsToAdd([]);
  }, []);

  const addProducts = useCallback((products: SuggestedProduct[]) => {
    setProductsToAdd(products);
  }, []);

  return (
    <RecommendationAddToListContext.Provider
      value={{
        productsToAdd,
        setProductsToAdd,
        clearProductsToAdd,
        addProducts,
      }}
    >
      {children}
    </RecommendationAddToListContext.Provider>
  );
};

export const useRecommendationAddToList = () => {
  const context = useContext(RecommendationAddToListContext);
  if (!context) {
    throw new Error(
      "useRecommendationAddToList must be used within a RecommendationAddToListProvider"
    );
  }
  return context;
};
