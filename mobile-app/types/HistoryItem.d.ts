/**
 * History Items
 */
export type HistoryItem = {
  barcode: string;
  productName: string;
  brand: string | null;
  product: Product;      // parsed snapshot
  createdAt: string;     // ISO
  lastSeenAt: string;    // ISO
};