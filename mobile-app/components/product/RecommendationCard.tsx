import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import Tt from '@/components/ui/UIText';

type TagType = 'Try Instead' | 'Better Match' | 'Suggested Add';

interface Props {
  id: string;
  emoji: string;
  title: string;
  description: string;
  tag: TagType;
  tagLabel: string;
  onPress?: () => void;
}

const getTagStyles = (tag: TagType) => {
  switch (tag) {
    case 'Try Instead':
      return {
        bgColor: 'bg-red-100',
        textColor: 'text-red-700',
        borderColor: 'border-red-200',
      };
    case 'Better Match':
      return {
        bgColor: 'bg-blue-100',
        textColor: 'text-blue-700',
        borderColor: 'border-blue-200',
      };
    case 'Suggested Add':
      return {
        bgColor: 'bg-green-100',
        textColor: 'text-green-700',
        borderColor: 'border-green-200',
      };
  }
};

export default function RecommendationCard({
  id,
  emoji,
  title,
  description,
  tag,
  tagLabel,
  onPress,
}: Props) {
  const tagStyles = getTagStyles(tag);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className={`mb-3 rounded-xl border bg-white p-4 shadow-sm ${tagStyles.borderColor}`}
    >
      <Text className="text-2xl">{emoji}</Text>

      <Tt className="mt-2 font-interSemiBold text-base text-gray-900">{title}</Tt>

      <Tt className="mt-1 text-sm leading-5 text-gray-600">{description}</Tt>

      <View className={`mt-3 self-start rounded-full px-3 py-1 ${tagStyles.bgColor}`}>
        <Tt className={`text-xs font-interSemiBold ${tagStyles.textColor}`}>
          {tagLabel}
        </Tt>
      </View>
    </TouchableOpacity>
  );
}
