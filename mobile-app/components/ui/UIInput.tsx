// UI Input tsx

import React, { useState } from "react";
import { TextInput, StyleProp, TextStyle, TextInputProps } from "react-native";
import { useTheme } from "@/theme";

interface InputProps extends TextInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholderTextColor?: string;
  className?: string;
  style?: StyleProp<TextStyle>;
}

const Input = ({
  value, onChangeText,
  placeholderTextColor,
  className = "", style,
  onFocus, onBlur,
  ...props
}: InputProps) => {
  const [isFocused, setIsFocused] = useState(false);
  const theme = useTheme();

  const borderColor = isFocused ? "#FF3F3F" : theme.colors.border;

  return (
    <TextInput
      value={value}
      placeholderTextColor={placeholderTextColor ?? theme.colors.textMuted}
      onChangeText={onChangeText}
      className={`text-base font-inter px-4 py-2 border rounded ${className}`}
      style={[
        { color: theme.colors.text, backgroundColor: theme.colors.surface, borderColor },
        style,
      ]}
      onFocus={(e) => {
        setIsFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setIsFocused(false);
        onBlur?.(e);
      }}
      cursorColor='hsl(0, 100%, 62%)'
      {...props}
    />
  );
};

export default Input;
