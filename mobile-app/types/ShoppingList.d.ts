// Shopping List Type Definitions

export interface ShoppingList {
  listId: string;
  userId: string;
  listName: string;
  color?: string;
  emoji?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShoppingListItem {
  listId: string;
  barcode: string;
  productName: string;
  brand: string | null;
  quantity: number;
  note?: string;
  isChecked: boolean;
  productJson: string;
  addedAt: string;
  updatedAt: string;
}
