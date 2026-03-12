import React from 'react';
import { View } from 'react-native';
import UIText from '@/components/ui/UIText';

interface ProductCategoryTagsProps {
  category?: string | null;
  categories?: string[] | null;
}

const MAX_TAGS = 3;

export const ProductCategoryTags: React.FC<ProductCategoryTagsProps> = ({
  category,
  categories,
}) => {
  // Combine, trim, remove empty, dedupe (case-insensitive)
  let tags: string[] = [];
  if (Array.isArray(categories)) {
    tags = categories.map((c) => (c || '').trim()).filter(Boolean);
  }
  if (typeof category === 'string' && category.trim()) {
    tags.push(category.trim());
  }
  // Dedupe case-insensitive
  tags = Array.from(
    new Map(tags.map((t) => [t.toLowerCase(), t])).values()
  );
  if (!tags.length) return null;

  const displayTags = tags.slice(0, MAX_TAGS);
  const extraCount = tags.length - MAX_TAGS;

  return (
    <View className="flex-row flex-wrap gap-1 mt-1">
      {displayTags.map((tag, idx) => (
        <View
          key={tag + idx}
          className="px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50"
        >
          <UIText className="text-xs text-gray-700 font-medium">{tag}</UIText>
        </View>
      ))}
      {extraCount > 0 && (
        <View className="px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50">
          <UIText className="text-xs text-gray-500 font-medium">+{extraCount}</UIText>
        </View>
      )}
    </View>
  );
};

export default ProductCategoryTags;

/*
// --- Integration snippet ---
// Import path for your repo:
import ProductCategoryTags from '@/components/product/ProductCategoryTags';

// For single category:
<ProductCategoryTags category={product.category} />

// For multiple categories:
<ProductCategoryTags categories={product.categories} />
*/