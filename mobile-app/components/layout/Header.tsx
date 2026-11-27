// Header tsx

import { View } from "react-native";
import IconLogoHoriz from "../icons/IconLogoHoriz";


const Header = () => {

  return (
    // FE031: the brand mark is announced once as a header instead of being
    // read as an unlabelled graphic on every screen.
    <View
      className="flex-row items-center justify-center py-2"
      accessible
      accessibilityRole="header"
      accessibilityLabel="Food Remedy"
    >
      <IconLogoHoriz
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </View>
  );
}


export default Header;