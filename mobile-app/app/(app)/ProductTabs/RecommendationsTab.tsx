import React, { useMemo, useState } from 'react';
import { View, ScrollView, TouchableOpacity, Alert } from 'react-native';
import Tt from '@/components/ui/UIText';
import RecommendationCard from '@/components/product/RecommendationCard';
import SuggestedProductCard from '@/components/product/SuggestedProductCard';
import IconGeneral from '@/components/icons/IconGeneral';
import { useProfile } from '@/components/providers/ProfileProvider';
import { useModalManager } from '@/components/providers/ModalManagerProvider';
import { useRecommendationAddToList } from '@/components/providers/RecommendationAddToListProvider';
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
    brand: 'Nature\'s Choice',
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
  {
    id: 'prod_6',
    name: 'Whole Grain Bread',
    brand: 'Harvest Bake',
    matchPercentage: 86,
    reason: 'High fiber, low sugar (4g)',
    sugar: 4,
    sodium: 180,
    protein: 6,
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
    activeProfile || (profiles && profiles.length > 0 ? profiles[0] : null);

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
      'Not specified',
    ).trim() || 'Not specified';

  const activityLevel =
    String(
      selectedProfile.activityLevel ??
      selectedProfile.activity ??
      selectedProfile.exerciseLevel ??
      'Not specified',
    ).trim() || 'Not specified';

  const rawGoals = [
    ...normalizeArray(selectedProfile.goals),
    ...normalizeArray(selectedProfile.healthGoals),
    ...normalizeArray(selectedProfile.preferences?.goals),
    ...normalizeArray(selectedProfile.dietaryGoals),
  ];

  const mappedGoals: string[] = [];
  rawGoals.forEach((goal) => {
    const lower = goal.toLowerCase();

    if (lower.includes('sodium')) mappedGoals.push('Lower sodium');
    else if (lower.includes('heart')) mappedGoals.push('Heart health');
    else if (lower.includes('sugar')) mappedGoals.push('Lower sugar');
    else if (lower.includes('protein')) mappedGoals.push('High protein');
  });

  const rawAllergens = [
    ...normalizeArray(selectedProfile.allergies),
    ...normalizeArray(selectedProfile.intolerances),
    ...normalizeArray(selectedProfile.avoidAllergens),
    ...normalizeArray(selectedProfile.preferences?.avoidAllergens),
  ];

  const mappedAllergens: string[] = [];
  rawAllergens.forEach((item) => {
    const lower = item.toLowerCase();

    if (lower.includes('peanut')) mappedAllergens.push('Peanut allergy');
    else if (lower.includes('milk') || lower.includes('dairy')) {
      mappedAllergens.push('Dairy allergy');
    } else if (lower.includes('soy')) mappedAllergens.push('Soy allergy');
    else if (lower.includes('gluten') || lower.includes('wheat')) {
      mappedAllergens.push('Gluten sensitivity');
    } else if (lower.includes('tree nut') || lower.includes('almond')) {
      mappedAllergens.push('Tree nut allergy');
    }
  });

  return {
    gender,
    ageGroup,
    activityLevel,
    goals: Array.from(new Set(mappedGoals)),
    allergens: Array.from(new Set(mappedAllergens)),
  };
}

