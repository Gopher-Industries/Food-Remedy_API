// Firestore Shopping Lists Service

import { v4 as uuidv4 } from 'uuid';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getDocsFromServer,
  query,
  orderBy,
  setDoc,
  updateDoc,
  deleteDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { fdb } from '@/config/firebaseConfig';
import type { ShoppingList, ShoppingListItem } from '@/types/ShoppingList';
import type { Product } from '@/types/Product';

const nowIso = () => new Date().toISOString();

// Paths
const listsCol = (uid: string) => collection(fdb, `USERS/${uid}/SHOPPING_LISTS`);
const listDoc = (uid: string, listId: string) => doc(fdb, `USERS/${uid}/SHOPPING_LISTS/${listId}`);
const itemsCol = (uid: string, listId: string) => collection(fdb, `USERS/${uid}/SHOPPING_LISTS/${listId}/ITEMS`);
// Use barcode as item doc id for uniqueness within a list
const itemDoc = (uid: string, listId: string, barcode: string) => doc(fdb, `USERS/${uid}/SHOPPING_LISTS/${listId}/ITEMS/${barcode}`);

// ================= SHOPPING LISTS =================

export async function createShoppingListFirestore(
  uid: string,
  list: ShoppingList
): Promise<void> {
  const payload: any = {
    listId: list.listId,
    userId: uid,
    listName: list.listName,
    color: list.color ?? null,
    emoji: list.emoji ?? null,
    createdAt: list.createdAt,
    updatedAt: list.updatedAt,
  };
  await setDoc(listDoc(uid, list.listId), payload);
}

export async function getShoppingListsFirestore(uid: string): Promise<ShoppingList[]> {
  // Avoid orderBy on fields that may be missing (older docs), which would exclude them.
  let snap;
  try {
    snap = await getDocsFromServer(listsCol(uid));
  } catch {
    snap = await getDocs(listsCol(uid));
  }
  const lists = snap.docs.map((d) => d.data() as ShoppingList);
  return lists.sort((a, b) => {
    const aTime = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
    const bTime = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
    return bTime - aTime;
  });
}

export async function getShoppingListFirestore(uid: string, listId: string): Promise<ShoppingList | null> {
  const snap = await getDoc(listDoc(uid, listId));
  return snap.exists() ? (snap.data() as ShoppingList) : null;
}

export async function updateShoppingListFirestore(
  uid: string,
  listId: string,
  updates: { listName?: string; color?: string; emoji?: string }
): Promise<void> {
  const now = nowIso();
  const patch: any = { updatedAt: now };
  if (updates.listName !== undefined) patch.listName = updates.listName;
  if (updates.color !== undefined) patch.color = updates.color ?? null;
  if (updates.emoji !== undefined) patch.emoji = updates.emoji ?? null;
  await updateDoc(listDoc(uid, listId), patch);
}

export async function deleteShoppingListFirestore(uid: string, listId: string): Promise<void> {
  // Manually cascade delete items
  const itemsSnap = await getDocs(itemsCol(uid, listId));
  if (!itemsSnap.empty) {
    const batch = writeBatch(fdb);
    for (const d of itemsSnap.docs) {
      batch.delete(d.ref);
    }
    await batch.commit();
  }
  await deleteDoc(listDoc(uid, listId));
}

// ================= SHOPPING LIST ITEMS =================

export async function addItemToListFirestore(
  uid: string,
  listId: string,
  product: Product,
  quantity: number = 1,
  note?: string
): Promise<void> {
  const now = nowIso();
  const ref = itemDoc(uid, listId, product.barcode);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const curr = snap.data() as ShoppingListItem;
      const nextQty = Math.max(1, (curr.quantity ?? 0) + (quantity || 0));
      const patch: any = {
        productName: product.productName,
        brand: product.brand ?? null,
        quantity: nextQty,
        productJson: JSON.stringify(product ?? null),
        updatedAt: now,
      };
      if (note !== undefined) patch.note = note ?? null;
      await updateDoc(ref, patch);
    } else {
      const payload: any = {
        listId,
        barcode: product.barcode,
        productName: product.productName,
        brand: product.brand ?? null,
        quantity: Math.max(1, quantity || 1),
        note: note ?? null,
        isChecked: false,
        productJson: JSON.stringify(product ?? null),
        addedAt: now,
        updatedAt: now,
      };
      await setDoc(ref, payload);
    }
  } catch (e) {
    // Fallback: write without reading (in case of temporary read issues)
    const payload: any = {
      listId,
      barcode: product.barcode,
      productName: product.productName,
      brand: product.brand ?? null,
      quantity: Math.max(1, quantity || 1),
      note: note ?? null,
      isChecked: false,
      productJson: JSON.stringify(product ?? null),
      addedAt: now,
      updatedAt: now,
    };
    await setDoc(ref, payload, { merge: true });
  }
  // Update parent list updatedAt
  await updateDoc(listDoc(uid, listId), { updatedAt: now } as any);
}

