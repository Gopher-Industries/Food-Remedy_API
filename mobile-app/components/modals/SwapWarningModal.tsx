// Swap Warning Modal - shows when adding a recommendation while the original item exists in list
import React from "react";
import { View, Pressable } from "react-native";
import Tt from "@/components/ui/UIText";
import IconGeneral from "@/components/icons/IconGeneral";

interface SwapWarningModalProps {
  listName: string;
  originalProductName: string;
  newProductName: string;
  isLoading?: boolean;
  onSwap: () => void;
  onAddAsNew: () => void;
  onCancel: () => void;
}

const SwapWarningModal: React.FC<SwapWarningModalProps> = ({
  listName,
  originalProductName,
  newProductName,
  isLoading = false,
  onSwap,
  onAddAsNew,
  onCancel,
}) => {
  return (
    <View className="flex-1 justify-center items-center bg-black/50">
      <View className="bg-white dark:bg-hsl15 rounded-2xl p-5 mx-6 w-full max-w-sm shadow-lg">
        {/* Icon Header */}
        <View className="items-center mb-4">
          <View className="bg-blue-100 dark:bg-blue-900/20 rounded-full p-3 mb-3">
            <IconGeneral type="swap" fill="#007AFF" size={28} />
          </View>
          <Tt className="text-xl font-interBold text-center">
            Swap Product?
          </Tt>
        </View>

        {/* Message Section */}
        <View className="bg-hsl95 dark:bg-hsl10 rounded-xl p-3 mb-4">
          <Tt className="text-sm text-hsl40 dark:text-hsl80 mb-3 text-center leading-5">
            <Tt className="font-interSemiBold text-hsl20 dark:text-hsl95">&quot;{listName}&quot;</Tt> contains the original product. Do you want to swap it with this recommendation?
          </Tt>
          
          <View className="flex-row items-center justify-between px-2">
            <View className="flex-1 items-center">
              <Tt className="text-[10px] text-hsl50 mb-1 uppercase tracking-tighter">Remove</Tt>
              <Tt className="text-xs font-interSemiBold text-red-500 text-center" numberOfLines={1}>{originalProductName}</Tt>
            </View>
            <IconGeneral type="arrow-forward" fill="#666" size={16} />
            <View className="flex-1 items-center">
              <Tt className="text-[10px] text-hsl50 mb-1 uppercase tracking-tighter">Add</Tt>
              <Tt className="text-xs font-interSemiBold text-green-500 text-center" numberOfLines={1}>{newProductName}</Tt>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View className="gap-y-2">
          <Pressable
            onPress={onSwap}
            disabled={isLoading}
            className={`bg-blue-500 rounded-lg py-3 px-3 ${
              isLoading ? "opacity-50" : "active:opacity-80"
            }`}
          >
            <Tt className="text-center font-interSemiBold text-white text-sm">
              {isLoading ? "Swapping..." : "Swap Products"}
            </Tt>
          </Pressable>

          <Pressable
            onPress={onAddAsNew}
            disabled={isLoading}
            className={`bg-primary rounded-lg py-3 px-3 ${
              isLoading ? "opacity-50" : "active:opacity-80"
            }`}
          >
            <Tt className="text-center font-interSemiBold text-white text-sm">
              {isLoading ? "Adding..." : "Keep Both (Add as New)"}
            </Tt>
          </Pressable>

          <Pressable
            onPress={onCancel}
            disabled={isLoading}
            className={`bg-hsl90 dark:bg-hsl10 rounded-lg py-3 px-3 ${
              isLoading ? "opacity-50" : "active:opacity-80"
            }`}
          >
            <Tt className="text-center font-interSemiBold text-hsl30 dark:text-hsl80 text-sm">
              {isLoading ? "Processing..." : "Cancel"}
            </Tt>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

export default SwapWarningModal;
