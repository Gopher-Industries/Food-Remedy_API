import React, { useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import Tt from "@/components/ui/UIText";
import IconGeneral from "@/components/icons/IconGeneral";
import { useShoppingList } from "@/hooks/useShoppingList";
import { useModalManager } from "@/components/providers/ModalManagerProvider";

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

const EMOJIS = ["🛒","🛍️","🥦","🍎","🍞","🥛","🍪","🍇","🥕","🧺","📦","🧃"];

interface CreateListModalProps {
  modalKey: string;
}

const CreateListModal: React.FC<CreateListModalProps> = ({ modalKey }) => {
  const { createList, refreshLists } = useShoppingList();
  const { closeModal } = useModalManager();

  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0].value);
  const [emoji, setEmoji] = useState<string>(EMOJIS[0]);

  const handleCancel = () => { setName(""); closeModal(modalKey); };

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const newList = await createList(trimmed, color, emoji || undefined);
    if (newList) {
      await refreshLists();
    }
    setName("");
    closeModal(modalKey);
  };

  return (
    <Pressable onPress={() => closeModal(modalKey)} className="flex-1 bg-black/50 justify-center items-center">
      <View className="w-[85%] bg-white dark:bg-hsl15 rounded-xl" onStartShouldSetResponder={() => true}>
        {/* Header */}
        <View className="flex-row justify-between items-center px-6 pt-6 pb-4 border-b border-hsl90 dark:border-hsl20">
          <Tt className="text-xl font-interBold">Create List</Tt>
          <Pressable onPress={handleCancel} className="p-2">
            {({ pressed }) => (<IconGeneral type="close" fill={pressed ? "#FF3F3F" : "hsl(0 0% 30%)"} size={22} />)}
          </Pressable>
        </View>

        {/* Body */}
        <View className="px-6 py-4">
          <Tt className="text-sm font-interMedium mb-2 text-hsl30 dark:text-hsl90">List name</Tt>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="E.g., Weekly Groceries"
            className="bg-hsl95 dark:bg-hsl10 rounded-lg px-4 py-3 mb-4 font-interRegular"
            placeholderTextColor="hsl(0 0% 60%)"
            autoFocus
          />

          <Tt className="text-sm font-interMedium mb-2 text-hsl30 dark:text-hsl90">Color</Tt>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
            <View className="flex-row gap-x-3">
              {COLORS.map((c) => (
                <Pressable key={c.value} onPress={() => setColor(c.value)} className="items-center">
                  <View style={{ backgroundColor: c.value }} className={`w-10 h-10 rounded-full ${color === c.value ? "border-2 border-black" : ""}`} />
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <Tt className="text-sm font-interMedium mb-2 text-hsl30 dark:text-hsl90">Emoji</Tt>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
            <View className="flex-row gap-x-2">
              {EMOJIS.map((e) => (
                <Pressable key={e} onPress={() => setEmoji(e)} className={`px-3 py-2 rounded-lg ${emoji === e ? "bg-hsl90 dark:bg-hsl15" : "bg-hsl95 dark:bg-hsl10"}`}>
                  <Tt className="text-xl">{e}</Tt>
                </Pressable>
              ))}
            </View>
          </ScrollView>
          <TextInput
            value={emoji}
            onChangeText={setEmoji}
            placeholder="Custom emoji (optional)"
            className="bg-hsl95 dark:bg-hsl10 rounded-lg px-4 py-3 mb-2 font-interRegular"
            placeholderTextColor="hsl(0 0% 60%)"
            maxLength={4}
          />

          <View className="flex-row gap-x-3 mt-4">
            <Pressable onPress={handleCancel} className="flex-1 bg-hsl95 dark:bg-hsl10 rounded-lg py-3 px-4">
              <Tt className="text-center font-interSemiBold">Cancel</Tt>
            </Pressable>
            <Pressable onPress={handleCreate} disabled={!name.trim()} className={`flex-1 rounded-lg py-3 px-4 ${name.trim() ? "bg-primary" : "bg-hsl90 dark:bg-hsl15"}`}>
              <Tt className={`text-center font-interSemiBold ${name.trim() ? "text-white" : "text-hsl50 dark:text-hsl70"}`}>Create</Tt>
            </Pressable>
          </View>
        </View>
      </View>
    </Pressable>
  );
};

export default CreateListModal;
