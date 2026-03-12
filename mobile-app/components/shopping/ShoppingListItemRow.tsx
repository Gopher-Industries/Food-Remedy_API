// components/shopping/ShoppingListItemRow.tsx

import React from "react";
import { Pressable, View } from "react-native";
import Tt from "@/components/ui/UIText";
import IconGeneral from "@/components/icons/IconGeneral";
import { Card } from "@/components/shared/Card";

// NEW gesture + animation imports
import {
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

interface ShoppingListItemRowProps {
  productName: string;
  brand: string | null;
  quantity: number;
  note?: string | null;
  plannedPurchaseDate: string | null;
  isCompleted: boolean;
  isOverdue: boolean;
  onToggleCompleted: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPressItem: () => void;
  onIncreaseQuantity: () => void;
  onDecreaseQuantity: () => void;
  onEditNote: () => void;
}

const formatPlannedDate = (iso: string | null) => {
  if (!iso) return "No planned date";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "No planned date";
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

// Width of the area we slide to reveal the actions
const ACTION_WIDTH = 140;
const SWIPE_THRESHOLD = 60;

export const ShoppingListItemRow: React.FC<ShoppingListItemRowProps> = ({
  productName,
  brand,
  quantity,
  note,
  plannedPurchaseDate,
  isCompleted,
  isOverdue,
  onToggleCompleted,
  onEdit,
  onDelete,
  onPressItem,
  onIncreaseQuantity,
  onDecreaseQuantity,
  onEditNote,
}) => {
  const translateX = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .onUpdate(event => {
      // Allow swiping left only, clamped to -ACTION_WIDTH
      const translation = Math.min(0, event.translationX);
      translateX.value = Math.max(translation, -ACTION_WIDTH);
    })
    .onEnd(() => {
      const shouldOpen = translateX.value < -SWIPE_THRESHOLD;
      translateX.value = withTiming(shouldOpen ? -ACTION_WIDTH : 0, {
        duration: 180,
      });
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const textClassName = isCompleted
    ? "text-hsl40 dark:text-hsl80 line-through"
    : "text-hsl30 dark:text-hsl90";

  return (
    <View className="my-1">
      {/* Right-side actions underneath the sliding card */}
      <View className="absolute right-4 top-0 bottom-0 flex-row items-center">
        {/* Edit */}
        <Pressable
          onPress={onEdit}
          className="justify-center px-3 py-2 rounded-l-lg bg-amber-500 mr-[1px]"
        >
          <IconGeneral type="edit" fill="#FFFFFF" size={20} />
        </Pressable>

        {/* Delete */}
        <Pressable
          onPress={onDelete}
          className="justify-center px-3 py-2 rounded-r-lg bg-[#FF3F3F]"
        >
          <IconGeneral type="delete" fill="#FFFFFF" size={20} />
        </Pressable>
      </View>

      {/* Foreground: sliding card with gesture handler */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={animatedStyle}>
          <Card padding="md">
            <Pressable
              onPress={onPressItem}
              className="flex-row items-center justify-between"
            >
              {/* Left: checkbox + details */}
              <Pressable
                onPress={onToggleCompleted}
                className="flex-row items-center"
                hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
              >
                <View
                  className={`w-6 h-6 rounded-md border mr-3 items-center justify-center ${
                    isCompleted ? "bg-[#FF3F3F1A]" : ""
                  }`}
                >
                  {isCompleted && (
                    <IconGeneral type="check" fill="#FF3F3F" size={18} />
                  )}
                </View>
              </Pressable>

              <View className="flex-1">
                <Tt className={`font-interSemiBold ${textClassName}`}>
                  {productName}
                </Tt>
                {brand && (
                  <Tt className="text-xs text-hsl40 dark:text-hsl80">
                    {brand}
                  </Tt>
                )}
                <Tt className="text-xs text-hsl40 dark:text-hsl80 mt-0.5">
                  Planned: {formatPlannedDate(plannedPurchaseDate)}
                </Tt>

                {/* Quantity + Note row */}
                <View className="flex-row items-center mt-1">
                  {/* Quantity controls */}
                  <View className="flex-row items-center mr-3">
                    <Pressable
                      onPress={onDecreaseQuantity}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      className="px-1 py-1 rounded bg-hsl95 dark:bg-hsl10 mr-1"
                    >
                      <IconGeneral type="minus" fill="hsl(0,0%,35%)" size={16} />
                    </Pressable>
                    <Tt className="text-xs text-hsl40 dark:text-hsl80">Qty: {quantity}</Tt>
                    <Pressable
                      onPress={onIncreaseQuantity}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      className="px-1 py-1 rounded bg-hsl95 dark:bg-hsl10 ml-1"
                    >
                      <IconGeneral type="add" fill="hsl(0,0%,35%)" size={16} />
                    </Pressable>
                  </View>

                  {/* Note display + edit */}
                  <View className="flex-row items-center flex-1">
                    <Tt className="text-xs text-hsl40 dark:text-hsl80 flex-shrink">
                      {note ? `Note: ${note}` : "Note: —"}
                    </Tt>
                    <Pressable
                      onPress={onEditNote}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      className="ml-2 px-1 py-1 rounded bg-hsl95 dark:bg-hsl10"
                    >
                      <IconGeneral type="edit" fill="hsl(0,0%,35%)" size={14} />
                    </Pressable>
                  </View>
                </View>
              </View>

              {/* Right: overdue tag + chevron */}
              <View className="flex-row items-center ml-2">
                {isOverdue && !isCompleted && (
                  <View className="px-2 py-1 rounded-full bg-[#FF3F3F1A] mr-2">
                    <Tt className="text-[10px] text-[#FF3F3F] font-interSemiBold">
                      Overdue
                    </Tt>
                  </View>
                )}
                <IconGeneral
                  type="chevron-right"
                  fill="hsl(0, 0%, 65%)"
                  size={20}
                />
              </View>
            </Pressable>
          </Card>
        </Animated.View>
      </GestureDetector>
    </View>
  );
};
