/*
BE073: verifies the Firestore cleanup helpers invoked during account deletion for
shopping lists (USERS/{uid}/SHOPPING_LISTS + nested ITEMS) and the legacy cart
(users/{uid}/cart). Covers batch-write chunking above the Firestore write limit,
idempotency on already-empty/missing resources, and that every read/delete path
is scoped to the given uid.
*/

jest.mock('@/config/firebaseConfig', () => ({ fdb: {} }));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn((_db: unknown, path: string) => ({ path })),
  doc: jest.fn((_db: unknown, path: string) => ({ path })),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  getDocsFromServer: jest.fn(),
  deleteDoc: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  query: jest.fn((col: unknown) => col),
  orderBy: jest.fn(),
  where: jest.fn(),
  writeBatch: jest.fn(),
}));

import { collection, deleteDoc, getDocs, getDocsFromServer, writeBatch } from 'firebase/firestore';
import { deleteShoppingListFirestore, deleteAllShoppingListsFirestore } from '@/services/database/user/shoppingLists';
import { deleteLegacyCartData } from '@/services/database/user/legacyCart';

const mockItemDocs = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: `item-${i}`, ref: { id: `item-${i}` } }));

describe('BE073 cloud shopping-list cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (deleteDoc as jest.Mock).mockResolvedValue(undefined);
  });

  it('deletes list items in a single batch when under the Firestore write limit', async () => {
    (getDocs as jest.Mock).mockResolvedValue({ docs: mockItemDocs(10) });
    const commit = jest.fn().mockResolvedValue(undefined);
    const del = jest.fn();
    (writeBatch as jest.Mock).mockReturnValue({ delete: del, commit });

    await deleteShoppingListFirestore('user-a', 'list-1');

    expect(writeBatch).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledTimes(10);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(deleteDoc).toHaveBeenCalledTimes(1);
  });

  it('chunks item deletion across multiple batches above the Firestore write limit', async () => {
    (getDocs as jest.Mock).mockResolvedValue({ docs: mockItemDocs(900) });
    const commits: jest.Mock[] = [];
    (writeBatch as jest.Mock).mockImplementation(() => {
      const commit = jest.fn().mockResolvedValue(undefined);
      commits.push(commit);
      return { delete: jest.fn(), commit };
    });

    await deleteShoppingListFirestore('user-a', 'list-big');

    expect(writeBatch).toHaveBeenCalledTimes(2);
    commits.forEach((commit) => expect(commit).toHaveBeenCalledTimes(1));
    expect(deleteDoc).toHaveBeenCalledTimes(1);
  });

  it('is idempotent when a list has no items or the list is already gone', async () => {
    (getDocs as jest.Mock).mockResolvedValue({ docs: [] });

    await expect(deleteShoppingListFirestore('user-a', 'list-missing')).resolves.toBeUndefined();

    expect(writeBatch).not.toHaveBeenCalled();
    expect(deleteDoc).toHaveBeenCalledTimes(1);
  });

  it('deletes every list owned by the uid, scoped to that uid\'s path', async () => {
    (getDocsFromServer as jest.Mock).mockResolvedValue({
      docs: [
        { data: () => ({ listId: 'list-1', userId: 'user-a', listName: 'A', createdAt: '', updatedAt: '' }) },
        { data: () => ({ listId: 'list-2', userId: 'user-a', listName: 'B', createdAt: '', updatedAt: '' }) },
      ],
    });
    (getDocs as jest.Mock).mockResolvedValue({ docs: [] });

    await deleteAllShoppingListsFirestore('user-a');

    const collectionPaths = (collection as jest.Mock).mock.calls.map((call) => call[1]);
    expect(collectionPaths).toContain('USERS/user-a/SHOPPING_LISTS');
    expect(collectionPaths).toContain('USERS/user-a/SHOPPING_LISTS/list-1/ITEMS');
    expect(collectionPaths).toContain('USERS/user-a/SHOPPING_LISTS/list-2/ITEMS');
    expect(collectionPaths.every((path: string) => path.includes('user-a'))).toBe(true);
    expect(deleteDoc).toHaveBeenCalledTimes(2);
  });

  it('is a no-op when the account owns no shopping lists', async () => {
    (getDocsFromServer as jest.Mock).mockResolvedValue({ docs: [] });

    await expect(deleteAllShoppingListsFirestore('user-a')).resolves.toBeUndefined();

    expect(getDocs).not.toHaveBeenCalled();
    expect(deleteDoc).not.toHaveBeenCalled();
  });
});

describe('BE073 legacy cart cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletes legacy cart documents scoped to the uid, chunked for large carts', async () => {
    (getDocs as jest.Mock).mockResolvedValue({ docs: mockItemDocs(500) });
    const commits: jest.Mock[] = [];
    (writeBatch as jest.Mock).mockImplementation(() => {
      const commit = jest.fn().mockResolvedValue(undefined);
      commits.push(commit);
      return { delete: jest.fn(), commit };
    });

    await deleteLegacyCartData('user-a');

    expect(collection).toHaveBeenCalledWith({}, 'users/user-a/cart');
    expect(writeBatch).toHaveBeenCalledTimes(2);
    commits.forEach((commit) => expect(commit).toHaveBeenCalledTimes(1));
  });

  it('is idempotent when the legacy cart is already empty or missing', async () => {
    (getDocs as jest.Mock).mockResolvedValue({ docs: [] });

    await expect(deleteLegacyCartData('user-a')).resolves.toBeUndefined();

    expect(writeBatch).not.toHaveBeenCalled();
  });

  it('never queries another account\'s cart path', async () => {
    (getDocs as jest.Mock).mockResolvedValue({ docs: [] });

    await deleteLegacyCartData('user-a');

    const collectionPaths = (collection as jest.Mock).mock.calls.map((call) => call[1]);
    expect(collectionPaths).toEqual(['users/user-a/cart']);
  });
});
