// app/(app)/(tabs)/cart.tsx

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Pressable, ScrollView, RefreshControl, FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Tt from "@/components/ui/UIText";
import Header from "@/components/layout/Header";
import Screen from "@/components/layout/Screen";
import { router, useFocusEffect } from "expo-router";
import IconGeneral from "@/components/icons/IconGeneral";
import ModalWrapper from "@/components/modals/ModalAWrapper";
import ModalResponse from "@/components/modals/ModalResponse";
import CreateListModal from "@/components/modals/CreateListModal";
import { useModalManager } from "@/components/providers/ModalManagerProvider";
import { useShoppingList } from "@/hooks/useShoppingList";
import { Button } from "@/components/shared/Button";
import FolderGraphic from "@/components/graphics/FolderGraphic";
import { ShoppingListItemRow } from "@/components/shopping/ShoppingListItemRow";

const formatCreatedDate = (iso: string | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const formatCurrency = (value: number) => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: 2,
    }).format(value);
  } catch {
    return `$${value.toFixed(2)}`;
  }
};

const estimateItemPrice = (item: { barcode: string; productName: string; product: { productQuantity: number | null } }) => {
  if (item.product?.productQuantity && item.product.productQuantity > 0) {
    return Math.round((1.49 + item.product.productQuantity / 500) * 100) / 100;
  }
  const seed = Number(item.barcode.slice(-3).replace(/\D/g, "")) || item.productName.length * 10;
  const price = 1.49 + ((seed % 600) / 100);
  return Math.round(price * 100) / 100;
};

