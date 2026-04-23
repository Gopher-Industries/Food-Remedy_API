// app/(app)/lists/shopping-cart.tsx

import React, { useCallback, useEffect, useState } from "react";
import { View, Pressable, FlatList, ActivityIndicator } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Tt from "@/components/ui/UIText";
import Screen from "@/components/layout/Screen";
import Header from "@/components/layout/Header";
import IconGeneral from "@/components/icons/IconGeneral";
import { useShoppingList } from "@/hooks/useShoppingList";

export default function ShoppingCartDetailPage() {
  const { listId } = useLocalSearchParams<{ listId: string }>();
  const insets = useSafeAreaInsets();

  const { ready, loading, currentList, currentItems, loadList, toggleChecked } =
    useShoppingList();

  const [shoppedBarcodes, setShoppedBarcodes] = useState<Set<string>>(
    new Set()
  );
  const [removingBarcodes, setRemovingBarcodes] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    if (ready && listId) {
      loadList(listId);
    }
  }, [ready, listId, loadList]);

  const handleToggleShopped = useCallback((barcode: string) => {
    setShoppedBarcodes((prev) => {
      const next = new Set(prev);
      next.has(barcode) ? next.delete(barcode) : next.add(barcode);
      return next;
    });
  }, []);

  const handleRemoveFromCart = useCallback(
    async (barcode: string) => {
      if (!listId) return;
      setRemovingBarcodes((prev) => new Set(prev).add(barcode));
      try {
        await toggleChecked(listId, barcode);
        setShoppedBarcodes((prev) => {
          const next = new Set(prev);
          next.delete(barcode);
          return next;
        });
      } finally {
        setRemovingBarcodes((prev) => {
          const next = new Set(prev);
          next.delete(barcode);
          return next;
        });
      }
    },
    [listId, toggleChecked]
  );

  const cartItems = currentItems.filter((i) => i.isChecked);
  const totalCount = cartItems.length;
  const shoppedCount = cartItems.filter((i) =>
    shoppedBarcodes.has(i.barcode)
  ).length;

  // ── LOADING STATE ──────────────────────────────────────────────
  if (!ready || loading) {
    return (
      <Screen className="p-safe">
        <Header />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#FF3F3F" />
          <Tt className="mt-3 text-hsl50 dark:text-hsl70 text-sm">
            Loading cart…
          </Tt>
        </View>
      </Screen>
    );
  }

  // ── EMPTY STATE ────────────────────────────────────────────────
  if (cartItems.length === 0) {
    return (
      <Screen className="p-safe">
        <Header />
        <View className="flex-1 items-center justify-center px-6">
          <Tt className="text-4xl mb-3">🛒</Tt>
          <Tt className="text-hsl30 dark:text-hsl90 font-interSemiBold text-base text-center">
            Your cart is empty
          </Tt>
          <Tt className="text-hsl50 dark:text-hsl70 text-xs text-center mt-1">
            Tap "Add to Cart" on items in your list
          </Tt>
          <Pressable
            onPress={() => router.back()}
            className="mt-6 px-5 py-2.5 rounded-lg border border-hsl90 dark:border-hsl20  dark:bg-hsl15 bg-primary "
          >
            {({ pressed }) => (
              <Tt className={`font-interSemiBold text-white`}>
                ← Back to List
              </Tt>
            )}
          </Pressable>
        </View>
      </Screen>
    );
  }

  // ── MAIN RENDER ────────────────────────────────────────────────
  return (
    <Screen className="p-safe">
      <Header />

      {/* ── Page title + progress ── */}
      <View className="mt-4 px-4">
        <Tt className="text-xl font-interBold text-center">
          {/* {currentList?.listName ?? "Shopping Cart"} */}
          Shopping Cart
        </Tt>
        <Tt className="text-center text-hsl50 dark:text-hsl70 text-xs mt-1">
          {shoppedCount} of {totalCount} items shopped
        </Tt>

        <View className="mt-3 h-2 rounded-full bg-hsl90 dark:bg-hsl20 overflow-hidden">
          <View
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{
              width:
                totalCount > 0 ? `${(shoppedCount / totalCount) * 100}%` : "0%",
            }}
          />
        </View>
      </View>

      {/* ── Items list ── */}
      <FlatList
        className="mt-4 px-4"
        data={cartItems}
        keyExtractor={(item) => item.barcode}
        contentContainerStyle={{ paddingBottom: 120 }}
        ItemSeparatorComponent={() => (
          <View className="h-px bg-hsl90 dark:bg-hsl20 mx-1" />
        )}
        renderItem={({ item }) => {
          const isShopped = shoppedBarcodes.has(item.barcode);
          const isRemoving = removingBarcodes.has(item.barcode);

          return (
            <Pressable
              onPress={() => handleToggleShopped(item.barcode)}
              className={`flex-row items-center py-3.5 px-2 rounded-xl active:bg-hsl95 dark:active:bg-hsl18 ${
                isShopped ? "opacity-50" : "opacity-100"
              }`}
            >
              {/* Shopped checkbox (local state only) */}
              <View className="mr-3">
                <IconGeneral
                  type={isShopped ? "checkbox-active" : "checkbox-inactive"}
                  fill={isShopped ? "#FF3D3D" : "hsl(0, 0%, 60%)"}
                  size={24}
                />
              </View>

              {/* Product info */}
              <View className="flex-1">
                <Tt
                  className={`font-interSemiBold text-sm ${
                    isShopped
                      ? "line-through text-hsl50 dark:text-hsl70"
                      : "text-hsl30 dark:text-hsl90"
                  }`}
                >
                  {item.productName}
                </Tt>
                {!!item.brand && (
                  <Tt className="text-hsl50 dark:text-hsl70 text-xs mt-0.5">
                    {item.brand}
                  </Tt>
                )}
                {!!item.note && (
                  <Tt className="text-hsl50 dark:text-hsl70 text-xs mt-0.5 italic">
                    Note: {item.note}
                  </Tt>
                )}
              </View>

              {/* Quantity badge */}
              <View className="ml-3 px-2 py-0.5 rounded-md bg-hsl92 dark:bg-hsl18">
                <Tt className="text-hsl40 dark:text-hsl80 text-xs font-interSemiBold">
                  ×{item.quantity}
                </Tt>
              </View>

              {/* Remove from cart button */}
              <Pressable
                onPress={() => handleRemoveFromCart(item.barcode)}
                disabled={isRemoving}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                className="ml-3"
              >
                {isRemoving ? (
                  <ActivityIndicator size="small" color="#FF3F3F" />
                ) : (
                  <IconGeneral type="delete" fill="#FF3F3F" size={18} />
                )}
              </Pressable>
            </Pressable>
          );
        }}
      />

      {/* ── Bottom nav buttons (fixed) ── */}
      <View
        className="absolute bottom-0 left-0 right-0 flex-row px-4 py-3
          bg-white dark:bg-hsl15 border-t border-hsl90 dark:border-hsl20"
        style={{ paddingBottom: insets.bottom + 8 }}
      >
        <Pressable
          onPress={() => router.back()}
          className="flex-1 mr-2 flex-row items-center justify-center py-3 rounded-xl
            border border-hsl90 dark:border-hsl20 bg-white dark:bg-hsl15 active:border-primary"
        >
          {({ pressed }) => (
            <>
              <IconGeneral
                type="arrow-backward-ios"
                fill={pressed ? "#FF3F3F" : "hsl(0, 0%, 40%)"}
                size={18}
              />
              <Tt
                className={`ml-2 font-interSemiBold text-sm ${
                  pressed ? "text-primary" : "text-hsl30 dark:text-hsl90"
                }`}
              >
                Back to List
              </Tt>
            </>
          )}
        </Pressable>

        <Pressable
          onPress={() => alert("Checkout coming soon!")}
          className="flex-1 ml-2 flex-row items-center justify-center py-3 rounded-xl
            bg-primary active:bg-red-600"
        >
          {({ pressed }) => (
            <>
              <Tt className="text-white font-interSemiBold text-sm">
                Checkout
              </Tt>
              <IconGeneral type="arrow-forward-ios" fill="#FFFFFF" size={18} />
            </>
          )}
        </Pressable>
      </View>
    </Screen>
  );
}
