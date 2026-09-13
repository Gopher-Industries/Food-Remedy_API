import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Product } from "@/types/Product";

export const CACHE_KEY = "product-cache-v1";
export const MAX_CACHED_ITEMS = 20;
export const CACHE_TTL = 24 * 60 * 60 * 1000;
export const CACHE_RETENTION = 7 * 24 * 60 * 60 * 1000;

export interface ProductCacheEntry {
  id: string;
  data: Product;
  cachedAt: number;
  lastAccessedAt: number;
  version: number;
}

function getEntryId(product: Product): string {
  return String(product.barcode ?? product.id ?? "").trim();
}

async function readEntries(): Promise<ProductCacheEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => entry && typeof entry === "object" && typeof entry.id === "string");
  } catch (error) {
    console.warn("[ProductCache] read failed", error);
    return [];
  }
}

async function writeEntries(entries: ProductCacheEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(entries));
  } catch (error) {
    console.warn("[ProductCache] write failed", error);
  }
}

export function isCacheFresh(entry: ProductCacheEntry | null | undefined): boolean {
  if (!entry) return false;
  return Date.now() - entry.cachedAt <= CACHE_TTL;
}

export function isConnectivityError(error: unknown): boolean {
  if (!error) return false;

  const source = String(
    typeof error === "object" && error !== null && "message" in error
      ? (error as { message?: string }).message ?? ""
      : error
  ).toLowerCase();

  const status = typeof error === "object" && error !== null && "status" in error
    ? Number((error as { status?: number }).status)
    : undefined;

  const retryable = typeof error === "object" && error !== null && "retryable" in error
    ? Boolean((error as { retryable?: boolean }).retryable)
    : false;

  if (retryable) return true;
  if (typeof status === "number" && [0, 408, 429].includes(status)) return true;

  return /network|offline|failed to fetch|timeout|timed out|no internet|connection|fetch failed/i.test(source);
}

export async function cacheEntity(entity: Product | null | undefined): Promise<ProductCacheEntry | null> {
  if (!entity) return null;

  const id = getEntryId(entity);
  if (!id) return null;

  const now = Date.now();
  const entries = await readEntries();
  const filtered = entries.filter((entry) => entry.id !== id);

  const nextEntry: ProductCacheEntry = {
    id,
    data: entity,
    cachedAt: now,
    lastAccessedAt: now,
    version: 1,
  };

  const withLatest = [nextEntry, ...filtered].sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);
  const pruned = withLatest
    .filter((entry) => Date.now() - entry.cachedAt <= CACHE_RETENTION)
    .slice(0, MAX_CACHED_ITEMS);

  await writeEntries(pruned);
  return nextEntry;
}

export async function getCachedEntity(id: string): Promise<ProductCacheEntry | null> {
  const entries = await readEntries();
  const match = entries.find((entry) => entry.id === String(id));
  if (!match) return null;

  const updated = entries.map((entry) => {
    if (entry.id !== String(id)) return entry;
    return { ...entry, lastAccessedAt: Date.now() };
  });

  await writeEntries(updated);
  return updated.find((entry) => entry.id === String(id)) ?? null;
}

export async function removeCachedEntity(id: string): Promise<void> {
  const entries = await readEntries();
  const next = entries.filter((entry) => entry.id !== String(id));
  await writeEntries(next);
}

export async function updateLastAccessed(id: string): Promise<void> {
  const entries = await readEntries();
  const next = entries.map((entry) => {
    if (entry.id !== String(id)) return entry;
    return { ...entry, lastAccessedAt: Date.now() };
  });
  await writeEntries(next);
}

export async function cleanupCache(): Promise<void> {
  const now = Date.now();
  const entries = await readEntries();
  const kept = entries
    .filter((entry) => now - entry.cachedAt <= CACHE_RETENTION)
    .sort((a, b) => b.lastAccessedAt - a.lastAccessedAt)
    .slice(0, MAX_CACHED_ITEMS);

  await writeEntries(kept);
}

export async function clearEntityCache(): Promise<void> {
  await AsyncStorage.removeItem(CACHE_KEY);
}
