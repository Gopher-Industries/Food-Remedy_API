// Modal Manager Provider

import React, { createContext, useContext, useState } from "react";

type ModalState = {
  [key: string]: boolean; // Key is the modal name, value is its visibility
};

interface ModalManagerContextProps {
  modals: ModalState;
  openModal: (modalKey: string) => void;
  closeModal: (modalKey: string) => void;
  toggleModal: (modalKey: string) => void;
  isOpen: (modalKey: string) => boolean;
}

const ModalManagerContext = createContext<ModalManagerContextProps | undefined>(undefined);

export const ModalManagerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [modals, setModals] = useState<ModalState>({});

  const openModal = (modalKey: string) => {
    setModals((prev) => ({ ...prev, [modalKey]: true }));
  };

  const closeModal = (modalKey: string) => {
    setModals((prev) => ({ ...prev, [modalKey]: false }));
  };

  const toggleModal = (modalKey: string) => {
    setModals((prev) => ({ ...prev, [modalKey]: !prev[modalKey] }));
  };

  const isOpen = (modalKey: string): boolean => {
    return modals[modalKey] === true;
  };

  return (
    <ModalManagerContext.Provider value={{ modals, openModal, closeModal, toggleModal, isOpen }}>
      {children}
    </ModalManagerContext.Provider>
  );
};

export const useModalManager = () => {
  const context = useContext(ModalManagerContext);
  if (!context) {
    throw new Error("useModalManager must be used within a ModalManagerProvider");
  }
  return context;
};
