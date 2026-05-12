import React, { useMemo } from "react";
import { View, Pressable, Platform, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ModalWrapper from "@/components/modals/ModalAWrapper";
import Tt from "@/components/ui/UIText";
import { Button } from "@/components/shared/Button";

interface ShoppingListPlannedDateModalProps {
  editingItem: { barcode: string; productName: string } | null;
  localState: Record<string, { plannedPurchaseDate: string | null }>;
  today: Date;
  closeModal: (key: string) => void;
  setEditingItem: React.Dispatch<
    React.SetStateAction<{ barcode: string; productName: string } | null>
  >;
  setPlannedDate: (barcode: string, date: Date | null) => void;
}

const formatDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const ShoppingListPlannedDateModal: React.FC<ShoppingListPlannedDateModalProps> = ({
  editingItem,
  localState,
  today,
  closeModal,
  setEditingItem,
  setPlannedDate,
}) => {
  const insets = useSafeAreaInsets();

  const RNDateTimePicker = useMemo(() => {
    if (Platform.OS === "ios" || Platform.OS === "android") {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require("@react-native-community/datetimepicker");
      return mod.default ?? mod;
    }
    return null;
  }, []);

  const selectedDate =
    editingItem && localState[editingItem.barcode]?.plannedPurchaseDate
      ? new Date(localState[editingItem.barcode].plannedPurchaseDate as string)
      : today;

  const handleClose = () => {
    setEditingItem(null);
    closeModal("editPlannedDate");
  };

  const handleQuickSet = (daysToAdd: number) => {
    if (!editingItem) return;
    const d = new Date(today);
    d.setDate(d.getDate() + daysToAdd);
    setPlannedDate(editingItem.barcode, d);
  };

  return (
    <ModalWrapper modalKey="editPlannedDate">
      {editingItem && (
        <View
          className="flex-1 justify-center items-center px-6"
          style={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }}
        >
          <View className="bg-white dark:bg-hsl15 rounded-2xl p-4 w-full">
            <Tt className="font-interSemiBold text-lg mb-2">Planned date</Tt>

            <Tt className="text-sm text-hsl40 dark:text-hsl80 mb-4">
              {editingItem.productName}
            </Tt>

            {/* Top shortcut buttons */}
            <View className="gap-2 mb-4">
              <Button title="Today" onPress={() => handleQuickSet(0)} />
              <Button title="Tomorrow" onPress={() => handleQuickSet(1)} />
              <Button title="Next Week" onPress={() => handleQuickSet(7)} />
            </View>

            {/* Calendar */}
            {Platform.OS === "web" ? (
              <View className="mb-4 rounded-xl border border-hsl90 dark:border-hsl20 p-3 bg-white">
                <Tt className="text-sm text-hsl40 dark:text-hsl80 mb-2">
                  Pick a date
                </Tt>
                <TextInput
                  value={formatDateInputValue(selectedDate)}
                  onChangeText={(value) => {
                    if (!editingItem) return;
                    const parsed = new Date(`${value}T00:00:00`);
                    if (Number.isNaN(parsed.getTime())) return;
                    setPlannedDate(editingItem.barcode, parsed);
                  }}
                  placeholder="YYYY-MM-DD"
                  className="border border-hsl80 rounded-xl px-3 py-3 text-black"
                />
              </View>
            ) : (
              RNDateTimePicker && (
                <View className="mb-4 rounded-xl overflow-hidden border border-hsl90 dark:border-hsl20">
                  <RNDateTimePicker
                    value={selectedDate}
                    mode="date"
                    display={Platform.OS === "ios" ? "inline" : "calendar"}
                    minimumDate={today}
                    onChange={(_event: any, date?: Date) => {
                      if (!date || !editingItem) return;
                      setPlannedDate(editingItem.barcode, date);
                    }}
                    themeVariant="light"
                  />
                </View>
              )
            )}

            {/* Clear */}
            <Button
              variant="outline"
              title="Clear planned date"
              onPress={() => {
                if (!editingItem) return;
                setPlannedDate(editingItem.barcode, null);
              }}
            />

            <View className="h-3" />

            {/* Cancel */}
            <Pressable onPress={handleClose} className="items-center">
              <Tt className="text-sm text-hsl40 dark:text-hsl80">Cancel</Tt>
            </Pressable>
          </View>
        </View>
      )}
    </ModalWrapper>
  );
};

export default ShoppingListPlannedDateModal;