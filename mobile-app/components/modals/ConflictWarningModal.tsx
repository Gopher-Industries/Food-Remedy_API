// Conflict Warning Modal - shows when adding item that already exists in list

import React from "react";
import { View, Pressable } from "react-native";
import Tt from "@/components/ui/UIText";
import IconGeneral from "@/components/icons/IconGeneral";

interface ConflictWarningModalProps {
  listName: string;
  currentQuantity: number;
  newQuantity: number;
  isLoading?: boolean;
  onReplace: () => void;
  onAdd: () => void;
  onCancel: () => void;
}

const ConflictWarningModal: React.FC<ConflictWarningModalProps> = ({
  listName,
  currentQuantity,
  newQuantity,
  isLoading = false,
  onReplace,
  onAdd,
  onCancel,
}) => {
  return (
    <View className="flex-1 justify-center items-center bg-black/50">
      <View className="bg-white dark:bg-hsl15 rounded-2xl p-5 mx-6 w-full max-w-sm shadow-lg">
        {/* Icon Header */}
        <View className="items-center mb-4">
          <View className="bg-yellow-100 dark:bg-yellow-900/20 rounded-full p-3 mb-3">
            <IconGeneral type="warning" fill="#FF9500" size={28} />
          </View>
          <Tt className="text-xl font-interBold text-center">
            Item Already Exists
          </Tt>
        </View>

        {/* Message Section */}
        <View className="bg-hsl95 dark:bg-hsl10 rounded-xl p-3 mb-4">
          <Tt className="text-sm text-hsl40 dark:text-hsl80 mb-2 text-center leading-5">
            <Tt className="font-interSemiBold text-hsl20 dark:text-hsl95">
              "{listName}"
            </Tt>{" "}
            already has this item
          </Tt>
          <View className="flex-row justify-around items-center gap-x-2">
            <View className="items-center flex-1">
              <Tt className="text-xs text-hsl50 dark:text-hsl70 mb-1">
                In list
              </Tt>
              <View className="bg-white dark:bg-hsl20 rounded-lg px-2 py-1 min-w-12 items-center">
                <Tt className="font-interBold text-base text-primary">
                  {currentQuantity}
                </Tt>
              </View>
            </View>
            <Tt className="text-lg text-hsl60 dark:text-hsl60">+</Tt>
            <View className="items-center flex-1">
              <Tt className="text-xs text-hsl50 dark:text-hsl70 mb-1">
                Adding
              </Tt>
              <View className="bg-white dark:bg-hsl20 rounded-lg px-2 py-1 min-w-12 items-center">
                <Tt className="font-interBold text-base text-primary">
                  {newQuantity}
                </Tt>
              </View>
            </View>
          </View>
          <View className="flex-row justify-center items-center mt-3">
            <View
              className="flex-1 h-px bg-hsl80 dark:bg-hsl30"
              style={{ marginHorizontal: 6 }}
            />
            <Tt className="text-xs font-interSemiBold text-hsl50 dark:text-hsl70">
              Choose action
            </Tt>
            <View
              className="flex-1 h-px bg-hsl80 dark:bg-hsl30"
              style={{ marginHorizontal: 6 }}
            />
          </View>
        </View>

        {/* Action Buttons */}
        <View className="gap-y-2">
          <Pressable
            onPress={onAdd}
            disabled={isLoading}
            className={`bg-primary rounded-lg py-3 px-3 ${
              isLoading ? "opacity-50" : "active:opacity-80"
            }`}
          >
            <Tt className="text-center font-interSemiBold text-white text-sm">
              {isLoading
                ? "Adding..."
                : `Add More (${currentQuantity + newQuantity} total)`}
            </Tt>
          </Pressable>

          <Pressable
            onPress={onReplace}
            disabled={isLoading}
            className={`bg-orange-500 dark:bg-orange-600 rounded-lg py-3 px-3 ${
              isLoading ? "opacity-50" : "active:opacity-80"
            }`}
          >
            <Tt className="text-center font-interSemiBold text-white text-sm">
              {isLoading ? "Replacing..." : `Replace with ${newQuantity}`}
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

export default ConflictWarningModal;
