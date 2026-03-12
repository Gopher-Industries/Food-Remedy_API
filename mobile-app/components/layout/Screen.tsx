import React from "react";
import { View, StyleProp, ViewStyle } from "react-native";
import { useTheme } from "@/theme";

interface ScreenProps {
  children: React.ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

const Screen: React.FC<ScreenProps> = ({ children, className = "", style }) => {
  const theme = useTheme();
  return (
    <View
      className={`flex-1 ${className}`}
      style={[{ backgroundColor: theme.colors.background }, style]}
    >
      {children}
    </View>
  );
};

export default Screen;
