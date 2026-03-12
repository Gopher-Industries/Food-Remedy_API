// Modal Response tsx

import { useState } from "react";
import { Pressable, View } from "react-native";
import Tt from "@/components/ui/UIText";
import Input from "../ui/UIInput";
import { useModalManager } from "../providers/ModalManagerProvider";

interface ModalResponseProps {
  modalKey: string;
  isInput: boolean;
  message: string;
  acceptLabel: string;
  onAccept: (input: any) => void;
}

const ModalResponse: React.FC<ModalResponseProps> = ({ modalKey, isInput, message, acceptLabel, onAccept }) => {
  const { closeModal } = useModalManager();
  const [input, setInput] = useState<string>("");

  /**
   * Handle On Accept
   */
  const handleOnAccept = () => {
    onAccept(input);
    setInput("");
    closeModal(modalKey);
  }

  return (
    <Pressable onPress={() => closeModal(modalKey)} className="flex-1 bg-black/50 justify-center items-center">
      <View className="w-[80%] bg-hsl95 dark:bg-hsl10 py-6 px-6 rounded-lg" onStartShouldSetResponder={() => true}>

        <Tt className="text-center text-lg mb-8">{message}</Tt>

        {isInput && (
          <>
            <Input value={input} onChangeText={setInput} />
          </>
        )}

        <View className="flex-row justify-around mt-8 mb-2">
          <Pressable onPress={() => closeModal(modalKey)}
            className="px-4 py-2 bg-hsl100 dark:bg-hsl15 rounded border border-hsl90 dark:border-hsl20 active:bg-primary"
          >
            {({ pressed }) => (
              <Tt className={pressed ? "text-white" : "text-black dark:text-white"}>Cancel</Tt>
            )}
          </Pressable>

          <Pressable onPress={handleOnAccept}
            className="px-4 py-2 bg-hsl100 dark:bg-hsl15 rounded border border-primary active:bg-primary"
          >
            {({ pressed }) => (
              <Tt className={pressed ? "text-white" : "text-black dark:text-white"}>{acceptLabel}</Tt>
            )}
          </Pressable>
        </View>

      </View>
    </Pressable>
  );
};

export default ModalResponse;
