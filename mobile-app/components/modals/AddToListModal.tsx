// Add To Shopping List Modal

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  TextInput,
  View,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from "react-native";
import Tt from "@/components/ui/UIText";
import IconGeneral from "@/components/icons/IconGeneral";
import { useModalManager } from "@/components/providers/ModalManagerProvider";
import { useShoppingList } from "@/hooks/useShoppingList";
import type { Product } from "@/types/Product";
import { useProduct } from "@/components/providers/ProductProvider";
import { useRecommendationAddToList } from "@/components/providers/RecommendationAddToListProvider";
import ConflictWarningModal from "./ConflictWarningModal";
import SwapWarningModal from "./SwapWarningModal";

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
  const { lists, refreshLists, createList, addItem, getItem, updateQuantity, removeItem } =
    useShoppingList();
  const { currentProduct } = useProduct();
  const { productsToAdd, clearProductsToAdd } = useRecommendationAddToList();
  // Ref always mirrors the latest productsToAdd so callbacks never see a stale value
  const productsToAddRef = useRef(productsToAdd);
  productsToAddRef.current = productsToAdd;
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
  const [sourceExistingMap, setSourceExistingMap] = useState<
    Record<string, { exists: boolean; quantity: number }>
  >({});
  const [conflictState, setConflictState] = useState<{
    listId: string;
    listName: string;
    currentQuantity: number;
  } | null>(null);
  const [swapState, setSwapState] = useState<{
    listId: string;
    listName: string;
    originalProductName: string;
    newProductName: string;
  } | null>(null);

  useEffect(() => {
    refreshLists();
    console.log('[AddToListModal] Component mounted/updated', { 
      hasProduct: !!product,
      hasCurrentProduct: !!currentProduct,
      productsToAddCount: productsToAdd.length,
    });
  }, [refreshLists, product, currentProduct, productsToAdd.length]);

  // Check which lists already contain this product (the one we are adding)
  // AND the source product (currentProduct)
  useEffect(() => {
    const p = product ?? currentProduct ?? null;
    const s = currentProduct ?? null;

    if (lists.length === 0) {
      setExistingMap({});
      setSourceExistingMap({});
      return;
    }

    let cancelled = false;
    (async () => {
      const targetResults = await Promise.all(
        lists.map(async (l) => {
          if (!p?.barcode) return { listId: l.listId, quantity: 0 };
          const item = await getItem(l.listId, p.barcode);
          return { listId: l.listId, quantity: item?.quantity ?? 0 };
        }),
      );

      const sourceResults = await Promise.all(
        lists.map(async (l) => {
          if (!s?.barcode) return { listId: l.listId, quantity: 0 };
          const item = await getItem(l.listId, s.barcode);
          return { listId: l.listId, quantity: item?.quantity ?? 0 };
        }),
      );

      if (cancelled) return;

      const newTargetMap: Record<string, { exists: boolean; quantity: number }> = {};
      targetResults.forEach((r) => {
        newTargetMap[r.listId] = { exists: r.quantity > 0, quantity: r.quantity };
      });
      setExistingMap(newTargetMap);

      const newSourceMap: Record<string, { exists: boolean; quantity: number }> = {};
      sourceResults.forEach((r) => {
        newSourceMap[r.listId] = { exists: r.quantity > 0, quantity: r.quantity };
      });
      setSourceExistingMap(newSourceMap);
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
      setIsLoading(true);
      try {
        // Check if adding multiple products from recommendations
        const productsToAddNow = productsToAdd.length > 0 ? productsToAdd : null;
        
        console.log('[AddToListModal] performAddToList called with:', { listId, productsToAdd: productsToAddNow });
        
        if (productsToAddNow && productsToAddNow.length > 0) {
          console.log('[AddToListModal] Adding multiple products from recommendations:', productsToAddNow);
          // Add multiple products from recommendations - ALWAYS add as new items
          for (let i = 0; i < productsToAddNow.length; i++) {
            const suggestedProduct = productsToAddNow[i];
            console.log('[AddToListModal] Processing product:', suggestedProduct);
            
            // Create a stable, unique barcode per product using its id + index
            // IMPORTANT: Do NOT use Date.now() here — async calls may overlap and
            // produce identical timestamps, causing the DAO to increment quantity
            // instead of inserting a new row.
            const stableBarcode = suggestedProduct.barcode || `rec-${suggestedProduct.id}-${i}`;

            // Create a complete product object for suggested products
            const productToAdd: Product = {
              barcode: stableBarcode,
              productName: suggestedProduct.name || 'Unknown Product',
              brand: suggestedProduct.brand || null,
              genericName: null,
              ingredientsText: null,
              ingredientsAnalysis: null,
              additives: [],
              allergens: [],
              categories: [],
              labels: [],
              ingredients: [],
              traces: null,
              tracesFromIngredients: null,
              nutriments: {},
              nutrientLevels: { fat: "unknown", salt: "unknown", sugars: "unknown", "saturated-fat": "unknown" } as any,
              nutriscoreGrade: "unknown" as any,
              productQuantity: null,
              productQuantityUnit: null,
              servingQuantity: null,
              servingQuantityUnit: null,
              completeness: 0.5,
              images: { root: '', primary: suggestedProduct.image || null, variants: {} } as any,
              id: suggestedProduct.id,
            };
            
            console.log('[AddToListModal] Created product object:', productToAdd);
            
            try {
              // Always add as new item - don't check for existing in multi-product mode
              console.log('[AddToListModal] Adding new item (multi-mode)');
              await addItem(listId, productToAdd, 1, undefined);
              console.log(`[AddToListModal] Successfully added ${suggestedProduct.name}`);
            } catch (err) {
              console.error(`[AddToListModal] Failed to add product ${suggestedProduct.name}:`, err);
            }
          }
          
          clearProductsToAdd();
          console.log('[AddToListModal] All products added, clearing context');
        } else {
          // Add single product (original logic)
          const p = product ?? currentProduct ?? null;
          if (!p || !p.barcode) {
            setConflictState(null);
            return;
          }

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
        }

        // Close modals
        setConflictState(null);
        setShowCreateNew(false);
        setNewListName("");
        setQuantity(1);
        setNote("");
        setIsLoading(false);

        // Show success message
        const listName = lists.find((l) => l.listId === listId)?.listName || "List";
        const itemCount = productsToAddNow?.length || 1;
        console.log('[AddToListModal] Success! Added', itemCount, 'item(s) to', listName);

        // Close main modal — the modal closing is the success signal to the user
        setTimeout(() => {
          closeModal(modalKey);
        }, 100);
      } catch (error) {
        console.error("[AddToListModal] Error adding item:", error);
        setConflictState(null);
        setIsLoading(false);
        // Log error; do NOT use Alert.alert inside a React Native <Modal> — it is unreliable on Android
        console.error('Add to list failed:', error instanceof Error ? error.message : 'Unknown error');
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
      productsToAdd,
      clearProductsToAdd,
      lists,
    ],
  );

  const handleAddToList = useCallback(
    async (listId: string) => {
      // Always read from ref — guaranteed to be the live value regardless of
      // when this callback was created or whether the outer backdrop Pressable
      // fired clearProductsToAdd() concurrently.
      const liveProductsToAdd = productsToAddRef.current;
      console.log('[AddToListModal] handleAddToList called', { listId, productsToAddCount: liveProductsToAdd.length });

      // Multi-product mode: directly add all selected products
      if (liveProductsToAdd.length > 0) {
        console.log('[AddToListModal] Multiple products mode - checking for swap opportunities');
        
        // If adding exactly ONE recommendation, we check for a swap opportunity with the source product
        if (liveProductsToAdd.length === 1) {
          const suggested = liveProductsToAdd[0];
          const listName = lists.find((l) => l.listId === listId)?.listName || "List";
          
          // If the source product (currentProduct) exists in this list, show swap modal
          if (sourceExistingMap[listId]?.exists && currentProduct) {
             console.log('[AddToListModal] Source product found in list - showing swap modal');
             setSwapState({
               listId,
               listName,
               originalProductName: currentProduct.productName || 'Original',
               newProductName: suggested.name || 'Recommendation'
             });
             return;
          }
        }

        console.log('[AddToListModal] Adding multiple directly');
        await performAddToList(listId);
        return;
      }

      // Single product mode: check for conflict and show inline modal if needed
      console.log('[AddToListModal] Single product mode - checking for conflicts');
      const listName = lists.find((l) => l.listId === listId)?.listName || "List";
      const existing = existingMap[listId];

      if (existing?.exists) {
        console.log('[AddToListModal] Product already exists - showing conflict warning');
        setConflictState({
          listId,
          listName,
          currentQuantity: existing.quantity,
        });
      } else {
        console.log('[AddToListModal] No conflict - adding directly');
        await performAddToList(listId);
      }
    },
    [lists, existingMap, sourceExistingMap, performAddToList, currentProduct],
  );

  const handleSwap = useCallback(async () => {
    if (!swapState || !currentProduct?.barcode) return;
    
    setIsLoading(true);
    try {
      // 1. Remove the source product from the list
      console.log('[AddToListModal] Swapping: Removing old product', currentProduct.barcode);
      await removeItem(swapState.listId, currentProduct.barcode);
      
      // 2. Add the new recommendation
      console.log('[AddToListModal] Swapping: Adding new product');
      await performAddToList(swapState.listId);
      
      setSwapState(null);
    } catch (err) {
      console.error('[AddToListModal] Swap failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [swapState, performAddToList, currentProduct, removeItem]);

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
    // NOTE: Do NOT call clearProductsToAdd() here.
    // The backdrop Pressable fires handleClose on any tap outside the modal
    // sheet — including taps on inner list-row Pressables that bubble up,
    // which would clear productsToAdd before handleAddToList runs.
    // Products are cleared inside performAddToList after a successful add.
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

      {/* Swap Warning Modal */}
      <Modal
        visible={!!swapState}
        transparent
        animationType="fade"
        onRequestClose={() => setSwapState(null)}
      >
        <SwapWarningModal
          listName={swapState?.listName || ""}
          originalProductName={swapState?.originalProductName || ""}
          newProductName={swapState?.newProductName || ""}
          isLoading={isLoading}
          onCancel={() => !isLoading && setSwapState(null)}
          onAddAsNew={async () => {
            if (swapState && !isLoading) {
              await performAddToList(swapState.listId);
              setSwapState(null);
            }
          }}
          onSwap={async () => {
             if (swapState && !isLoading) {
               await handleSwap();
             }
          }}
        />
      </Modal>

      {/* Main Add to List Modal */}
      {/* Use a plain View as the root so the backdrop Pressable (below) sits
          absolutely behind the sheet and CANNOT intercept taps on inner rows. */}
      <View className="flex-1 justify-end">
        {/* Backdrop — absolute so sheet content sits on top in z-order */}
        <Pressable
          onPress={handleClose}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' }}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={80}
          style={{ width: "100%" }}
        >
          <Animated.View
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

                {/* Products to Add Section (if multiple) */}
                {productsToAdd.length > 0 && (
                  <View className="px-6 pt-4 border-b border-hsl90 dark:border-hsl20">
                    <Tt className="text-sm font-interMedium mb-3 text-hsl30 dark:text-hsl90">
                      Items to Add ({productsToAdd.length})
                    </Tt>
                    <View className="bg-hsl95 dark:bg-hsl10 rounded-lg p-3 mb-4 max-h-40">
                      <ScrollView showsVerticalScrollIndicator={false}>
                        {productsToAdd.map((prod, idx) => (
                          <View key={`${prod.id}-${idx}`} className="mb-2 pb-2 border-b border-hsl90 dark:border-hsl20 last:border-b-0">
                            <Tt className="font-interMedium text-sm">{prod.name}</Tt>
                            {prod.brand && (
                              <Tt className="text-xs text-hsl50 dark:text-hsl70">{prod.brand}</Tt>
                            )}
                            <Tt className="text-xs text-hsl50 dark:text-hsl70 mt-1">
                              Match: {prod.matchPercentage}%
                            </Tt>
                          </View>
                        ))}
                      </ScrollView>
                    </View>
                  </View>
                )}

                {/* Quantity & Note Section (only for single product) */}
                {productsToAdd.length === 0 && (
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
                )}

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
      </View>
    </>
  );
};

export default AddToListModal;
