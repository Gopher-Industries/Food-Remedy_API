// Search Product Provider

import { Product } from '@/types/Product';
import React, { createContext, useState, useContext, ReactNode, Dispatch, SetStateAction, useEffect } from 'react';
import { useNotification } from './NotificationProvider';
import { searchProducts } from '@/services';
import { getEmptySearchSuggestions } from '@/services/search/emptySearchSuggestions';

interface SearchProductContextType {
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  lastQuery: string;
  setLastQuery: Dispatch<SetStateAction<string>>;
  recentQueries: string[];
  clearRecentQueries: () => void;

  hasSearched: boolean;
  setHasSearched: Dispatch<SetStateAction<boolean>>;
  queryInvalid: boolean;
  setQueryInvalid: Dispatch<SetStateAction<boolean>>;

  loading: boolean;

  productResults: Product[];
  setProductResults: Dispatch<SetStateAction<Product[]>>;

  handleSearchProducts: () => Promise<void>;
}


const SearchProductContext = createContext<SearchProductContextType | undefined>(undefined);

export const SearchProductProvider = ({ children }: { children: ReactNode }) => {
  const { addNotification } = useNotification();

  // Search
  const [query, setQuery] = useState<string>("");
  const [lastQuery, setLastQuery] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [queryInvalid, setQueryInvalid] = useState<boolean>(false);
  const [recentQueries, setRecentQueries] = useState<string[]>([]);
  // Results
  const [productResults, setProductResults] = useState<Product[]>([]);

  const clearRecentQueries = () => setRecentQueries([]);

  useEffect(() => {
    if (query.trim().length === 0) {
      setHasSearched(false);
      setLastQuery("");
      setProductResults([]);
      setLoading(false);
    }
  }, [query]);

  /**
   * Search Products
   */
  const handleSearchProducts = async () => {
    const q = query.trim();
    setHasSearched(true);
    setLastQuery(q);

    if (!q) {
      setQueryInvalid(true);
      setProductResults([]);
      setLoading(false);
      return;
    }

    setQueryInvalid(false);

    try {
      setLoading(true);

      const products = await searchProducts(q);
      console.log("RAN: ", products);

      setProductResults(products);
      if (q && !recentQueries.includes(q)) {
        setRecentQueries((previous) => [q, ...previous].slice(0, 5));
      }
    } catch (error) {
      setProductResults([]);
      addNotification("Error Finding Products", "e");
      console.error("Error Finding Product: ", error);
    } finally {
      setLoading(false);
    }
  };


  return (
    <SearchProductContext.Provider value={{
      query, setQuery,
      lastQuery, setLastQuery,
      recentQueries,
      clearRecentQueries,
      hasSearched, setHasSearched,
      queryInvalid, setQueryInvalid,
      loading,
      productResults, setProductResults,
      handleSearchProducts,
    }}>
      {children}
    </SearchProductContext.Provider>
  );
};

export const useSearchProduct = (): SearchProductContextType => {
  const ctx = useContext(SearchProductContext);
  if (!ctx) {
    throw new Error('useSearchProduct must be used within a ProductProvider');
  }
  return ctx;
};