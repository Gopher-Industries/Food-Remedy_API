// types/ShoppingListItem.d.ts

import type { Product } from "./Product";

/**
 * ShoppingListItem
 *
 * Represents a planned product to buy.
 * Similar pattern to HistoryItem / FavouriteItem but with a
 * planned purchase date and completion flag.
 */
export type ShoppingListItem = {
  barcode: string | null;     // product barcode if known
  productName: string;        // display name
  brand: string | null;
  product: Product | null;    // optional snapshot (can be null if manually added)

  /** When this list entry was created (ISO) */
  createdAt: string;

  /** Planned purchase date (ISO), can be null if not set */
  plannedPurchaseDate: string | null;

  /** Whether the user has already purchased this item */
  isCompleted: boolean;

  /** Optional notes (e.g. "only if on special", "check gluten-free") */
  notes?: string | null;
};