export async function getListItemsFirestore(
  uid: string,
  listId: string
): Promise<(ShoppingListItem & { product: Product })[]> {
  // Ordered query needs a composite index; fallback to unordered for sync if missing.
  const q = query(itemsCol(uid, listId), orderBy('isChecked', 'asc'), orderBy('addedAt', 'desc'));
  let snap;
  try {
    snap = await getDocsFromServer(q);
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    if (msg.includes("requires an index")) {
      try {
        snap = await getDocsFromServer(itemsCol(uid, listId));
      } catch {
        snap = await getDocs(itemsCol(uid, listId));
      }
    } else {
      snap = await getDocs(q);
    }
  }
  return snap.docs.map((d) => {
    const data = d.data() as ShoppingListItem;
    const product = safeParseProduct(data.productJson);
    return { ...data, listId, product };
  });
}

function safeParseProduct(s: string): Product {
  try { return JSON.parse(s); } catch { return {} as Product; }
}

export async function updateItemQuantityFirestore(
  uid: string,
  listId: string,
  barcode: string,
  quantity: number
): Promise<void> {
  const now = nowIso();
  await updateDoc(itemDoc(uid, listId, barcode), { quantity, updatedAt: now } as any);
}

export async function updateItemNoteFirestore(
  uid: string,
  listId: string,
  barcode: string,
  note: string | null
): Promise<void> {
  const now = nowIso();
  await updateDoc(itemDoc(uid, listId, barcode), { note: note ?? null, updatedAt: now } as any);
}

export async function toggleItemCheckedFirestore(
  uid: string,
  listId: string,
  barcode: string
): Promise<boolean> {
  const now = nowIso();
  const ref = itemDoc(uid, listId, barcode);
  const snap = await getDoc(ref);
  if (!snap.exists()) return false;
  const current = snap.data() as ShoppingListItem;
  const newState = !current.isChecked;
  await updateDoc(ref, { isChecked: newState, updatedAt: now } as any);
  return newState;
}

export async function removeItemFromListFirestore(
  uid: string,
  listId: string,
  barcode: string
): Promise<void> {
  await deleteDoc(itemDoc(uid, listId, barcode));
}

export async function clearCheckedItemsFirestore(uid: string, listId: string): Promise<void> {
  const q = query(itemsCol(uid, listId), where('isChecked', '==', true));
  const snap = await getDocs(q);
  if (snap.empty) return;
  const batch = writeBatch(fdb);
  for (const d of snap.docs) batch.delete(d.ref);
  await batch.commit();
}

export async function clearAllItemsFirestore(uid: string, listId: string): Promise<void> {
  const snap = await getDocs(itemsCol(uid, listId));
  if (snap.empty) return;
  const batch = writeBatch(fdb);
  for (const d of snap.docs) batch.delete(d.ref);
  await batch.commit();
}

export async function getListItemCountFirestore(uid: string, listId: string): Promise<number> {
  const snap = await getDocs(itemsCol(uid, listId));
  return snap.size;
}

// ================= BACKFILL / UPSERT =================

export async function upsertItemInListFirestore(
  uid: string,
  listId: string,
  item: ShoppingListItem
): Promise<void> {
  const ref = itemDoc(uid, listId, item.barcode);
  const payload: any = {
    listId,
    barcode: item.barcode,
    productName: item.productName,
    brand: item.brand ?? null,
    quantity: item.quantity,
    note: item.note ?? null,
    isChecked: !!item.isChecked,
    productJson: item.productJson ?? null,
    addedAt: item.addedAt,
    updatedAt: item.updatedAt,
  };
  await setDoc(ref, payload, { merge: true });
}

export default {
  createShoppingListFirestore,
  getShoppingListsFirestore,
  getShoppingListFirestore,
  updateShoppingListFirestore,
  deleteShoppingListFirestore,
  addItemToListFirestore,
  getListItemsFirestore,
  updateItemQuantityFirestore,
  toggleItemCheckedFirestore,
  removeItemFromListFirestore,
  clearCheckedItemsFirestore,
  clearAllItemsFirestore,
  getListItemCountFirestore,
};