function generateRecommendations(currentProduct: any, userProfile: any): RecommendationSection[] {
  const sections: RecommendationSection[] = [];
  const nutriments = currentProduct?.nutriments ?? {};

  const sodium =
    Number(
      nutriments['sodium_100g'] ??
      nutriments['sodium_serving'] ??
      nutriments['sodium'] ??
      0,
    ) || 0;

  const sugar =
    Number(
      nutriments['sugars_100g'] ??
      nutriments['sugars_serving'] ??
      nutriments['sugars'] ??
      0,
    ) || 0;

  const protein =
    Number(
      nutriments['proteins_100g'] ??
      nutriments['proteins_serving'] ??
      nutriments['proteins'] ??
      0,
    ) || 0;

  const currentAllergens = [
    ...normalizeArray(currentProduct?.allergens),
    ...normalizeArray(currentProduct?.traces),
  ];

  interface ConcernItem {
    emoji: string;
    title: string;
    description: string;
    reason: string;
  }
  const concerns: ConcernItem[] = [];

  // Check sodium concerns
  if (
    (userProfile.goals.includes('Lower sodium') ||
      userProfile.goals.includes('Heart health')) &&
    sodium > 250
  ) {
    concerns.push({
      emoji: '🧂',
      title: 'High sodium content',
      description: `This product has ${sodium.toFixed(1)}mg sodium per 100g. Your profile prioritizes lower sodium for heart health. Consider alternatives.`,
      reason: 'sodium_high',
    });
  }

  // Check sugar concerns
  if (
    (userProfile.goals.includes('Lower sugar') ||
      userProfile.goals.includes('Heart health')) &&
    sugar > 10
  ) {
    concerns.push({
      emoji: '🍬',
      title: 'High sugar content',
      description: `This product contains ${sugar.toFixed(1)}g sugar per 100g. Your profile prefers lower sugar options.`,
      reason: 'sugar_high',
    });
  }

  // Check protein
  if (userProfile.goals.includes('High protein') && protein < 5) {
    concerns.push({
      emoji: '🥩',
      title: 'Low protein content',
      description: `This product only has ${protein.toFixed(1)}g protein per 100g. Your profile prioritizes high-protein foods.`,
      reason: 'protein_low',
    });
  }

  // Check allergen conflicts
  const allergenConflicts = userProfile.allergens.filter((allergen: string) =>
    currentAllergens.map((item: string) => item.toLowerCase()).includes(allergen.split(' ')[0].toLowerCase())
  );

  if (allergenConflicts.length > 0) {
    concerns.push({
      emoji: '⚠️',
      title: `Contains: ${allergenConflicts.join(', ')}`,
      description: `This product contains items you're allergic to. Safe alternatives are recommended below.`,
      reason: 'allergen_conflict',
    });
  }

  // Create "Because of Your List" section
  if (concerns.length > 0) {
    sections.push({
      heading: 'THINGS TO CONSIDER',
      description: 'Based on your profile and goals',
      cards: concerns.map((concern, idx) => ({
        id: `concern_${idx}`,
        emoji: concern.emoji,
        title: concern.title,
        description: concern.description,
        tag: 'Try Instead' as const,
        tagLabel: 'CONSIDER SWAP',
        reason: concern.reason,
      })),
    });
  }

  // Generate demographic-based suggestions (always show even if match is great)
  const demographicSuggestions: Recommendation[] = [];

  if (userProfile.ageGroup.includes('36–50') || userProfile.ageGroup.includes('50+')) {
    demographicSuggestions.push({
      id: 'suggest_low_sodium',
      emoji: '✅',
      title: 'Try other low-sodium options for your age group',
      description:
        'Products with reduced sodium are well-suited to your age demographic and support long-term cardiovascular health. Compare similar products.',
      tag: 'Suggested Add',
      tagLabel: 'GOOD FOR YOUR AGE',
      reason: 'age_appropriate',
    });
  }

  if (userProfile.goals.includes('Heart health')) {
    demographicSuggestions.push({
      id: 'suggest_heart',
      emoji: '❤️',
      title: 'Explore more heart-healthy alternatives',
      description:
        'Look for similar products rich in fiber and low in saturated fats. These support your cardiovascular wellness goals.',
      tag: 'Better Match',
      tagLabel: 'SIMILAR OPTIONS',
      reason: 'health_goal',
    });
  }

  if (userProfile.goals.includes('High protein')) {
    demographicSuggestions.push({
      id: 'suggest_protein',
      emoji: '💪',
      title: 'Compare with other high-protein alternatives',
      description:
        'Similar products providing 10g+ protein per serving may better support your high-protein goal.',
      tag: 'Better Match',
      tagLabel: 'BETTER MATCH',
      reason: 'protein_goal',
    });
  }

  if (userProfile.goals.includes('Lower sugar')) {
    demographicSuggestions.push({
      id: 'suggest_sugar',
      emoji: '🍯',
      title: 'Discover other low-sugar options',
      description:
        'Explore similar products with less sugar to better align with your health preference.',
      tag: 'Suggested Add',
      tagLabel: 'SIMILAR OPTIONS',
      reason: 'sugar_goal',
    });
  }

  if (userProfile.allergens.length > 0) {
    demographicSuggestions.push({
      id: 'suggest_safe',
      emoji: '🛡️',
      title: 'Find certified allergen-free alternatives',
      description:
        'Explore products specifically certified free from your allergens for extra peace of mind.',
      tag: 'Suggested Add',
      tagLabel: 'SAFE CHOICE',
      reason: 'allergen_safe',
    });
  }

  if (demographicSuggestions.length > 0) {
    sections.push({
      heading: 'SIMILAR PRODUCTS TO TRY',
      description: `Other great options based on: ${userProfile.gender} • ${userProfile.ageGroup} • ${userProfile.activityLevel}`,
      cards: demographicSuggestions,
    });
  }

  return sections;
}

