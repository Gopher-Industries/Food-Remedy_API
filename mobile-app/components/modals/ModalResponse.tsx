// Modal Response tsx

import { useState } from "react";
import { Pressable, View, ActivityIndicator } from "react-native";
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
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");

  /**
   * Handle On Accept
   */
  const handleOnAccept = async () => {
    setErrorMessage("");
    setLoading(true);
    try {
      await onAccept(input);
      setInput("");
      closeModal(modalKey);
    } catch (error) {
      console.log("Modal error caught:", error);
      // Error was already handled, just keep modal open
    } finally {
      setLoading(false);
    }
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
          <Pressable onPress={() => closeModal(modalKey)} disabled={loading}
            className="px-4 py-2 bg-hsl100 dark:bg-hsl15 rounded border border-hsl90 dark:border-hsl20 active:bg-primary disabled:opacity-50"
          >
            {({ pressed }) => (
              <Tt className={pressed ? "text-white" : "text-black dark:text-white"}>Cancel</Tt>
            )}
          </Pressable>

          <Pressable onPress={handleOnAccept} disabled={loading}
            className="px-4 py-2 bg-hsl100 dark:bg-hsl15 rounded border border-primary active:bg-primary disabled:opacity-50 flex-row items-center"
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FF3F3F" />
            ) : (
              <Tt className="text-black dark:text-white">{acceptLabel}</Tt>
            )}
          </Pressable>
        </View>

      </View>
    </Pressable>
  );
};

export default ModalResponse;