export default function ShoppingCartPage() {
  const insets = useSafeAreaInsets();
  const {
    ready,
    lists,
    refreshLists,
    createList,
    deleteList,
    getItemCount,
    syncAllToFirestore,
    currentItems,
    currentList,
    loadList,
    removeItem,
    updateQuantity,
  } = useShoppingList();
  const { openModal, modals } = useModalManager();

  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [itemCounts, setItemCounts] = useState<Record<string, number>>({});
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
  const [activeListId, setActiveListId] = useState<string | null>(null);

  const dummyCartList = {
    listId: "demo-cart",
    userId: "demo",
    listName: "Sample Cart",
    color: "#4F7AF0",
    emoji: "🛒",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const dummyCartItems = [
    {
      listId: "demo-cart",
      barcode: "000000000001",
      productName: "Organic Bananas",
      brand: "Fresh Farm",
      quantity: 3,
      note: "Smoothies and snacks",
      isChecked: false,
      productJson: "{}",
      addedAt: "demo-1",
      updatedAt: "demo-1",
      product: { productQuantity: 500 },
    },
    {
      listId: "demo-cart",
      barcode: "000000000002",
      productName: "Wholegrain Bread",
      brand: "Baker's Table",
      quantity: 1,
      note: "Sandwiches",
      isChecked: false,
      productJson: "{}",
      addedAt: "demo-2",
      updatedAt: "demo-2",
      product: { productQuantity: 700 },
    },
    {
      listId: "demo-cart",
      barcode: "000000000003",
      productName: "Greek Yoghurt",
      brand: "Farm Fresh",
      quantity: 2,
      note: "Breakfast bowls",
      isChecked: false,
      productJson: "{}",
      addedAt: "demo-3",
      updatedAt: "demo-3",
      product: { productQuantity: 450 },
    },
    {
      listId: "demo-cart",
      barcode: "000000000004",
      productName: "Vanila Yoghurt",
      brand: "Farm Fresh",
      quantity: 3,
      note: "Breakfast bowls",
      isChecked: false,
      productJson: "{}",
      addedAt: "demo-4",
      updatedAt: "demo-4",
      product: { productQuantity: 450 },
    },
  ];
  // List index screen: no local item state needed

  // --- Date helpers + grouping logic ---

  const startOfDay = (d: Date) => {
    const nd = new Date(d);
    nd.setHours(0, 0, 0, 0);
    return nd;
  };

  const dateDiffInDays = (a: Date, b: Date) => {
    const msPerDay = 86400000;
    return Math.round(
      (startOfDay(a).getTime() - startOfDay(b).getTime()) / msPerDay
    );
  };

  type GroupKey =
    | "overdue"
    | "today"
    | "tomorrow"
    | "thisWeek"
    | "later"
    | "noDate";

  const groupTitles: Record<GroupKey, string> = {
    overdue: "Overdue",
    today: "Today",
    tomorrow: "Tomorrow",
    thisWeek: "This Week",
    later: "Later",
    noDate: "No Planned Date",
  };

  const getGroupKey = (
    plannedPurchaseDate: string | null,
    today: Date
  ): GroupKey => {
    if (!plannedPurchaseDate) return "noDate";
    const planned = new Date(plannedPurchaseDate);
    if (Number.isNaN(planned.getTime())) return "noDate";

    const diff = dateDiffInDays(planned, today);
    if (diff < 0) return "overdue";
    if (diff === 0) return "today";
    if (diff === 1) return "tomorrow";
    if (diff <= 7) return "thisWeek";
    return "later";
  };

  const today = useMemo(() => new Date(), []);

  // --- Effects: load lists & auto-select one ---

  // Load lists on mount / when ready
  useEffect(() => {
    if (ready) {
      refreshLists();
    }
  }, [ready, refreshLists]);

  useEffect(() => {
    if (!ready || lists.length === 0) return;
    if (!activeListId || !lists.some((list) => list.listId === activeListId)) {
      setActiveListId(lists[0].listId);
    }
  }, [ready, lists, activeListId]);

  useEffect(() => {
    if (!ready || !activeListId) return;
    loadList(activeListId);
  }, [ready, activeListId, loadList]);

  // No auto-select; this screen only shows list index

  useFocusEffect(
    useCallback(() => {
      if (!ready) return;
      (async () => {
        await refreshLists();
        if (activeListId) {
          await loadList(activeListId);
        }
      })();
    }, [ready, refreshLists, activeListId, loadList])
  );

  // Fetch item counts for each list when lists change
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!ready || lists.length === 0) {
        setItemCounts({});
        return;
      }
      const results = await Promise.all(
        lists.map(async (l) => {
          try {
            const c = await getItemCount(l.listId);
            return { id: l.listId, count: c };
          } catch {
            return { id: l.listId, count: 0 };
          }
        })
      );
      if (cancelled) return;
      const map: Record<string, number> = {};
      for (const r of results) map[r.id] = r.count;
      setItemCounts(map);
    })();
    return () => { cancelled = true; };
  }, [ready, lists, getItemCount]);

  const onRefresh = useCallback(
    async () => {
      setRefreshing(true);
      await refreshLists();
      if (activeListId) {
        await loadList(activeListId);
      }
      setRefreshing(false);
    },
    [refreshLists, loadList, activeListId]
  );
  // This screen only lists lists

  // Refresh lists when the create-list modal closes to reflect new additions
  useEffect(() => {
    // When modal becomes false/undefined and DB is ready, refresh lists
    if (ready && !modals["createList"]) {
      (async () => {
        await refreshLists();
        if (activeListId) {
          await loadList(activeListId);
        }
      })();
    }
  }, [modals["createList"], ready, refreshLists, activeListId, loadList]);

  useEffect(() => {
    if (lists.length === 0) return;
    const validIds = new Set(lists.map((l) => l.listId));
    setSelectedListIds((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.filter((id) => validIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [lists]);

  const selectedSet = useMemo(
    () => new Set(selectedListIds),
    [selectedListIds]
  );
  const isSelectionMode = selectedListIds.length > 0;

  const activeCartItems = useMemo(() => {
    const items = currentItems.length > 0 ? currentItems : dummyCartItems;
    return items.map((item) => {
      const unitPrice = estimateItemPrice(item);
      const linePrice = Math.round(unitPrice * item.quantity * 100) / 100;
      return {
        item,
        unitPrice,
        linePrice,
      };
    });
  }, [currentItems]);

  const hasDummyCart = currentItems.length === 0;
  const activeCart = currentList ?? lists.find((list) => list.listId === activeListId) ?? dummyCartList;

  const subtotal = useMemo(
    () => Math.round(activeCartItems.reduce((sum, row) => sum + row.linePrice, 0) * 100) / 100,
    [activeCartItems]
  );
  const gst = useMemo(
    () => Math.round(subtotal * 0.1 * 100) / 100,
    [subtotal]
  );
  const totalInclGst = useMemo(
    () => Math.round((subtotal + gst) * 100) / 100,
    [subtotal, gst]
  );
  const deliveryFee = subtotal > 0 ? 4.99 : 0;
  const grandTotal = useMemo(
    () => Math.round((totalInclGst + deliveryFee) * 100) / 100,
    [totalInclGst, deliveryFee]
  );
  const totalLabel = deliveryFee > 0 ? "Total (incl. GST + delivery)" : "Total (incl. GST)";

  const toggleSelectList = useCallback((listId: string) => {
    setSelectedListIds((prev) =>
      prev.includes(listId)
        ? prev.filter((id) => id !== listId)
        : [...prev, listId]
    );
  }, []);

  const deleteSelectedLists = useCallback(async () => {
    const ids = [...selectedListIds];
    for (const id of ids) {
      await deleteList(id);
    }
    setSelectedListIds([]);
  }, [selectedListIds, deleteList]);

  // --- RENDER --- //

  return (
    <Screen className="p-safe flex-1">
      <Header />
      <View className="flex-1">

      {/* Title + Add button */}
      <View className="mt-4 px-4 flex-row items-center justify-between">
        <View style={{ flex: 1 }}>
          <Tt className="text-xl font-interBold text-center">Shopping Lists</Tt>
        </View>
        <View className="flex-row items-center">
          {isSelectionMode && (
            <Pressable
              onPress={() => openModal('deleteSelectedLists')}
              className="ml-2 px-3 py-1 rounded-lg border border-primary bg-white dark:bg-hsl15"
            >
              {({ pressed }) => (
                <Tt className={`font-interSemiBold ${pressed ? 'text-primary' : 'text-hsl30 dark:text-hsl90'}`}>
                  Delete ({selectedListIds.length})
                </Tt>
              )}
            </Pressable>
          )}
          <Pressable
            onPress={() => openModal('createList')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="ml-2"
          >
            {({ pressed }) => (
              <IconGeneral type="add" fill={pressed ? '#FF3F3F' : 'hsl(0, 0%, 40%)'} size={24} />
            )}
          </Pressable>
          <Pressable
            onPress={async () => { await syncAllToFirestore(); }}
            className="ml-3 px-3 py-1 rounded-lg border border-hsl90 dark:border-hsl20 bg-white dark:bg-hsl15"
          >
            {({ pressed }) => (
              <Tt className={`font-interSemiBold ${pressed ? 'text-primary' : 'text-hsl30 dark:text-hsl90'}`}>Sync</Tt>
            )}
          </Pressable>
        </View>
      </View>

      {/* Lists Grid (folder-style) */}
      {lists.length > 0 && (
        <FlatList
          className="mt-4 px-4"
          style={{ flex: 1 }}
          data={lists}
          keyExtractor={(item) => item.listId}
          numColumns={2}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ paddingBottom: insets.bottom + 180 }}
          ListFooterComponent={() => <View style={{ height: 96 + insets.bottom }} />}
          ListHeaderComponent={() => {
            if (!activeCart) return null;
            const previewItems = activeCartItems.slice(0, 3);
            return (
              <View className="mb-6">
                <View className="rounded-3xl bg-white dark:bg-hsl15 border border-hsl90 dark:border-hsl20 p-4 mb-4">
                  <View className="flex-row items-center justify-between">
                    <View>
                      <Tt className="text-base font-interBold text-hsl10 dark:text-white">Active Cart</Tt>
                      <Tt className="text-sm text-hsl40 dark:text-hsl80 mt-1">{activeCart.listName}</Tt>
                    </View>
                    <View className="rounded-full bg-hsl90 dark:bg-hsl20 px-3 py-1">
                      <Tt className="text-xs font-interSemiBold uppercase text-hsl10 dark:text-white">
                        {activeCartItems.length} items
                      </Tt>
                    </View>
                  </View>
                  <View className="mt-4 space-y-2">
                    <View className="flex-row justify-between">
                      <Tt className="text-sm text-hsl40 dark:text-hsl80">Subtotal</Tt>
                      <Tt className="text-sm font-interSemiBold text-hsl10 dark:text-white">{formatCurrency(subtotal)}</Tt>
                    </View>
                    <View className="flex-row justify-between">
                      <Tt className="text-sm text-hsl40 dark:text-hsl80">GST</Tt>
                      <Tt className="text-sm font-interSemiBold text-hsl10 dark:text-white">{formatCurrency(gst)}</Tt>
                    </View>
                    <View className="flex-row justify-between">
                      <Tt className="text-sm text-hsl40 dark:text-hsl80">Delivery</Tt>
                      <Tt className="text-sm font-interSemiBold text-hsl10 dark:text-white">{formatCurrency(deliveryFee)}</Tt>
                    </View>
                    <View className="flex-row justify-between border-t border-hsl90 dark:border-hsl20 pt-3 mt-2">
                      <View>
                        <Tt className="text-sm font-interBold text-hsl10 dark:text-white">{totalLabel}</Tt>
                        <Tt className="text-sm font-interBold text-hsl10 dark:text-white">Includes 10% GST ({formatCurrency(gst)})</Tt>
                      </View>
                      <Tt className="text-sm font-interBold text-hsl10 dark:text-white">{formatCurrency(grandTotal)}</Tt>
                    </View>
                  </View>
                </View>

                {previewItems.length > 0 && (
                  <View className="space-y-3">
                    {previewItems.map((row) => (
                      <ShoppingListItemRow
                        key={row.item.addedAt}
                        productName={row.item.productName}
                        brand={row.item.brand}
                        quantity={row.item.quantity}
                        note={row.item.note ?? null}
                        plannedPurchaseDate={null}
                        isCompleted={row.item.isChecked}
                        isOverdue={false}
                        unitPrice={row.unitPrice}
                        linePrice={row.linePrice}
                        onToggleCompleted={() => {}}
                        onEdit={() => {}}
                        onDelete={() => {}}
                        onPressItem={() => {}}
                        onIncreaseQuantity={() => {}}
                        onDecreaseQuantity={() => {}}
                        onEditNote={() => {}}
                      />
                    ))}
                    {activeCartItems.length > previewItems.length && (
                      <Tt className="text-xs text-hsl50 dark:text-hsl70">
                        Showing {previewItems.length} of {activeCartItems.length} cart items.
                      </Tt>
                    )}
                  </View>
                )}
              </View>
            );
          }}
          columnWrapperStyle={{ justifyContent: 'space-between' }}
          renderItem={({ item }) => {
            const baseColor: string = item.color ?? '#A0A0A0';
            const lighten = (hex: string, factor = 0.2) => {
              const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
              if (!m) return hex;
              const r = Math.min(255, Math.round(parseInt(m[1], 16) + (255 - parseInt(m[1], 16)) * factor));
              const g = Math.min(255, Math.round(parseInt(m[2], 16) + (255 - parseInt(m[2], 16)) * factor));
              const b = Math.min(255, Math.round(parseInt(m[3], 16) + (255 - parseInt(m[3], 16)) * factor));
              const toHex = (n: number) => n.toString(16).padStart(2, '0');
              return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
            };
            const darken = (hex: string, factor = 0.2) => {
              const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
              if (!m) return hex;
              const r = Math.max(0, Math.round(parseInt(m[1], 16) * (1 - factor)));
              const g = Math.max(0, Math.round(parseInt(m[2], 16) * (1 - factor)));
              const b = Math.max(0, Math.round(parseInt(m[3], 16) * (1 - factor)));
              const toHex = (n: number) => n.toString(16).padStart(2, '0');
              return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
            };
            const bodyColor = lighten(baseColor, 0.18);
            const tabColor = lighten(baseColor, 0.32);
            const strokeColor = darken(baseColor, 0.15);

            // Prefer user-selected emoji, fallback to deterministic
            const emojis = ['🛒','🛍️','🥦','🍎','🍞','🥛','🍪','🍇','🥕'];
            const hash = Array.from(item.listId).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
            const emoji = item.emoji ?? emojis[hash % emojis.length];
            const isSelected = selectedSet.has(item.listId);

            return (
              <Pressable
                onPress={() => {
                  if (isSelectionMode) {
                    toggleSelectList(item.listId);
                  } else {
                    router.push({ pathname: '/(app)/lists/[listId]', params: { listId: item.listId } });
                  }
                }}
                onLongPress={() => toggleSelectList(item.listId)}
                delayLongPress={250}
                style={{ width: '48%', marginBottom: 16 }}
                className={`rounded-xl bg-white dark:bg-hsl15 border ${isSelected ? 'border-primary' : 'border-hsl90 dark:border-hsl20'} active:border-primary`}
              >
                {isSelectionMode && (
                  <View className="absolute right-2 top-2 z-10">
                    <IconGeneral
                      type={isSelected ? "checkbox-active" : "checkbox-inactive"}
                      fill={isSelected ? "#FF3D3D" : "hsl(0, 0%, 60%)"}
                    />
                  </View>
                )}
                <View style={{ padding: 16 }}>
                  {/* Folder graphic (SVG) */}
                  <View style={{ paddingTop: 4 }}>
                    <FolderGraphic baseColor={baseColor} width={"100%"} height={92} emoji={emoji} emojiSize={38} />
                  </View>
                  {/* Name */}
                  <View style={{ marginTop: 8 }}>
                    <Tt className="text-center font-interSemiBold text-hsl30 dark:text-hsl90">{item.listName}</Tt>
                    <Tt className="text-center text-hsl50 dark:text-hsl70 text-xs mt-1">Items: {itemCounts[item.listId] ?? 0}</Tt>
                    <Tt className="text-center text-hsl50 dark:text-hsl70 text-xs mt-1">Created: {formatCreatedDate(item.createdAt)}</Tt>
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {activeCartItems.length > 0 && (
        <View
          className="absolute left-0 right-0 bottom-0 border-t border-hsl90 dark:border-hsl20 bg-white/95 dark:bg-hsl15 px-4 py-3"
          style={{ paddingBottom: insets.bottom, zIndex: 10 }}
        >
          <View className="flex-row items-center justify-between gap-3">
            <View>
              {/* <Tt className="text-sm text-hsl40 dark:text-hsl80">{totalLabel}</Tt> */}
              <Tt className="text-sm text-hsl40 dark:text-hsl80">Subtotal</Tt>
              <Tt className="text-xl font-interBold text-hsl10 dark:text-white">{formatCurrency(grandTotal)}</Tt>
              <Tt className="text-sm text-hsl40 dark:text-hsl80">Includes 10% GST ({formatCurrency(gst)})</Tt>
              <Tt className="text-sm text-hsl40 dark:text-hsl80">Includes delivery fee: {formatCurrency(deliveryFee)}</Tt>
              
            </View>
            <Button
              title="Checkout"
              onPress={() => {}}
              fullWidth={false}
            />
          </View>
        </View>
      )}

      {/* EMPTY / LOADING STATES */}
      {lists.length === 0 && (
        <View className="flex-1 w-[95%] mx-auto items-center justify-center">
          {!ready ? (
            <Tt className="text-hsl40 dark:text-hsl80">Preparing Shopping List…</Tt>
          ) : lists.length === 0 ? (
            <>
              <Tt className="text-hsl40 dark:text-hsl80 text-center">
                No shopping lists yet.
              </Tt>
              <Tt className="text-hsl40 dark:text-hsl80 text-xs mt-1 text-center">
                Start by scanning a product to create your first list.
              </Tt>

              <Pressable
                onPress={() => router.push("/(app)/(tabs)/scan")}
                className="mt-8 flex-row justify-between items-center py-3 px-4 rounded-lg 
                  border border-hsl90 dark:border-hsl20 active:border-primary bg-white dark:bg-hsl15 self-center"
              >
                {({ pressed }) => (
                  <>
                    <Tt
                      className={`text-lg font-interSemiBold flex-grow ${
                        pressed ? "text-primary" : "text-hsl30 dark:text-hsl90"
                      }`}
                    >
                      Scan New Product
                    </Tt>
                    <IconGeneral
                      type="barcode-scan"
                      fill={pressed ? "#FF3F3F" : "hsl(0, 0%, 30%)"}
                      size={30}
                    />
                  </>
                )}
              </Pressable>

              <ScrollView
                className="mt-8 w-full"
                contentContainerStyle={{ paddingBottom: insets.bottom + 180 }}
                style={{ flexGrow: 1 }}
              >
                <View className="w-full rounded-3xl bg-white dark:bg-hsl15 border border-hsl90 dark:border-hsl20 p-4">
                  <Tt className="text-base font-interBold text-hsl10 dark:text-white mb-3">Sample Cart Preview</Tt>
                  {dummyCartItems.map((row) => (
                    <ShoppingListItemRow
                      key={row.addedAt}
                      productName={row.productName}
                      brand={row.brand}
                      quantity={row.quantity}
                      note={row.note ?? null}
                      plannedPurchaseDate={null}
                      isCompleted={row.isChecked}
                      isOverdue={false}
                      unitPrice={estimateItemPrice(row)}
                      linePrice={Math.round(estimateItemPrice(row) * row.quantity * 100) / 100}
                      onToggleCompleted={() => {}}
                      onEdit={() => {}}
                      onDelete={() => {}}
                      onPressItem={() => {}}
                      onIncreaseQuantity={() => {}}
                      onDecreaseQuantity={() => {}}
                      onEditNote={() => {}}
                    />
                  ))}
                </View>
              </ScrollView>
            </>
          ) : null}
        </View>
      )}
    </View>

      {/* Create List Modal (visible only when plus is pressed) */}
      <ModalWrapper modalKey="createList" animation="fade">
        <CreateListModal modalKey="createList" />
      </ModalWrapper>
      <ModalWrapper modalKey="deleteSelectedLists" animation="fade">
        <ModalResponse
          modalKey="deleteSelectedLists"
          isInput={false}
          message="Delete selected lists?"
          acceptLabel="Delete"
          onAccept={async () => {
            await deleteSelectedLists();
          }}
        />
      </ModalWrapper>
    </Screen>
  );
}
