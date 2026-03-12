/**
 * FavouriteItem
 */
export type FavouriteItem = {
  userId: string;
  barcode: string;
  productName: string;
  brand: string | null;
  product: Product;        // parsed snapshot
  createdAt: string;
  updatedAt: string;
};