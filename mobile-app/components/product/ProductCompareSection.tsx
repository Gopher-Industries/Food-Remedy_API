import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

type Goal = 'Lower sodium' | 'Heart health' | 'Lower sugar' | 'High protein';
type Allergen = 'Peanuts' | 'Milk' | 'Soy' | 'Gluten' | 'Tree nuts';

export interface UserDemographics {
  gender: string;
  ageGroup: string;
  activityLevel: string;
  goals: Goal[];
  allergens: Allergen[];
}

export interface ProductData {
  name: string;
  sugar: number;
  sodium: number;
  protein: number;
  allergens: string[];
}

interface CompareRow {
  id: string;
  title: string;
  status: 'good' | 'watch' | 'bad';
  label: string;
  description: string;
}

interface Props {
  userProfile: UserDemographics;
  product: ProductData;
}

const getStatusStyles = (status: 'good' | 'watch' | 'bad') => {
  switch (status) {
    case 'good':
      return {
        icon: 'check-circle' as const,
        iconColor: '#16a34a',
        badgeBg: 'bg-green-100',
        badgeText: 'text-green-800',
        borderClass: 'border-green-200',
      };

    case 'watch':
      return {
        icon: 'exclamation-circle' as const,
        iconColor: '#d97706',
        badgeBg: 'bg-yellow-100',
        badgeText: 'text-yellow-800',
        borderClass: 'border-yellow-200',
      };

    default:
      return {
        icon: 'times-circle' as const,
        iconColor: '#dc2626',
        badgeBg: 'bg-red-100',
        badgeText: 'text-red-800',
        borderClass: 'border-red-200',
      };
  }
};

const getOverallScore = (rows: CompareRow[]) => {
  let total = 0;

  rows.forEach((row) => {
    if (row.status === 'good') {
      total += 2;
    } else if (row.status === 'watch') {
      total += 1;
    }
  });

  const max = rows.length * 2;
  const percentage = max === 0 ? 0 : Math.round((total / max) * 100);

  let label: 'Good fit' | 'Moderate fit' | 'Poor fit' = 'Moderate fit';
  let status: 'good' | 'watch' | 'bad' = 'watch';

  if (percentage >= 75) {
    label = 'Good fit';
    status = 'good';
  } else if (percentage < 40) {
    label = 'Poor fit';
    status = 'bad';
  }

  return { percentage, label, status };
};

