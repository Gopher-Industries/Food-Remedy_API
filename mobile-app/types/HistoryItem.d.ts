/**
 * History Items
 */
export type HistoryItem = {
  ownerScope: string;
  barcode: string;
  productName: string;
  brand: string | null;
  product: Product;      // parsed snapshot
  createdAt: string;     // ISO
  lastSeenAt: string;    // ISO
};
