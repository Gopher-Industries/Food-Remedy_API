import React, { useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';

import Tt from '@/components/ui/UIText';
import RecommendationCard from '@/components/product/RecommendationCard';
import SuggestedProductCard from '@/components/product/SuggestedProductCard';
import IconGeneral from '@/components/icons/IconGeneral';

import { useProfile } from '@/components/providers/ProfileProvider';
import { useModalManager } from '@/components/providers/ModalManagerProvider';
import { useRecommendationAddToList } from '@/components/providers/RecommendationAddToListProvider';
import { usePreferences } from '@/components/providers/PreferencesProvider';

import type { SuggestedProduct } from '@/types/SuggestedProduct';

interface Recommendation {
  id: string;
  emoji: string;
  title: string;
  description: string;
  tag: 'Try Instead' | 'Better Match' | 'Suggested Add';
  tagLabel: string;
  reason: string;
}

interface RecommendationSection {
  heading: string;
  description?: string;
  cards: Recommendation[];
}

// Mock product database
const MOCK_PRODUCTS: SuggestedProduct[] = [
  {
    id: 'prod_1',
    name: 'Organic Low Sodium Bacon',
    brand: "Nature's Choice",
    matchPercentage: 92,
    reason: '40% less sodium, organic certified',
    sodium: 150,
    isAllergenFree: true,
  },
  {
    id: 'prod_2',
    name: 'Unsalted Legume Mix',
    brand: 'Green Valley',
    matchPercentage: 88,
    reason: 'High fiber, perfect for heart health',
    sodium: 80,
    protein: 12,
  },
  {
    id: 'prod_3',
    name: 'Sugar-Free Granola',
    brand: 'Pure Nutrition',
    matchPercentage: 85,
    reason: 'Zero added sugar, high protein',
    sugar: 2,
    protein: 15,
    isAllergenFree: true,
  },
  {
    id: 'prod_4',
    name: 'Low-Sodium Chicken Breast',
    brand: 'Farm Fresh',
    matchPercentage: 90,
    reason: 'Lean protein, minimal sodium',
    sodium: 65,
    protein: 28,
  },
  {
    id: 'prod_5',
    name: 'Peanut-Free Trail Mix',
    brand: 'Safe Snacks Co',
    matchPercentage: 87,
    reason: 'Certified peanut-free facility',
    protein: 8,
    isAllergenFree: true,
  },
];

function normalizeArray(value: any): string[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item;

        if (item && typeof item === 'object') {
          return String(item.name ?? item.label ?? item.value ?? '');
        }

        return '';
      })
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function buildUserProfile(activeProfile: any, profiles: any[]) {
  const selectedProfile =
    activeProfile ||
    (profiles && profiles.length > 0 ? profiles[0] : null);

  if (!selectedProfile) {
    return {
      gender: 'Not specified',
      ageGroup: 'Not specified',
      activityLevel: 'Not specified',
      goals: [] as string[],
      allergens: [] as string[],
    };
  }

  const age =
    Number(selectedProfile.age) ||
    Number(selectedProfile.ageYears) ||
    Number(selectedProfile.userAge) ||
    0;

  let ageGroup = 'Not specified';

  if (age > 0 && age <= 18) ageGroup = '0–18';
  else if (age <= 35) ageGroup = '19–35';
  else if (age <= 50) ageGroup = '36–50';
  else if (age > 50) ageGroup = '50+';

  const gender =
    String(
      selectedProfile.gender ??
        selectedProfile.sex ??
        selectedProfile.userGender ??
        'Not specified'
    ).trim() || 'Not specified';

  const activityLevel =
    String(
      selectedProfile.activityLevel ??
        selectedProfile.activity ??
        selectedProfile.exerciseLevel ??
        'Not specified'
    ).trim() || 'Not specified';

  return {
    gender,
    ageGroup,
    activityLevel,
    goals: [],
    allergens: [],
  };
}

type Props = {
  product: any;
};

