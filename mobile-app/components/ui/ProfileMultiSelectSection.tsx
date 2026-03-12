// Profile Multi Select Section

import { Pressable, View } from "react-native";
import Tt from "./UIText";
import IconNutritionRestrictions from "../icons/IconNutritionRestrictions";
import IconGeneral from "../icons/IconGeneral";
import { useMemo } from "react";

type MultiSelectSectionProps = {
  title: string;
  items: string[];
  selected?: string[];
  onToggle: (item: string) => void;
};

const ProfileMultiSelectSection: React.FC<MultiSelectSectionProps> = ({ title, items, selected, onToggle }) => {

  const selectedSet = useMemo(
    () => new Set(Array.isArray(selected) ? selected : []),
    [selected]
  );

  return (
    <View className="mb-6">
      <Tt className="text-lg font-interMedium text-hsl25 dark:text-hsl85 mb-1">{title}</Tt>

      <View className="">
        {items.map((item) => {
          const isSelected = selectedSet.has(item);

          return (
            <Pressable
              key={item}
              onPress={() => onToggle(item)}
              className="flex-row gap-x-4 px-4 py-1 m-1"
            >
              <IconGeneral type={isSelected ? "checkbox-active" : "checkbox-inactive"} fill="#FF3D3D" />

              <IconNutritionRestrictions type={item} size={25} />

              <Tt className={`font-interMedium ${isSelected ? "text-black" : "text-hsl30 dark:text-hsl90"}`}>{item}</Tt>
            </Pressable>
          );
        })}

      </View>
    </View>
  );
};

export default ProfileMultiSelectSection;