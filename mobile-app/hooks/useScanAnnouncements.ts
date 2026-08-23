import { useEffect, useRef } from "react";
import { AccessibilityInfo } from "react-native";
import type { Product } from "@/types/Product";

type ScanAnnouncement = "processing" | "found" | "notFound";

interface UseScanAnnouncementsOptions {
  barcode: string | null;
  loading: boolean;
  error: string | null;
  product: Product | null;
}

export function useScanAnnouncements({
  barcode,
  loading,
  error,
  product,
}: UseScanAnnouncementsOptions) {
  const lifecycleBarcodeRef = useRef<string | null>(null);
  const announcedStepsRef = useRef<Set<ScanAnnouncement>>(new Set());

  useEffect(() => {
    if (!barcode) return;

    if (lifecycleBarcodeRef.current !== barcode) {
      lifecycleBarcodeRef.current = barcode;
      announcedStepsRef.current = new Set();
    }

    const announceOnce = (step: ScanAnnouncement, message: string) => {
      if (announcedStepsRef.current.has(step)) return;
      announcedStepsRef.current.add(step);
      AccessibilityInfo.announceForAccessibility(message);
    };

    if (loading) {
      announceOnce("processing", "Processing");
      return;
    }

    if (!announcedStepsRef.current.has("processing")) return;

    if (error) return;

    if (product) announceOnce("found", "Found");
  }, [barcode, error, loading, product]);
}