// Profile Selector Modal

import React from "react";
import { Pressable, View } from "react-native";
import ModalWrapper from "./ModalAWrapper";
import { useModalManager } from "../providers/ModalManagerProvider";
import Tt from "../ui/UIText";
import IconGeneral from "../icons/IconGeneral";
import ProfileSelector from "../ui/ProfileSelector";

const ProfileSelectorModal: React.FC = () => {
  const { closeModal } = useModalManager();

  const handleClose = () => {
    closeModal("profileSelector");
  };

  const handleProfileSelected = () => {
    // Close modal after a brief delay to allow visual feedback
    setTimeout(() => {
      closeModal("profileSelector");
    }, 150);
  };

  return (
    <ModalWrapper modalKey="profileSelector" animation="slide">
      <View className="flex-1 justify-end bg-black/50">
        <Pressable className="flex-1" onPress={handleClose} />

        <View className="mx-[10px] bg-white rounded-t-3xl px-6 py-6 max-h-[80%]">
          {/* HEADER */}
          <View className="flex-row justify-between items-center mb-4">
            <Tt className="text-2xl font-interBold">Active Profile</Tt>
            <Pressable onPress={handleClose} hitSlop={10}>
              {({ pressed }) => (
                <IconGeneral
                  type="close"
                  fill={pressed ? "#FF3F3F" : "hsl(0, 0%, 30%)"}
                  size={28}
                />
              )}
            </Pressable>
          </View>

          {/* PROFILE SELECTOR */}
          <ProfileSelector onProfileSelected={handleProfileSelected} />
        </View>
      </View>
    </ModalWrapper>
  );
};

export default ProfileSelectorModal;