export default function RecommendationsTab({ product }: Props) {
  const { profiles, activeProfile } = useProfile();

  const { openModal } = useModalManager();

  const { addProducts } =
    useRecommendationAddToList();

  const { darkMode } = usePreferences();

  const [selectedProducts, setSelectedProducts] =
    useState<string[]>([]);

  const userProfile = useMemo(() => {
    return buildUserProfile(activeProfile, profiles || []);
  }, [activeProfile, profiles]);

  const suggestedProducts = useMemo(() => {
    return MOCK_PRODUCTS;
  }, []);

  const profileTags = useMemo(() => {
    const tags = [];

    if (
      userProfile.gender &&
      userProfile.gender !== 'Not specified'
    ) {
      tags.push(
        `Based on ${userProfile.gender.toLowerCase()}`
      );
    }

    if (
      userProfile.ageGroup &&
      userProfile.ageGroup !== 'Not specified'
    ) {
      tags.push(userProfile.ageGroup);
    }

    if (
      userProfile.activityLevel &&
      userProfile.activityLevel !== 'Not specified'
    ) {
      tags.push(userProfile.activityLevel);
    }

    return tags;
  }, [userProfile]);

  if (!product) {
    return (
      <View
        className={`mt-6 items-center justify-center py-8 ${
          darkMode ? 'bg-hsl15' : 'bg-white'
        }`}
      >
        <Tt
          className={`${
            darkMode ? 'text-hsl70' : 'text-gray-500'
          }`}
        >
          No product data available
        </Tt>
      </View>
    );
  }

  const toggleProductSelection = (productId: string) => {
    setSelectedProducts((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId]
    );
  };

  const handleAddSelectedToList = () => {
    if (selectedProducts.length > 0) {
      const productsToAdd = suggestedProducts.filter((p) =>
        selectedProducts.includes(p.id)
      );

      addProducts(productsToAdd);

      setSelectedProducts([]);

      openModal('addToList');
    } else {
      Alert.alert(
        'Select Products',
        'Please select at least one product to add.'
      );
    }
  };

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      className={`mt-6 flex-1 ${
        darkMode ? 'bg-hsl15' : 'bg-white'
      }`}
    >
      <View
        className={`flex-1 px-4 ${
          darkMode ? 'bg-hsl15' : 'bg-white'
        }`}
      >
        {/* PROFILE TAGS */}
        <View className="mb-6">
          <Tt
            className={`mb-3 text-xs font-interBold tracking-wider ${
              darkMode ? 'text-hsl70' : 'text-gray-500'
            }`}
          >
            YOUR PROFILE
          </Tt>

          <View className="flex-row flex-wrap gap-2">
            {profileTags.map((tag, idx) => (
              <View
                key={idx}
                className={`rounded-full px-3 py-1.5 ${
                  darkMode
                    ? 'border border-hsl30 bg-hsl20'
                    : 'border border-gray-300 bg-white'
                }`}
              >
                <Tt
                  className={`text-xs font-interSemiBold ${
                    darkMode
                      ? 'text-white'
                      : 'text-gray-700'
                  }`}
                >
                  {tag}
                </Tt>
              </View>
            ))}
          </View>
        </View>

        {/* SUGGESTED PRODUCTS */}
        <View className="mb-6">
          <Tt
            className={`mb-3 text-xs font-interBold tracking-wider ${
              darkMode ? 'text-hsl70' : 'text-gray-500'
            }`}
          >
            SIMILAR PRODUCTS TO TRY
          </Tt>

          <Tt
            className={`mb-4 text-xs ${
              darkMode ? 'text-hsl80' : 'text-gray-600'
            }`}
          >
            Other great options based on:{' '}
            {userProfile.gender} • {userProfile.ageGroup} •{' '}
            {userProfile.activityLevel}
          </Tt>

          {suggestedProducts.map((suggestedProduct) => (
            <SuggestedProductCard
              key={suggestedProduct.id}
              product={suggestedProduct}
              isSelected={selectedProducts.includes(
                suggestedProduct.id
              )}
              onCheckboxPress={() =>
                toggleProductSelection(
                  suggestedProduct.id
                )
              }
              onPress={() =>
                toggleProductSelection(
                  suggestedProduct.id
                )
              }
            />
          ))}
        </View>

        {/* ADD BUTTON */}
        {selectedProducts.length > 0 && (
          <View className="mb-6 gap-2">
            <TouchableOpacity
              onPress={handleAddSelectedToList}
              className="flex-row items-center justify-center rounded-lg bg-red-500 px-6 py-4 active:bg-red-600"
            >
              <IconGeneral
                type="cart-add"
                fill="white"
                size={24}
              />

              <Tt className="ml-3 font-interSemiBold text-lg text-white">
                Add {selectedProducts.length}{' '}
                {selectedProducts.length === 1
                  ? 'Product'
                  : 'Products'}{' '}
                to List
              </Tt>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>
  );
}