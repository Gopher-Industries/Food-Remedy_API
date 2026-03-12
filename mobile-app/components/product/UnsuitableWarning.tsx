/**
 * UnsuitableWarning.tsx
 * Displays warning when product is unsuitable for the user's profile
 */

import React from "react";
import { View } from "react-native";
import IconGeneral from "@/components/icons/IconGeneral";
import Tt from "@/components/ui/UIText";

interface UnsuitableWarningProps {
  reason: string;
  severity?: "warning" | "alert"; // warning: yellow-ish, alert: red
}

export default function UnsuitableWarning({
  reason,
  severity = "alert",
}: UnsuitableWarningProps) {
  const bgColor = severity === "alert" ? "bg-[#FFF6F6]" : "bg-[#FFFAF0]";
  const borderColor = severity === "alert" ? "border-[#FFD6D6]" : "border-[#FFE8D6]";
  const iconColor = severity === "alert" ? "#FF3D3D" : "#FF9500";
  const textColor = severity === "alert" ? "text-[#FF3D3D]" : "text-[#FF9500]";

  return (
    <View className={`flex-row items-start gap-x-3 px-4 py-3 rounded-lg ${bgColor} border ${borderColor}`}>
      <IconGeneral type="warning" fill={iconColor} size={24} />
      <View className="flex-1">
        <Tt className={`font-interBold text-sm ${textColor}`}>
          {severity === "alert" ? "Not Suitable" : "⚠️ Check Before Consuming"}
        </Tt>
        <Tt className={`text-xs ${textColor} text-justify mt-1`}>{reason}</Tt>
      </View>
    </View>
  );
}
