// Add To Shopping List Modal

import React, { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  TextInput,
  View,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
} from "react-native";
import Tt from "@/components/ui/UIText";
import IconGeneral from "@/components/icons/IconGeneral";
import { useModalManager } from "@/components/providers/ModalManagerProvider";
import { useShoppingList } from "@/hooks/useShoppingList";
import type { Product } from "@/types/Product";
import { useProduct } from "@/components/providers/ProductProvider";
import ConflictWarningModal from "./ConflictWarningModal";

interface AddToListModalProps {
  modalKey: string;
  product?: Product | null; // optional; falls back to currentProduct
}

const COLORS = [
  { name: "Red", value: "#FF6B6B" },
  { name: "Orange", value: "#FFA06B" },
  { name: "Yellow", value: "#FFD93D" },
  { name: "Green", value: "#6BCF7F" },
  { name: "Blue", value: "#6BA3FF" },
  { name: "Purple", value: "#B86BFF" },
  { name: "Pink", value: "#FF6BC4" },
  { name: "Gray", value: "#A0A0A0" },
];

const AddToListModal: React.FC<AddToListModalProps> = ({
  modalKey,
  product,
}) => {
  const { closeModal } = useModalManager();
  const { lists, refreshLists, createList, addItem, getItem, updateQuantity } =
    useShoppingList();
  const { currentProduct } = useProduct();
  const [showCreateNew, setShowCreateNew] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [selectedColor, setSelectedColor] = useState(COLORS[0].value);
  const [slideAnim] = useState(new Animated.Value(0));
  const [quantity, setQuantity] = useState<number>(1);
  const [note, setNote] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [existingMap, setExistingMap] = useState<
    Record<string, { exists: boolean; quantity: number }>
  >({});
  const [conflictState, setConflictState] = useState<{
    listId: string;
    listName: string;
    currentQuantity: number;
  } | null>(null);

  useEffect(() => {
    refreshLists();
  }, [refreshLists]);

  // Check which lists already contain this product
  useEffect(() => {
    const p = product ?? currentProduct ?? null;
    if (!p || !p.barcode || lists.length === 0) {
      setExistingMap({});
      return;
    }

    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        lists.map(async (l) => {
          const item = await getItem(l.listId, p.barcode);
          return { listId: l.listId, quantity: item?.quantity ?? 0 };
        }),
      );
      if (cancelled) return;
      const map: Record<string, { exists: boolean; quantity: number }> = {};
      for (const r of results) {
        map[r.listId] = { exists: r.quantity > 0, quantity: r.quantity };
      }
      setExistingMap(map);
    })();

    return () => {
      cancelled = true;
    };
  }, [lists, product, currentProduct, getItem]);

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: showCreateNew ? 1 : 0,
      useNativeDriver: true,
      tension: 50,
      friction: 8,
    }).start();
  }, [showCreateNew, slideAnim]);

  const performAddToList = useCallback(
    async (listId: string, replace: boolean = false) => {
      const p = product ?? currentProduct ?? null;
      if (!p || !p.barcode) {
        setConflictState(null);
        return;
      }

      setIsLoading(true);
      try {
        let finalQuantity: number;
        if (replace) {
          finalQuantity = quantity;
        } else {
          const existing = existingMap[listId]?.quantity ?? 0;
          finalQuantity = existing + quantity;
        }

        // If item already exists, update quantity. Otherwise, add new item.
        if (existingMap[listId]?.exists) {
          await updateQuantity(listId, p.barcode, finalQuantity);
        } else {
          await addItem(listId, p, finalQuantity, note.trim() || undefined);
        }

        // Close modals
        setConflictState(null);
        setShowCreateNew(false);
        setNewListName("");
        setQuantity(1);
        setNote("");
        setIsLoading(false);

        // Close main modal last with a small delay to ensure state updates
        setTimeout(() => {
          closeModal(modalKey);
        }, 100);
      } catch (error) {
        console.error("Error adding item:", error);
        setConflictState(null);
        setIsLoading(false);
        Alert.alert("Error", "Failed to add item. Please try again.");
      }
    },
    [
      product,
      currentProduct,
      addItem,
      updateQuantity,
      closeModal,
      modalKey,
      quantity,
      note,
      existingMap,
    ],
  );

  const handleAddToList = useCallback(
    (listId: string) => {
      const listName =
        lists.find((l) => l.listId === listId)?.listName || "List";
      const existing = existingMap[listId];

      if (existing?.exists) {
        // Show conflict warning
        setConflictState({
          listId,
          listName,
          currentQuantity: existing.quantity,
        });
      } else {
        // No conflict, show confirmation alert
        Alert.alert(
          "Add to List",
          "Are you sure you want to add this item to the list?",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Add",
              onPress: async () => {
                await performAddToList(listId);
              },
            },
          ],
        );
      }
    },
    [lists, existingMap, performAddToList],
  );

  const handleCreateAndAdd = useCallback(async () => {
    const p = product ?? currentProduct ?? null;
    if (!p || !newListName.trim()) return;

    const newList = await createList(newListName.trim(), selectedColor);
    if (newList) {
      await addItem(
        newList.listId,
        p,
        Math.max(1, quantity),
        note.trim() || undefined,
      );
      closeModal(modalKey);
      setShowCreateNew(false);
      setNewListName("");
      setQuantity(1);
      setNote("");
    }
  }, [
    product,
    currentProduct,
    newListName,
    selectedColor,
    createList,
    addItem,
    closeModal,
    modalKey,
    quantity,
    note,
  ]);

  const handleClose = () => {
    closeModal(modalKey);
    setShowCreateNew(false);
    setNewListName("");
  };

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -320],
  });

  return (
    <>
      {/* Conflict Warning Modal*/}
      <Modal
        visible={!!conflictState}
        transparent
        animationType="fade"
        onRequestClose={() => setConflictState(null)}
      >
        <ConflictWarningModal
          listName={conflictState?.listName || ""}
          currentQuantity={conflictState?.currentQuantity || 0}
          newQuantity={quantity}
          isLoading={isLoading}
          onCancel={() => !isLoading && setConflictState(null)}
          onAdd={async () => {
            if (conflictState && !isLoading)
              await performAddToList(conflictState.listId, false);
          }}
          onReplace={async () => {
            if (conflictState && !isLoading)
              await performAddToList(conflictState.listId, true);
          }}
        />
      </Modal>

      {/* Main Add to List Modal */}
      <Pressable
        onPress={handleClose}
        className="flex-1 bg-black/50 justify-end"
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={80}
          style={{ width: "100%" }}
        >
          <Animated.View
            onStartShouldSetResponder={() => true}
            className="bg-white dark:bg-hsl15 rounded-t-2xl mx-3"
          >
            {/* Main Content - Hidden when showing conflict */}
            {!conflictState && (
              <>
                {/* Header */}
                <View className="flex-row justify-between items-center px-6 pt-6 pb-4 border-b border-hsl90 dark:border-hsl20">
                  <Tt className="text-xl font-interBold">Add to List</Tt>
                  <Pressable onPress={handleClose} className="p-2">
                    {({ pressed }) => (
                      <IconGeneral
                        type="close"
                        fill={pressed ? "#FF3F3F" : "hsl(0 0%, 30%)"}
                        size={24}
                      />
                    )}
                  </Pressable>
                </View>

                {/* Quantity & Note Section */}
                <View className="px-6 pt-4 border-b border-hsl90 dark:border-hsl20">
                  <Tt className="text-sm font-interMedium mb-2 text-hsl30 dark:text-hsl90">
                    Quantity
                  </Tt>
                  <View className="flex-row items-center gap-x-3 mb-4">
                    <Pressable
                      onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                      disabled={!!conflictState}
                      className="bg-hsl95 dark:bg-hsl10 rounded-lg px-3 py-2"
                    >
                      <Tt>-</Tt>
                    </Pressable>
                    <Tt className="font-interBold text-lg">{quantity}</Tt>
                    <Pressable
                      onPress={() => setQuantity((q) => q + 1)}
                      disabled={!!conflictState}
                      className="bg-hsl95 dark:bg-hsl10 rounded-lg px-3 py-2"
                    >
                      <Tt>+</Tt>
                    </Pressable>
                  </View>

                  <Tt className="text-sm font-interMedium mb-2 text-hsl30 dark:text-hsl90">
                    Note
                  </Tt>
                  <TextInput
                    value={note}
                    onChangeText={setNote}
                    placeholder="Add a note (optional)"
                    className="bg-hsl95 dark:bg-hsl10 rounded-lg px-4 py-3 mb-4 font-interRegular"
                    placeholderTextColor="hsl(0 0% 60%)"
                  />
                </View>

                {/* Create New List Section */}
                {showCreateNew ? (
                  <View className="px-6 py-4 border-b border-hsl90 dark:border-hsl20">
                    <Tt className="text-lg font-interSemiBold mb-4">
                      Create New List
                    </Tt>

                    <TextInput
                      value={newListName}
                      onChangeText={setNewListName}
                      placeholder="List name"
                      className="bg-hsl95 dark:bg-hsl10 rounded-lg px-4 py-3 mb-4 font-interRegular"
                      placeholderTextColor="hsl(0 0% 60%)"
                      autoFocus
                    />

                    <Tt className="text-sm font-interMedium mb-2 text-hsl30 dark:text-hsl90">
                      Color
                    </Tt>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      className="mb-4"
                    >
                      <View className="flex-row gap-x-3">
                        {COLORS.map((color) => (
                          <Pressable
                            key={color.value}
                            onPress={() => setSelectedColor(color.value)}
                            className="items-center"
                          >
                            <View
                              style={{ backgroundColor: color.value }}
                              className={`w-10 h-10 rounded-full ${
                                selectedColor === color.value
                                  ? "border-2 border-black"
                                  : ""
                              }`}
                            />
                          </Pressable>
                        ))}
                      </View>
                    </ScrollView>

                    <View className="flex-row gap-x-3">
                      <Pressable
                        onPress={() => {
                          setShowCreateNew(false);
                          setNewListName("");
                        }}
                        className="flex-1 bg-hsl95 dark:bg-hsl10 rounded-lg py-3 px-4"
                      >
                        <Tt className="text-center font-interSemiBold">
                          Cancel
                        </Tt>
                      </Pressable>

                      <Pressable
                        onPress={handleCreateAndAdd}
                        disabled={!newListName.trim()}
                        className={`flex-1 rounded-lg py-3 px-4 ${
                          newListName.trim()
                            ? "bg-primary"
                            : "bg-hsl90 dark:bg-hsl15"
                        }`}
                      >
                        <Tt
                          className={`text-center font-interSemiBold ${
                            newListName.trim()
                              ? "text-white"
                              : "text-hsl50 dark:text-hsl70"
                          }`}
                        >
                          Create & Add
                        </Tt>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <>
                    {/* Existing Lists */}
                    <ScrollView className="max-h-80 px-6 py-4">
                      {lists.length === 0 ? (
                        <View className="py-8 items-center">
                          <IconGeneral
                            type="cart-add"
                            fill="hsl(0 0% 70%)"
                            size={48}
                          />
                          <Tt className="text-hsl40 dark:text-hsl80 mt-4 text-center">
                            No shopping lists yet
                          </Tt>
                          <Tt className="text-hsl50 dark:text-hsl70 text-sm text-center mt-2">
                            Create your first list below
                          </Tt>
                        </View>
                      ) : (
                        lists.map((list) => (
                          <Pressable
                            key={list.listId}
                            onPress={() => handleAddToList(list.listId)}
                            className="flex-row items-center py-4 px-4 mb-2 rounded-lg bg-hsl95 dark:bg-hsl10 active:bg-hsl90 dark:bg-hsl15"
                          >
                            {({ pressed }) => (
                              <>
                                <View
                                  style={{
                                    backgroundColor: list.color ?? "#A0A0A0",
                                  }}
                                  className="w-4 h-4 rounded-full mr-3"
                                />
                                <Tt
                                  className={`flex-1 font-interMedium ${
                                    pressed ? "text-primary" : "text-black"
                                  }`}
                                >
                                  {list.listName}
                                </Tt>
                                {existingMap[list.listId]?.exists && (
                                  <View className="flex-row items-center mr-2">
                                    <IconGeneral
                                      type="check"
                                      fill="#2ECC71"
                                      size={18}
                                    />
                                    <Tt className="text-xs text-hsl40 dark:text-hsl80 ml-1">
                                      Qty {existingMap[list.listId]?.quantity}
                                    </Tt>
                                  </View>
                                )}
                                <IconGeneral
                                  type="add"
                                  fill={pressed ? "#FF3F3F" : "hsl(0 0%, 60%)"}
                                  size={20}
                                />
                              </>
                            )}
                          </Pressable>
                        ))
                      )}
                    </ScrollView>

                    {/* Create New Button */}
                    <View className="px-6 pb-6 pt-4 border-t border-hsl90 dark:border-hsl20">
                      <Pressable
                        onPress={() => setShowCreateNew(true)}
                        className="bg-primary rounded-lg py-4 px-4 flex-row justify-center items-center active:bg-primary/80"
                      >
                        {({ pressed }) => (
                          <>
                            <IconGeneral type="add" fill="white" size={24} />
                            <Tt className="text-white font-interSemiBold ml-2">
                              Create New List
                            </Tt>
                          </>
                        )}
                      </Pressable>
                    </View>
                  </>
                )}
              </>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </Pressable>
    </>
  );
};

export default AddToListModal;
