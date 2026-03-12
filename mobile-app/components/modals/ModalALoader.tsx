// Modal Loader

import { View } from "react-native";
import ModalWrapper from "./ModalAWrapper";
import ModalChooseMemberRelationship from "./ModalChooseMemberRelationship";
import AccessibleIngredientsModal from "./productAccessibility/AccessibleIngredientsModal";
import AccessibleNutrientsModal from "./productAccessibility/AccessibleNutrientsModal";
import AccessibleTracesModal from "./productAccessibility/AccessibleTracesModal";
import ProfileSelectorModal from "./ProfileSelectorModal";
import AddToListModal from "./AddToListModal";

const ModalLoader = () => {
  return (
    <View>
      {/* 
        TODO:
        - Remove Example Modal for Production

      <ModalWrapper modalKey="example">
        <ModalResponse modalKey="exmaple"
          isInput={true}
          message="Example Message:"
          acceptLabel="Accept"
          onAccept={() => { }}
        />
      </ModalWrapper> 
      */}

      <ModalWrapper modalKey="chooseMemberRelationship">
        <ModalChooseMemberRelationship />
      </ModalWrapper>

      <ModalWrapper modalKey="accessibleIngredients" animation="slide">
        <AccessibleIngredientsModal />
      </ModalWrapper>

      <ModalWrapper modalKey="accessibleNutrients" animation="slide">
        <AccessibleNutrientsModal />
      </ModalWrapper>

      <ModalWrapper modalKey="accessibleTraces" animation="slide">
        <AccessibleTracesModal />
      </ModalWrapper>

      <ProfileSelectorModal />
      {/* Add to Shopping List */}
      <ModalWrapper modalKey="addToList" animation="slide">
        <AddToListModal modalKey="addToList" />
      </ModalWrapper>
    </View>
  );
};

export default ModalLoader;
