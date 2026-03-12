// Product Provider

import { Product } from "@/types/Product";
import React, {
  createContext,
  useState,
  useContext,
  ReactNode,
  Dispatch,
  SetStateAction,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { useNotification } from "./NotificationProvider";
import { useSQLiteDatabase } from "./SQLiteDatabaseProvider";
import {
  bumpHistory,
  getHistoryItem,
  pruneHistory,
} from "@/services/sqlDatabase/history.dao";
import { getProductById } from "@/services";

interface ProductContextType {
  barcode: string | null;
  setBarcode: Dispatch<SetStateAction<string | null>>;

  currentProduct: Product | null;
  setCurrentProduct: Dispatch<SetStateAction<Product | null>>;
  clearProduct: () => void;

  /** Cache-first loader (SWR); preferCache defaults to true */
  loadProductByBarcode: (
    barcode: string,
    opts?: { preferCache?: boolean; force?: boolean }
  ) => Promise<void>;

  /** Network-only refresh for pull-to-refresh etc */
  refreshCurrentProduct: () => Promise<void>;

  loading: boolean;
  error: string | null;
}

const BUMP_DEBOUNCE_MS = 1500;

const ProductContext = createContext<ProductContextType | undefined>(undefined);

export const ProductProvider = ({ children }: { children: ReactNode }) => {
  const { addNotification } = useNotification();
  const { db, isDbReady } = useSQLiteDatabase();

  const [barcode, setBarcode] = useState<string | null>(null);
  const [currentProduct, setCurrentProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Avoid bumping the same product repeatedly on tiny re-renders
  const lastBumpRef = useRef<{ barcode: string; t: number } | null>(null);
  // Keep an abort controller per request to cancel if id changes quickly
  const abortRef = useRef<AbortController | null>(null);

  const clearProduct = () => {
    setCurrentProduct(null);
  };

  /**
   * Bump If Needed
   * Add Product to History when product is viewed
   */
  const bumpIfNeeded = useCallback(
    async (p: Product) => {
      if (!db || !isDbReady || !p?.barcode) return;
      const now = Date.now();
      const last = lastBumpRef.current;
      if (last && last.barcode === p.barcode && now - last.t < BUMP_DEBOUNCE_MS)
        return;

      try {
        await bumpHistory(db, p);
        await pruneHistory(db, 500); // optional cap
        lastBumpRef.current = { barcode: p.barcode, t: now };
      } catch (error) {
        console.warn("[ProductProvider] bump failed", error);
      }
    },
    [db, isDbReady]
  );

  useEffect(() => {
    if (currentProduct) bumpIfNeeded(currentProduct);
    // eslint-disable-line react-hooks/exhaustive-deps
  }, [currentProduct?.barcode]);

  const fetchRemote = useCallback(
    async (code: string): Promise<Product | null> => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;



      try {
        const data = await getProductById(code);

        if (!data) {
          setError(null);
          setCurrentProduct(null);
          addNotification("No product found for that barcode.", "n");
          return null;
        }


        return data;
      } catch (err: any) {
        if (err?.code === "ERR_CANCELED") return null;
        console.error("[Product][Error]", err);
        setError("error");
        addNotification("Failed to fetch product. Please try again.", "e");
        return null;
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [addNotification]
  );

  /**
   * Load Product By Barcode
   */
  const loadProductByBarcode = useCallback(
    async (code: string, opts?: { preferCache?: boolean; force?: boolean }) => {
      const preferCache = opts?.preferCache ?? true;
      const force = opts?.force ?? false;

      setLoading(true);
      setError(null);
      try {
        let showedCache = false;

        // 1) Try cache (history)
        if (preferCache && db && isDbReady) {
          const cached = await getHistoryItem(db, code);
          if (cached?.product) {
            setCurrentProduct(cached.product);
            showedCache = true;
          }
        }

        // 2) Only fetch if cache missing or force is true
        if (!showedCache || force) {
          const fresh = await fetchRemote(code);
          setCurrentProduct(fresh); // may be null if not found / error
        }
      } finally {
        setLoading(false);
      }
    },
    [db, isDbReady, fetchRemote]
  );

  useEffect(() => {
    if (!barcode) return;
    loadProductByBarcode(barcode, { preferCache: true });
  }, [barcode]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshCurrentProduct = useCallback(async () => {
    if (!currentProduct?.barcode) return;
    setLoading(true);
    try {
      const fresh = await fetchRemote(currentProduct.barcode);
      if (fresh) setCurrentProduct(fresh);
    } finally {
      setLoading(false);
    }
  }, [currentProduct?.barcode, fetchRemote]);

  return (
    <ProductContext.Provider
      value={{
        barcode,
        setBarcode,
        currentProduct,
        setCurrentProduct,
        loadProductByBarcode,
        refreshCurrentProduct,
        clearProduct,
        loading,
        error,
      }}
    >
      {children}
    </ProductContext.Provider>
  );
};

export const useProduct = (): ProductContextType => {
  const ctx = useContext(ProductContext);
  if (!ctx) {
    throw new Error("useProduct must be used within a ProductProvider");
  }
  return ctx;
};
