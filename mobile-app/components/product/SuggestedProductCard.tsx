import React from 'react';
import { View, Image, TouchableOpacity } from 'react-native';
import Tt from '@/components/ui/UIText';
import { FontAwesome } from '@expo/vector-icons';

interface SuggestedProduct {
  id: string;
  name: string;
  brand: string;
  image?: string;
  matchPercentage: number;
  reason: string;
  sodium?: number;
  sugar?: number;
  protein?: number;
  isAllergenFree?: boolean;
}

interface Props {
  product: SuggestedProduct;
  isSelected?: boolean;
  onPress?: () => void;
  onCheckboxPress?: () => void;
}

const FALLBACK_FOOD_ICON = require('../../assets/images/food_icon.png');

export default function SuggestedProductCard({
  product,
  isSelected = false,
  onPress,
  onCheckboxPress,
}: Props) {
  const getMatchColor = (percentage: number) => {
    if (percentage >= 85) return 'bg-green-100';
    if (percentage >= 70) return 'bg-blue-100';
    return 'bg-yellow-100';
  };

  const getMatchTextColor = (percentage: number) => {
    if (percentage >= 85) return 'text-green-700';
    if (percentage >= 70) return 'text-blue-700';
    return 'text-yellow-700';
  };

  const getMatchLabel = (percentage: number) => {
    if (percentage >= 85) return 'Excellent Match';
    if (percentage >= 70) return 'Good Match';
    return 'Fair Match';
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className={`mb-3 rounded-xl border ${isSelected ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white'} p-4 shadow-sm`}
    >
      <View className="flex-row gap-3">
        {/* Checkbox */}
        <TouchableOpacity
          onPress={onCheckboxPress}
          activeOpacity={0.6}
          className={`h-6 w-6 items-center justify-center rounded-md border-2 ${
            isSelected
              ? 'border-red-500 bg-red-500'
              : 'border-gray-300 bg-white'
          }`}
        >
          {isSelected && (
            <FontAwesome name="check" size={14} color="white" />
          )}
        </TouchableOpacity>

        {/* Product Image */}
        <View className="h-24 w-24 items-center justify-center rounded-lg bg-gray-100 overflow-hidden">
          {product.image ? (
            <Image
              source={{ uri: product.image }}
              className="h-full w-full"
              resizeMode="contain"
            />
          ) : (
            <Image
              source={FALLBACK_FOOD_ICON}
              className="h-16 w-16"
              resizeMode="contain"
            />
          )}
        </View>

        {/* Product Info */}
        <View className="flex-1">
          <Tt className="font-interSemiBold text-sm text-gray-900 leading-snug">
            {product.name}
          </Tt>
          <Tt className="mt-0.5 text-xs text-gray-600">{product.brand}</Tt>

          {/* Match Badge */}
          <View
            className={`mt-2 self-start flex-row items-center gap-1 rounded-full px-2 py-1 ${getMatchColor(
              product.matchPercentage
            )}`}
          >
            <FontAwesome
              name={product.matchPercentage >= 85 ? 'check-circle' : 'info-circle'}
              size={12}
              color={product.matchPercentage >= 85 ? '#16a34a' : '#2563eb'}
            />
            <Tt
              className={`text-xs font-interSemiBold ${getMatchTextColor(
                product.matchPercentage
              )}`}
            
              name={product.matchPercentage >= 85 ? 'check-circle' : 'info-circle'}
              size={12}
              color={product.matchPercentage >= 85 ? '#16a34a' : '#2563eb'}
            />
            <Tt className={`text-xs font-interSemiBold ${getMatchTextColor(product.matchPercentage)}`}>
              {product.matchPercentage}% • {getMatchLabel(product.matchPercentage)}
            </Tt>
          </View>

          {/* Reason/Feature */}
          <Tt className="mt-2 text-xs text-gray-600">{product.reason}</Tt>

          {/* Allergen Free Badge */}
          {product.isAllergenFree && (
            <View className="mt-2 flex-row items-center gap-1 self-start rounded-full bg-green-50 px-2 py-1 border border-green-200">
              <FontAwesome name="shield" size={10} color="#16a34a" />
              <Tt className="text-xs font-interSemiBold text-green-700">Allergen Free</Tt>
            </View>
          )}
        </View>
      </View>

      {/* Nutritional Comparison (optional) */}
      {(product.sodium !== undefined || product.sugar !== undefined || product.protein !== undefined) && (
        <View className="mt-3 flex-row gap-2 border-t border-gray-100 pt-3">
          {product.sodium !== undefined && (
            <View className="flex-1 rounded-lg bg-gray-50 px-2 py-1.5">
              <Tt className="text-xs text-gray-500">Sodium</Tt>
              <Tt className="font-interSemiBold text-sm text-gray-900">
                {product.sodium.toFixed(0)}mg
              </Tt>
            </View>
          )}
          {product.sugar !== undefined && (
            <View className="flex-1 rounded-lg bg-gray-50 px-2 py-1.5">
              <Tt className="text-xs text-gray-500">Sugar</Tt>
              <Tt className="font-interSemiBold text-sm text-gray-900">
                {product.sugar.toFixed(1)}g
              </Tt>
            </View>
          )}
          {product.protein !== undefined && (
            <View className="flex-1 rounded-lg bg-gray-50 px-2 py-1.5">
              <Tt className="text-xs text-gray-500">Protein</Tt>
              <Tt className="font-interSemiBold text-sm text-gray-900">
                {product.protein.toFixed(1)}g
              </Tt>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}