function generateProductSuggestions(
  userProfile: any,
  currentProduct: any
): SuggestedProduct[] {
  let suggestions = [...MOCK_PRODUCTS];

  // Filter based on allergens
  if (userProfile.allergens && userProfile.allergens.length > 0) {
    suggestions = suggestions.sort((a, b) => {
      const aHasAllergenFree = a.isAllergenFree ? 1 : 0;
      const bHasAllergenFree = b.isAllergenFree ? 1 : 0;
      return bHasAllergenFree - aHasAllergenFree;
    });
  }

  // Re-rank based on user goals
  if (userProfile.goals && userProfile.goals.length > 0) {
    suggestions = suggestions.map((product) => {
      let boost = 0;

      if (userProfile.goals.includes('Lower sodium') && product.sodium && product.sodium < 150) {
        boost += 5;
      }

      if (userProfile.goals.includes('Lower sugar') && product.sugar && product.sugar < 5) {
        boost += 5;
      }

      if (userProfile.goals.includes('High protein') && product.protein && product.protein > 10) {
        boost += 5;
      }

      if (userProfile.goals.includes('Heart health') && product.sodium && product.sodium < 150) {
        boost += 3;
      }

      return {
        ...product,
        matchPercentage: Math.min(95, product.matchPercentage + boost),
      };
    });

    suggestions.sort((a, b) => b.matchPercentage - a.matchPercentage);
  }

  // Return top 3-5 suggestions
  return suggestions.slice(0, 5);
}

type Props = {
  product: any;
};

