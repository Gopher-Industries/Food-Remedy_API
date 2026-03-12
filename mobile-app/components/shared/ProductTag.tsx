import React from "react";
import { View } from "react-native";
import Tt from "@/components/ui/UIText";

export type ProductTagTone = "success" | "warning" | "danger" | "neutral";

interface ProductTagProps {
  label: string;
  tone?: ProductTagTone;
}

const TONE_STYLES: Record<ProductTagTone, { bg: string; border: string; text: string }> = {
  success: { bg: "#E7F6EC", border: "#9AD4AF", text: "#1B6B39" },
  warning: { bg: "#FFF3D6", border: "#F0C874", text: "#8B5A1A" },
  danger: { bg: "#FDE8E8", border: "#F3A6A6", text: "#9B1C1C" },
  neutral: { bg: "#F3F4F6", border: "#D1D5DB", text: "#374151" },
};

export const ProductTag: React.FC<ProductTagProps> = ({ label, tone = "neutral" }) => {
  const styles = TONE_STYLES[tone];

  return (
    <View
      className="px-3 py-1 rounded-full border"
      style={{ backgroundColor: styles.bg, borderColor: styles.border }}
    >
      <Tt className="text-xs font-interMedium" style={{ color: styles.text }}>
        {label}
      </Tt>
    </View>
  );
};