export default function ProductCompareSection({ userProfile, product }: Props) {
  const compareRows = useMemo(() => {
    const rows: CompareRow[] = [];

    if (userProfile.goals.includes('Lower sodium') || userProfile.goals.includes('Heart health')) {
      if (product.sodium <= 120) {
        rows.push({
          id: 'sodium',
          title: 'Sodium vs your goals',
          status: 'good',
          label: 'Within target',
          description:
            'This product is low in sodium per serve, so it better supports lower sodium and heart health goals.',
        });
      } else if (product.sodium <= 250) {
        rows.push({
          id: 'sodium',
          title: 'Sodium vs your goals',
          status: 'watch',
          label: 'Watch portion',
          description:
            'This product has moderate sodium. It may still fit your goals, but portion size matters.',
        });
      } else {
        rows.push({
          id: 'sodium',
          title: 'Sodium vs your goals',
          status: 'bad',
          label: 'High sodium',
          description:
            'This product is high in sodium compared to your selected goals and may not be the best fit.',
        });
      }
    }

    if (userProfile.goals.includes('Lower sugar') || userProfile.goals.includes('Heart health')) {
      if (product.sugar <= 5) {
        rows.push({
          id: 'sugar',
          title: 'Sugar vs your goals',
          status: 'good',
          label: 'Low sugar',
          description:
            'Sugar is low per serve, which supports lower sugar and heart health preferences.',
        });
      } else if (product.sugar <= 10) {
        rows.push({
          id: 'sugar',
          title: 'Sugar vs your goals',
          status: 'watch',
          label: 'Moderate sugar',
          description:
            'Sugar is moderate per serve. This may still be acceptable depending on total daily intake.',
        });
      } else {
        rows.push({
          id: 'sugar',
          title: 'Sugar vs your goals',
          status: 'bad',
          label: 'High sugar',
          description:
            'Sugar is higher than ideal for a user trying to reduce sugar intake.',
        });
      }
    }

    if (userProfile.goals.includes('High protein')) {
      if (product.protein >= 10) {
        rows.push({
          id: 'protein',
          title: 'Protein support',
          status: 'good',
          label: 'Protein rich',
          description:
            'This product provides strong protein support and matches your goal well.',
        });
      } else if (product.protein >= 5) {
        rows.push({
          id: 'protein',
          title: 'Protein support',
          status: 'watch',
          label: 'Moderate protein',
          description:
            'This product contains some protein, but it may not be enough if protein is your main priority.',
        });
      } else {
        rows.push({
          id: 'protein',
          title: 'Protein support',
          status: 'bad',
          label: 'Low protein',
          description:
            'This product is low in protein and is not the strongest match for a high-protein goal.',
        });
      }
    }

    const matchedAllergens = userProfile.allergens.filter((allergen) =>
      product.allergens.map((item) => item.toLowerCase()).includes(allergen.toLowerCase())
    );

    if (matchedAllergens.length === 0) {
      rows.push({
        id: 'allergens',
        title: 'Allergen check',
        status: 'good',
        label: 'No conflict found',
        description:
          'No listed allergen conflict was found between your profile and this product.',
      });
    } else {
      rows.push({
        id: 'allergens',
        title: 'Allergen check',
        status: 'bad',
        label: 'Contains allergen',
        description: `This product may conflict with: ${matchedAllergens.join(', ')}.`,
      });
    }

    return rows;
  }, [userProfile, product]);

  const overall = getOverallScore(compareRows);
  const overallStyles = getStatusStyles(overall.status);

  return (
    <View className="mt-5 w-full px-4">
      <View className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4">
        <Text className="mb-2 text-[11px] font-extrabold tracking-[1px] text-red-400">
          COMPARISON USES THIS PROFILE
        </Text>

        <Text className="text-[10px] font-semibold uppercase text-gray-500">Demographics</Text>
        <Text className="mb-3 mt-1 text-sm font-semibold text-gray-800">
          {userProfile.gender} • {userProfile.ageGroup} • {userProfile.activityLevel}
        </Text>

        <Text className="text-[10px] font-semibold uppercase text-gray-500">Goals</Text>
        <Text className="mb-3 mt-1 text-sm font-semibold text-gray-800">
          {userProfile.goals.join(', ')}
        </Text>

        <Text className="text-[10px] font-semibold uppercase text-gray-500">Allergens</Text>
        <Text className="mt-1 text-sm font-semibold text-gray-800">
          {userProfile.allergens.length > 0 ? userProfile.allergens.join(', ') : 'None'}
        </Text>
      </View>

      <View className={`mb-4 rounded-xl border p-4 ${overallStyles.borderClass}`}>
        <View className="flex-row items-center gap-2">
          <FontAwesome name={overallStyles.icon} size={22} color={overallStyles.iconColor} />
          <Text className="text-base font-bold text-gray-900">Overall product match</Text>
        </View>

        <View className={`mt-3 self-start rounded-full px-3 py-1 ${overallStyles.badgeBg}`}>
          <Text className={`text-xs font-semibold ${overallStyles.badgeText}`}>
            {overall.label} • {overall.percentage}%
          </Text>
        </View>

        <Text className="mt-3 text-sm text-gray-600">
          This result is calculated using the user demographic profile, health goals, and allergen checks.
        </Text>
      </View>

      {compareRows.map((row) => {
        const styles = getStatusStyles(row.status);

        return (
          <View key={row.id} className={`mb-4 rounded-xl border p-4 ${styles.borderClass}`}>
            <View className="flex-row items-center gap-2">
              <FontAwesome name={styles.icon} size={20} color={styles.iconColor} />
              <Text className="text-sm font-bold text-gray-900">{row.title}</Text>
            </View>

            <View className={`mt-3 self-start rounded-full px-3 py-1 ${styles.badgeBg}`}>
              <Text className={`text-xs font-semibold ${styles.badgeText}`}>{row.label}</Text>
            </View>

            <Text className="mt-3 text-sm text-gray-600">{row.description}</Text>
          </View>
        );
      })}
    </View>
  );
}