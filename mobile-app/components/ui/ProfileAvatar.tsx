import React from "react";
import { Image, View } from "react-native";
import Tt from "./UIText";

interface ProfileAvatarProps {
  uri?: string | null;
  name?: string;
  size?: number; // diameter
  borderColor?: string;
}

/**
 * Reusable Profile Avatar component.
 * - Renders image when `uri` is provided.
 * - Fallback: initial letter badge with border.
 */
const ProfileAvatar: React.FC<ProfileAvatarProps> = ({ uri, name, size = 50, borderColor = "#16A34A" /* primary */ }) => {
  const trimmed = name?.trim();
  const initial = (trimmed ? trimmed[0] : "U").toUpperCase();
  const radius = size / 2;

  if (uri) {
    return (
      <Image
        source={{ uri, cache: 'reload' }}
        style={{ width: size, height: size, borderRadius: radius, borderWidth: 2, borderColor }}
      />
    );
  }

  return (
    <View
      style={{ width: size, height: size, borderRadius: radius }}
      className={`rounded-full flex justify-center items-center border-2`}
    >
      <View style={{ width: size, height: size, borderRadius: radius, borderColor }} className={`border-[${2}] border-primary flex justify-center items-center`}>
        <Tt className={`font-interSemiBold text-xl text-primary`}>{initial}</Tt>
      </View>
    </View>
  );
};

export default ProfileAvatar;
