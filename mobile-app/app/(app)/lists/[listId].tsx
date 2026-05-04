import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  ScrollView,
  Pressable,
  RefreshControl,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import Header from "@/components/layout/Header";
import Screen from "@/components/layout/Screen";
import Tt from "@/components/ui/UIText";
import IconGeneral from "@/components/icons/IconGeneral";
import { useShoppingList } from "@/hooks/useShoppingList";
import { useProduct } from "@/components/providers/ProductProvider";
import { ShoppingListItemRow } from "@/components/shopping/ShoppingListItemRow";
import ModalWrapper from "@/components/modals/ModalAWrapper";
import ModalResponse from "@/components/modals/ModalResponse";
import { useModalManager } from "@/components/providers/ModalManagerProvider";
import { Button } from "@/components/shared/Button";
import Input from "@/components/ui/UIInput";
import ShoppingListPlannedDateModal from "@/components/modals/ShoppingListPlannedDateModal";

export default function ShoppingListDetailPage() {
  const insets = useSafeAreaInsets();
  const { listId } = useLocalSearchParams<{ listId: string }>();
  const { setBarcode } = useProduct();
  const { openModal, closeModal } = useModalManager();

  const {
    ready,
    lists,
    currentItems,
    loadList,
    removeItem,
    clearAll,
    refreshLists,
    updateQuantity,
    updateNote,
    clearChecked,
    deleteList,
    toggleChecked,
  } = useShoppingList();

  const [refreshing, setRefreshing] = useState(false);

  type LocalState = Record<string, { plannedPurchaseDate: string | null }>;
  const [localState, setLocalState] = useState<LocalState>({});
  const [editingItem, setEditingItem] = useState<{
    barcode: string;
    productName: string;
  } | null>(null);
  const [noteEditingItem, setNoteEditingItem] = useState<{
    barcode: string;
    productName: string;
    note: string | null | undefined;
  } | null>(null);
  const [noteInput, setNoteInput] = useState("");
  const [selectedBarcodes, setSelectedBarcodes] = useState<string[]>([]);
  const [showBulkActionsDropdown, setShowBulkActionsDropdown] = useState(false);
  const [bulkActionsTop, setBulkActionsTop] = useState(0);

  const RNDateTimePicker = useMemo(() => {
    if (Platform.OS === "ios" || Platform.OS === "android") {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require("@react-native-community/datetimepicker");
      return mod.default ?? mod;
    }
    return null;
  }, []);

  const startOfDay = (d: Date) => {
    const nd = new Date(d);
    nd.setHours(0, 0, 0, 0);
    return nd;
  };

  const dateDiffInDays = (a: Date, b: Date) =>
    Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86400000);

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

  const today = useMemo(() => startOfDay(new Date()), []);

  useEffect(() => {
    if (ready && listId) {
      refreshLists();
      loadList(String(listId));
    }
  }, [ready, listId, refreshLists, loadList]);

  useFocusEffect(
    useCallback(() => {
      if (!ready || !listId) return;
      (async () => {
        await refreshLists();
        await loadList(String(listId));
      })();
    }, [ready, listId, refreshLists, loadList])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshLists();
    if (listId) await loadList(String(listId));
    setRefreshing(false);
  }, [refreshLists, loadList, listId]);

  useEffect(() => {
    setLocalState((prev) => {
      const next: LocalState = { ...prev };

      for (const it of currentItems) {
        if (!next[it.barcode]) {
          next[it.barcode] = { plannedPurchaseDate: null };
        }
      }

      Object.keys(next).forEach((bc) => {
        if (!currentItems.find((it) => it.barcode === bc)) delete next[bc];
      });

      return next;
    });
  }, [currentItems]);

  useEffect(() => {
    setSelectedBarcodes((prev) =>
      prev.filter((barcode) =>
        currentItems.some((it) => it.barcode === barcode)
      )
    );
    setShowBulkActionsDropdown(false);
  }, [currentItems]);

  const setPlannedDate = (barcode: string, date: Date | null) => {
    setLocalState((prev) => ({
      ...prev,
      [barcode]: {
        plannedPurchaseDate: date ? date.toISOString() : null,
      },
    }));
  };

  const handleEditItem = (barcode: string) => {
    const it = currentItems.find((i) => i.barcode === barcode);
    if (!it) return;

    setEditingItem({
      barcode: it.barcode,
      productName: it.productName,
    });
    openModal("editPlannedDate");
  };

  const handlePickPlannedDate = (barcode: string) => {
    handleEditItem(barcode);
  };

  const toggleSelectedItem = (barcode: string) => {
    setSelectedBarcodes((prev) =>
      prev.includes(barcode)
        ? prev.filter((b) => b !== barcode)
        : [...prev, barcode]
    );
  };

  const allSelected =
    currentItems.length > 0 && selectedBarcodes.length === currentItems.length;

  const hasSelectedItems = selectedBarcodes.length > 0;

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedBarcodes([]);
      setShowBulkActionsDropdown(false);
      return;
    }
    setSelectedBarcodes(currentItems.map((it) => it.barcode));
  };

  const handleAddSelectedToCart = async () => {
    if (!listId || selectedBarcodes.length === 0) return;

    for (const barcode of selectedBarcodes) {
      await toggleChecked(String(listId), barcode);
    }

    setSelectedBarcodes([]);
    setShowBulkActionsDropdown(false);
  };

  const handleRemoveSelected = async () => {
    if (!listId || selectedBarcodes.length === 0) return;

    for (const barcode of selectedBarcodes) {
      await removeItem(String(listId), barcode);
    }

    setSelectedBarcodes([]);
    setShowBulkActionsDropdown(false);
  };

  const handleAddSingleToCart = async (barcode: string) => {
    if (!listId) return;
    await toggleChecked(String(listId), barcode);
  };

  const viewItems = useMemo(
    () =>
      currentItems.map((it) => ({
        ...it,
        plannedPurchaseDate:
          localState[it.barcode]?.plannedPurchaseDate ?? null,
      })),
    [currentItems, localState]
  );

  const sortedItems = useMemo(() => {
    const withDate: typeof viewItems = [];
    const withoutDate: typeof viewItems = [];

    for (const it of viewItems) {
      (it.plannedPurchaseDate ? withDate : withoutDate).push(it);
    }

    withDate.sort(
      (a, b) =>
        new Date(a.plannedPurchaseDate as string).getTime() -
        new Date(b.plannedPurchaseDate as string).getTime()
    );

    withoutDate.sort((a, b) => a.productName.localeCompare(b.productName));

    return [...withDate, ...withoutDate];
  }, [viewItems]);

  const grouped = useMemo(() => {
    const groups: Partial<Record<GroupKey, typeof sortedItems>> = {};
    for (const it of sortedItems) {
      const key = getGroupKey(it.plannedPurchaseDate, today);
      (groups[key] ||= []).push(it);
    }

    const order: GroupKey[] = [
      "overdue",
      "today",
      "tomorrow",
      "thisWeek",
      "later",
      "noDate",
    ];

    return order
      .filter((k) => groups[k]?.length)
      .map((k) => ({ key: k, title: groupTitles[k], items: groups[k]! }));
  }, [sortedItems, today]);

  const currentList = lists.find((l) => l.listId === listId);

  const selectProduct = (barcode: string) => {
    if (barcode) {
      setBarcode(barcode);
      router.push("/product");
    }
  };

  return (
    <Screen className="p-safe">
      <Header />

      <View className="w-[95%] self-center mt-3 mb-2 flex-row items-center justify-between">
        <Pressable onPress={() => router.back()} className="p-2">
          <IconGeneral
            type="arrow-backward-ios"
            fill="hsl(0,0%,30%)"
            size={20}
          />
        </Pressable>
        <Tt className="text-xl font-interBold flex-1 text-center">
          {currentList?.listName ?? "Shopping List"}
        </Tt>
        <View style={{ width: 44 }} />
      </View>

      <View className="flex-1">
        <ScrollView
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          <View
            className="w-[95%] self-center relative"
            style={{ overflow: "visible" }}
          >
            <View
              className="mt-2 mb-2 relative z-50"
              style={{ overflow: "visible" }}
              onLayout={(event) => {
                const { y, height } = event.nativeEvent.layout;
                setBulkActionsTop(y + height + 8);
              }}
            >
              <View className="flex-row items-start justify-between">
                <View>
                  <Tt className="font-interSemiBold text-hsl30 dark:text-hsl90">
                    Planned items
                  </Tt>
                  <Tt className="text-xs text-hsl40 dark:text-hsl80">
                    Manage quantities, notes, and dates
                  </Tt>
                </View>

                <View className="flex-row items-center">
                  <Pressable
                    onPress={handleSelectAll}
                    className="px-2 py-1 rounded mr-2"
                  >
                    <Tt className="font-interMedium text-hsl40 dark:text-hsl80">
                      {allSelected ? "Unselect all" : "Select all"}
                    </Tt>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      if (!hasSelectedItems) return;
                      setShowBulkActionsDropdown((prev) => !prev);
                    }}
                    disabled={!hasSelectedItems}
                    className={`px-3 py-2 rounded-xl flex-row items-center ${
                      hasSelectedItems ? "bg-[#FF3F3F]" : "bg-[#FF3F3F66]"
                    }`}
                  >
                    <Tt className="text-xs font-interSemiBold text-white mr-1">
                      Manage
                    </Tt>
                    <IconGeneral type="arrow-down" fill="#FFFFFF" size={16} />
                  </Pressable>
                </View>
              </View>
            </View>

            {showBulkActionsDropdown && hasSelectedItems && (
              <View
                pointerEvents="box-none"
                style={{
                  position: "absolute",
                  top: bulkActionsTop,
                  right: 0,
                  zIndex: 9999,
                  elevation: 9999,
                }}
              >
                <View
                  className="w-56 rounded-xl border border-hsl90 bg-white dark:bg-hsl15 overflow-hidden"
                  style={{
                    shadowColor: "#000",
                    shadowOpacity: 0.15,
                    shadowRadius: 12,
                    shadowOffset: { width: 0, height: 6 },
                    elevation: 12,
                  }}
                >
                  <Pressable
                    onPress={handleAddSelectedToCart}
                    className="px-4 py-3 border-b border-hsl95 dark:border-hsl20"
                  >
                    <Tt className="text-sm text-hsl30 dark:text-hsl90 font-interMedium">
                      Add selected to cart
                    </Tt>
                  </Pressable>

                  <Pressable
                    onPress={handleRemoveSelected}
                    className="px-4 py-3"
                  >
                    <Tt className="text-sm text-[#FF3F3F] font-interMedium">
                      Remove selected
                    </Tt>
                  </Pressable>
                </View>
              </View>
            )}

            {grouped.map((group) => (
              <View key={group.key} className="mb-4">
                <Tt className="text-xs text-hsl40 dark:text-hsl80 mb-2">
                  {group.title}
                </Tt>

                {group.items.map((it) => {
                  const isOverdue =
                    getGroupKey(it.plannedPurchaseDate, today) === "overdue";
                  const isSelected = selectedBarcodes.includes(it.barcode);

                  return (
                    <View key={it.barcode} className="mb-2">
                      <ShoppingListItemRow
                        productName={it.productName}
                        brand={it.brand}
                        quantity={it.quantity}
                        note={it.note}
                        plannedPurchaseDate={it.plannedPurchaseDate}
                        isSelected={isSelected}
                        isOverdue={isOverdue}
                        isInCart={!!it.isChecked}
                        onToggleSelected={() => toggleSelectedItem(it.barcode)}
                        onEdit={() => handleEditItem(it.barcode)}
                        onDelete={() => removeItem(String(listId), it.barcode)}
                        onPressItem={() => {
                          setShowBulkActionsDropdown(false);
                          selectProduct(it.barcode);
                        }}
                        onIncreaseQuantity={() =>
                          updateQuantity(
                            String(listId),
                            it.barcode,
                            (it.quantity ?? 1) + 1
                          )
                        }
                        onDecreaseQuantity={() =>
                          updateQuantity(
                            String(listId),
                            it.barcode,
                            Math.max(1, (it.quantity ?? 1) - 1)
                          )
                        }
                        onEditNote={() => {
                          setShowBulkActionsDropdown(false);
                          setNoteEditingItem({
                            barcode: it.barcode,
                            productName: it.productName,
                            note: it.note,
                          });
                          setNoteInput(it.note ?? "");
                          openModal("editNote");
                        }}
                        onPickPlannedDate={() => {
                          setShowBulkActionsDropdown(false);
                          handlePickPlannedDate(it.barcode);
                        }}
                        onAddToShoppingCart={() =>
                          handleAddSingleToCart(it.barcode)
                        }
                      />
                    </View>
                  );
                })}
              </View>
            ))}

            <View className="mt-6 mb-4">
              <Pressable
                onPress={() => {
                  setShowBulkActionsDropdown(false);
                  //This line navigates to the shopping-cart page and passes listId as a URL parameter.
                  router.push({
                    pathname: "/(app)/lists/shopping-cart",
                    params: { listId },
                  });
                }}
                className="w-full py-3 rounded-lg bg-[#FF3F3F] items-center mb-3"
              >
                <Tt className="font-interSemiBold text-white">
                  Go to shopping cart
                </Tt>
              </Pressable>

              <Pressable
                onPress={() => {
                  setShowBulkActionsDropdown(false);
                  openModal("clearCart");
                }}
                className="w-full py-3 rounded-lg border border-[#FF3F3F] bg-white dark:bg-hsl15 items-center mb-3"
              >
                <Tt className="font-interSemiBold text-[#FF3F3F]">
                  Empty List
                </Tt>
              </Pressable>

              <Pressable
                onPress={() => {
                  setShowBulkActionsDropdown(false);
                  openModal("deleteList");
                }}
                className="w-full py-3 rounded-lg border border-[#FF3F3F] bg-white dark:bg-hsl15 items-center"
              >
                <Tt className="font-interSemiBold text-[#FF3F3F]">
                  Delete this list
                </Tt>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>

      <ModalWrapper modalKey="clearCart">
        <ModalResponse
          modalKey="clearCart"
          isInput={false}
          message="Clear all items from this list?"
          acceptLabel="Clear"
          onAccept={async () => {
            if (listId) await clearAll(String(listId));
          }}
        />
      </ModalWrapper>

      <ShoppingListPlannedDateModal
        editingItem={editingItem}
        localState={localState}
        today={today}
        closeModal={closeModal}
        setEditingItem={setEditingItem}
        setPlannedDate={setPlannedDate}
      />

      <ModalWrapper modalKey="editNote">
        {noteEditingItem && (
          <View
            className="flex-1 justify-center items-center px-6"
            style={{
              paddingTop: insets.top + 16,
              paddingBottom: insets.bottom + 16,
            }}
          >
            <View className="bg-white dark:bg-hsl15 rounded-2xl p-4 w-full">
              <Tt className="font-interSemiBold text-lg mb-2">Edit note</Tt>
              <Tt className="text-sm text-hsl40 dark:text-hsl80 mb-4">
                {noteEditingItem.productName}
              </Tt>

              <Input value={noteInput} onChangeText={setNoteInput} />

              <View className="h-3" />

              <Button
                title="Save"
                onPress={async () => {
                  if (listId && noteEditingItem) {
                    await updateNote(
                      String(listId),
                      noteEditingItem.barcode,
                      noteInput.trim() || null
                    );
                  }
                  setNoteEditingItem(null);
                  setNoteInput("");
                }}
              />

              <View className="h-2" />

              <Button
                variant="outline"
                title="Clear note"
                onPress={async () => {
                  if (listId && noteEditingItem) {
                    await updateNote(
                      String(listId),
                      noteEditingItem.barcode,
                      null
                    );
                  }
                  setNoteEditingItem(null);
                  setNoteInput("");
                }}
              />

              <View className="h-3" />

              <Pressable
                onPress={() => {
                  setNoteEditingItem(null);
                  setNoteInput("");
                }}
                className="mt-1 items-center"
              >
                <Tt className="text-sm text-hsl40 dark:text-hsl80">Cancel</Tt>
              </Pressable>
            </View>
          </View>
        )}
      </ModalWrapper>

      <ModalWrapper modalKey="clearCheckedItems">
        <ModalResponse
          modalKey="clearCheckedItems"
          isInput={false}
          message="Delete all selected items?"
          acceptLabel="Delete Selected"
          onAccept={async () => {
            if (listId) await clearChecked(String(listId));
          }}
        />
      </ModalWrapper>

      <ModalWrapper modalKey="deleteList">
        <ModalResponse
          modalKey="deleteList"
          isInput={false}
          message="Delete this list?"
          acceptLabel="Delete"
          onAccept={async () => {
            if (listId) {
              await deleteList(String(listId));
              router.back();
            }
          }}
        />
      </ModalWrapper>
    </Screen>
  );
}
