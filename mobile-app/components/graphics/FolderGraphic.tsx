import React from "react";
import Svg, { Defs, LinearGradient, Stop, Rect, Text } from "react-native-svg";

interface FolderGraphicProps {
  baseColor?: string;
  width?: number | string;
  height?: number;
  emoji?: string;
  emojiSize?: number;
}

const lighten = (hex: string, factor = 0.2) => {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return hex;
  const r0 = parseInt(m[1], 16); const g0 = parseInt(m[2], 16); const b0 = parseInt(m[3], 16);
  const r = Math.min(255, Math.round(r0 + (255 - r0) * factor));
  const g = Math.min(255, Math.round(g0 + (255 - g0) * factor));
  const b = Math.min(255, Math.round(b0 + (255 - b0) * factor));
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const darken = (hex: string, factor = 0.2) => {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return hex;
  const r0 = parseInt(m[1], 16); const g0 = parseInt(m[2], 16); const b0 = parseInt(m[3], 16);
  const r = Math.max(0, Math.round(r0 * (1 - factor)));
  const g = Math.max(0, Math.round(g0 * (1 - factor)));
  const b = Math.max(0, Math.round(b0 * (1 - factor)));
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

export const FolderGraphic: React.FC<FolderGraphicProps> = ({ baseColor = "#A0A0A0", width = "100%", height = 92, emoji = "🛍️", emojiSize = 40 }) => {
  const bodyColor = lighten(baseColor, 0.18);
  const tabColor = lighten(baseColor, 0.32);
  const strokeColor = darken(baseColor, 0.15);
  const highlightBand = lighten(bodyColor, 0.08);

  return (
    <Svg width={width} height={height} viewBox="0 0 200 140">
      <Defs>
        <LinearGradient id="folderBodyGradient" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={lighten(bodyColor, 0.06)} stopOpacity={1} />
          <Stop offset="1" stopColor={darken(bodyColor, 0.08)} stopOpacity={1} />
        </LinearGradient>
      </Defs>

      {/* Tab */}
      <Rect x={24} y={12} width={60} height={20} rx={6} fill={tabColor} stroke={strokeColor} />

      {/* Body */}
      <Rect x={10} y={24} width={180} height={100} rx={12} fill="url(#folderBodyGradient)" stroke={strokeColor} />

      {/* Top highlight band */}
      <Rect x={10} y={24} width={180} height={16} rx={12} fill={highlightBand} />

      {/* Centered emoji */}
      {emoji ? (
        <Text
          x={100}
          y={80 + emojiSize * 0.22}
          fontSize={emojiSize}
          textAnchor="middle"
          fill="#202020"
        >
          {emoji}
        </Text>
      ) : null}
    </Svg>
  );
};

export default FolderGraphic;
