// Modal Wrapper

import { Modal } from "react-native";
import { useModalManager } from "@/components/providers/ModalManagerProvider";

type animType = "fade" | "none" | "slide";


const ModalWrapper: React.FC<{ children: React.ReactNode; modalKey: string; animation?: animType }> = ({
  children,
  modalKey,
  animation = "fade",
}) => {
  const { modals, closeModal } = useModalManager();

  return (
    <Modal
      transparent={true}
      visible={modals[modalKey] || false}
      animationType={animation}
      onRequestClose={() => closeModal(modalKey)}
    >
      {children}
    </Modal>
  );
};


export default ModalWrapper;