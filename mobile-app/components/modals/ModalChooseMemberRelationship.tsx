// Add New Exercise tsx

import IconGeneral from "@/components/icons/IconGeneral";
import { useModalManager } from "@/components/providers/ModalManagerProvider";
import Tt from "@/components/ui/UIText";
import { View, Pressable, ScrollView } from "react-native";
import { useProfile } from "../providers/ProfileProvider";
import { useEffect } from "react";
import { useNotification } from "../providers/NotificationProvider";

const RELATIONS = ["Child", "Partner", "Parent", "Sibling", "Friend", "Other"];


const ModalChooseMemberRelationship = () => {
  const { addNotification } = useNotification();
  const { closeModal } = useModalManager();
  const { editableProfile, updateEdit, } = useProfile();

  // If we open modal without editable profile, bail out
  useEffect(() => {
    if (!editableProfile) {
      addNotification("No profile to edit", "e")
      closeModal("chooseMemberRelationship");
    }
  }, [editableProfile, closeModal]);

  if (!editableProfile) return null;


  const onSelect = (rel: string) => {
    updateEdit({ relationship: rel });
    closeModal("chooseMemberRelationship");
  };

  return (
    <Pressable
      onPress={() => closeModal('chooseMemberRelationship')}
      className="flex-1 bg-black/50 justify-center items-center"
    >
      <View className="bg-hsl95 dark:bg-hsl10 py-6 px-6 rounded-lg w-[85%]">
        <Tt className="font-interMedium text-lg text-center">Choose Relationship</Tt>
        <Tt className="text-xs text-hsl50 dark:text-hsl70 text-center mb-4">What is your relationship to this member</Tt>

        <ScrollView>
          {RELATIONS.map((rel, idx) => (
            <Pressable key={idx}
              onPress={() => onSelect(rel)}
              className="flex-row justify-between items-center py-3 px-4 my-2 rounded-lg border border-hsl90 dark:border-hsl20 active:border-primary bg-white dark:bg-hsl15">
              {({ pressed }) => (
                <>
                  <View className="flex-row items-center gap-x-2">
                    <IconGeneral type="member" fill="hsl(0, 0%, 30%)" />
                    <Tt className="text-lg">{rel}</Tt>
                  </View>
                  <IconGeneral type="arrow-forward-ios" fill={pressed ? "#FF3F3F" : "hsl(0, 0%, 30%)"} />
                </>
              )}
            </Pressable>
          ))}
        </ScrollView>

      </View>
    </Pressable>
  );
};

export default ModalChooseMemberRelationship;