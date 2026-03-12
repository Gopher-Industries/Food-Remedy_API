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
  } = useShoppingList();
  const { openModal, modals } = useModalManager();

  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [itemCounts, setItemCounts] = useState<Record<string, number>>({});
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
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

  // No auto-select; this screen only shows list index

  useFocusEffect(
    useCallback(() => {
      if (!ready) return;
      (async () => {
        await refreshLists();
      })();
    }, [ready, refreshLists])
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
      setRefreshing(false);
    },
    [refreshLists]
  );
  // This screen only lists lists

  // Refresh lists when the create-list modal closes to reflect new additions
  useEffect(() => {
    // When modal becomes false/undefined and DB is ready, refresh lists
    if (ready && !modals["createList"]) {
      (async () => {
        await refreshLists();
      })();
    }
  }, [modals["createList"], ready, refreshLists]);

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
    <Screen className="p-safe">
      <Header />

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
          data={lists}
          keyExtractor={(item) => item.listId}
          numColumns={2}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ paddingBottom: 24 }}
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
            </>
          ) : null}
        </View>
      )}

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