export default function RecommendationsTab({ product }: Props) {
  const { profiles, activeProfile } = useProfile();
  const { openModal } = useModalManager();
  const { addProducts } = useRecommendationAddToList();
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);

  const userProfile = useMemo(() => {
    return buildUserProfile(activeProfile, profiles || []);
  }, [activeProfile, profiles]);

  const recommendations = useMemo(() => {
    return generateRecommendations(product, userProfile);
  }, [product, userProfile]);

  const suggestedProducts = useMemo(() => {
    return generateProductSuggestions(userProfile, product);
  }, [userProfile, product]);

  const profileTags = useMemo(() => {
    const tags = [];

    if (userProfile.gender && userProfile.gender !== 'Not specified') {
      tags.push(`Based on ${userProfile.gender.toLowerCase()}`);
    }
    if (userProfile.ageGroup && userProfile.ageGroup !== 'Not specified') {
      tags.push(userProfile.ageGroup);
    }
    if (userProfile.activityLevel && userProfile.activityLevel !== 'Not specified') {
      tags.push(userProfile.activityLevel);
    }

    tags.push(...userProfile.goals.slice(0, 2));
    tags.push(...userProfile.allergens.slice(0, 1));

    return tags;
  }, [userProfile]);

  if (!product) {
    return (
      <View className="mt-6 items-center justify-center py-8">
        <Tt className="text-gray-500">No product data available</Tt>
      </View>
    );
  }

  const hasNoNegativeConcerns = recommendations.every(
    (section) => section.heading !== 'THINGS TO CONSIDER'
  );

  const toggleProductSelection = (productId: string) => {
    setSelectedProducts((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId]
    );
  };

  const handleAddSelectedToList = () => {
    console.log('[RecommendationsTab] handleAddSelectedToList called', { selectedProducts });
    if (selectedProducts.length > 0) {
      const productsToAdd = suggestedProducts.filter(p => selectedProducts.includes(p.id));
      console.log('[RecommendationsTab] Products to add:', productsToAdd);
      // Store products in context BEFORE opening modal so the modal can read them
      addProducts(productsToAdd);
      console.log('[RecommendationsTab] Products added to context, opening modal');
      // Clear local selection
      setSelectedProducts([]);
      // Open modal after context is updated
      openModal('addToList');
    } else {
      console.log('[RecommendationsTab] No products selected');
      Alert.alert('Select Products', 'Please select at least one product to add to your shopping list.');
    }
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} className="mt-6 flex-1">
      <View className="flex-1 px-4">
        {/* Great Match Message - Show when no concerns */}
        {hasNoNegativeConcerns && (
          <View className="mb-6 items-center justify-center rounded-xl border border-green-200 bg-green-50 py-6 px-4">
            <Tt className="text-center font-interSemiBold text-lg text-green-900">
              ✓ Great Match!
            </Tt>
            <Tt className="mt-2 text-center text-sm text-green-700">
              This product aligns well with your profile and health goals.
            </Tt>
          </View>
        )}

        {/* Profile Tags */}
        <View className="mb-6">
          <Tt className="mb-3 text-xs font-interBold tracking-wider text-gray-500">
            YOUR PROFILE
          </Tt>
          <View className="flex-row flex-wrap gap-2">
            {profileTags.map((tag, idx) => (
              <View key={idx} className="rounded-full border border-gray-300 bg-white px-3 py-1.5">
                <Tt className="text-xs font-interSemiBold text-gray-700">{tag}</Tt>
              </View>
            ))}
          </View>
        </View>

        {/* Concerns Section */}
        {recommendations.some((s) => s.heading === 'THINGS TO CONSIDER') && (
          <View className="mb-6">
            {recommendations
              .filter((section) => section.heading === 'THINGS TO CONSIDER')
              .map((section, sectionIdx) => (
                <View key={sectionIdx}>
                  <Tt className="mb-1 text-xs font-interBold tracking-wider text-gray-500">
                    {section.heading}
                  </Tt>
                  {section.description && (
                    <Tt className="mb-3 text-xs text-gray-600">{section.description}</Tt>
                  )}

                  {section.cards.map((card) => (
                    <RecommendationCard
                      key={card.id}
                      id={card.id}
                      emoji={card.emoji}
                      title={card.title}
                      description={card.description}
                      tag={card.tag}
                      tagLabel={card.tagLabel}
                      onPress={() => {
                        openModal('addToList');
                      }}
                    />
                  ))}
                </View>
              ))}
          </View>
        )}

        {/* Similar Products / Suggestions Section - Show Actual Products */}
        <View className="mb-6">
          <Tt className="mb-3 text-xs font-interBold tracking-wider text-gray-500">
            SIMILAR PRODUCTS TO TRY
          </Tt>
          <Tt className="mb-4 text-xs text-gray-600">
            Other great options based on: {userProfile.gender} • {userProfile.ageGroup} • {userProfile.activityLevel}
          </Tt>

          {suggestedProducts.length > 0 ? (
            suggestedProducts.map((suggestedProduct) => (
              <SuggestedProductCard
                key={suggestedProduct.id}
                product={suggestedProduct}
                isSelected={selectedProducts.includes(suggestedProduct.id)}
                onCheckboxPress={() => toggleProductSelection(suggestedProduct.id)}
                onPress={() => {
                  toggleProductSelection(suggestedProduct.id);
                }}
              />
            ))
          ) : (
            <Tt className="text-center text-sm text-gray-500">
              No alternative products available
            </Tt>
          )}
        </View>

        {/* Add to Shopping List Button - Only show when products selected */}
        {selectedProducts.length > 0 && (
          <View className="mb-6 gap-2">
            <TouchableOpacity
              onPress={handleAddSelectedToList}
              className="flex-row items-center justify-center rounded-lg bg-red-500 px-6 py-4 shadow-sm active:bg-red-600"
            >
              <IconGeneral type="cart-add" fill="white" size={24} />
              <Tt className="ml-3 font-interSemiBold text-lg text-white">
                Add {selectedProducts.length} {selectedProducts.length === 1 ? 'Product' : 'Products'} to List
              </Tt>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>
  );
}