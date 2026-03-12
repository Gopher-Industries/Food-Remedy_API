// History Filters Component
// Provides filter options for scan history: category, allergens, suitability, date

import React, { useState, useCallback } from "react";
import { View, Pressable, ScrollView, Modal } from "react-native";
import Tt from "@/components/ui/UIText";
import IconGeneral from "@/components/icons/IconGeneral";
import { ALLERGIES } from "@/services/constants/NutritionalTags";

// Filter types
export type DateFilter = "all" | "today" | "week" | "month";
export type SuitabilityFilter = "all" | "suitable" | "warning" | "unsuitable";

export interface HistoryFilterState {
  dateFilter: DateFilter;
  categories: string[];
  allergens: string[];
  suitability: SuitabilityFilter;
}

export const DEFAULT_FILTERS: HistoryFilterState = {
  dateFilter: "all",
  categories: [],
  allergens: [],
  suitability: "all",
};

// Common categories from Open Food Facts
const CATEGORIES = [
  "Beverages",
  "Snacks",
  "Dairy",
  "Cereals",
  "Meats",
  "Fruits",
  "Vegetables",
  "Frozen",
  "Canned",
  "Bakery",
];

const DATE_OPTIONS: { label: string; value: DateFilter }[] = [
  { label: "All Time", value: "all" },
  { label: "Today", value: "today" },
  { label: "This Week", value: "week" },
  { label: "This Month", value: "month" },
];

const SUITABILITY_OPTIONS: { label: string; value: SuitabilityFilter }[] = [
  { label: "All", value: "all" },
  { label: "Suitable", value: "suitable" },
  { label: "Warning", value: "warning" },
  { label: "Unsuitable", value: "unsuitable" },
];

interface HistoryFiltersProps {
  visible: boolean;
  filters: HistoryFilterState;
  onClose: () => void;
  onApply: (filters: HistoryFilterState) => void;
  onReset: () => void;
}

export default function HistoryFilters({
  visible,
  filters,
  onClose,
  onApply,
  onReset,
}: HistoryFiltersProps) {
  const [localFilters, setLocalFilters] = useState<HistoryFilterState>(filters);

  // Reset local filters when modal opens
  React.useEffect(() => {
    if (visible) {
      setLocalFilters(filters);
    }
  }, [visible, filters]);

  const toggleCategory = useCallback((cat: string) => {
    setLocalFilters((prev: HistoryFilterState) => ({
      ...prev,
      categories: prev.categories.includes(cat)
        ? prev.categories.filter((c: string) => c !== cat)
        : [...prev.categories, cat],
    }));
  }, []);

  const toggleAllergen = useCallback((allergen: string) => {
    setLocalFilters((prev: HistoryFilterState) => ({
      ...prev,
      allergens: prev.allergens.includes(allergen)
        ? prev.allergens.filter((a: string) => a !== allergen)
        : [...prev.allergens, allergen],
    }));
  }, []);

  const setDateFilter = useCallback((date: DateFilter) => {
    setLocalFilters((prev: HistoryFilterState) => ({ ...prev, dateFilter: date }));
  }, []);

  const setSuitability = useCallback((suit: SuitabilityFilter) => {
    setLocalFilters((prev: HistoryFilterState) => ({ ...prev, suitability: suit }));
  }, []);

  const handleApply = () => {
    onApply(localFilters);
    onClose();
  };

  const handleReset = () => {
    setLocalFilters(DEFAULT_FILTERS);
    onReset();
  };

  const activeFilterCount =
    (localFilters.dateFilter !== "all" ? 1 : 0) +
    localFilters.categories.length +
    localFilters.allergens.length +
    (localFilters.suitability !== "all" ? 1 : 0);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-hsl95 dark:bg-hsl10 p-safe">
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-hsl85 dark:border-hsl20">
          <Pressable onPress={onClose} hitSlop={10}>
            <IconGeneral type="close" fill="hsl(0, 0%, 30%)" size={24} />
          </Pressable>
          <Tt className="text-lg font-interBold">Filters</Tt>
          <Pressable onPress={handleReset} hitSlop={10}>
            <Tt className="text-primary font-interMedium">Reset</Tt>
          </Pressable>
        </View>

        <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
          {/* Date Filter */}
          <View className="mt-6">
            <Tt className="font-interSemiBold text-hsl20 mb-3">Date Range</Tt>
            <View className="flex-row flex-wrap gap-2">
              {DATE_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => setDateFilter(opt.value)}
                  className={`px-4 py-2 rounded-full border ${
                    localFilters.dateFilter === opt.value
                      ? "bg-primary border-primary"
                      : "bg-white dark:bg-hsl15 border-hsl80"
                  }`}
                >
                  <Tt
                    className={`font-interMedium ${
                      localFilters.dateFilter === opt.value ? "text-white" : "text-hsl30 dark:text-hsl90"
                    }`}
                  >
                    {opt.label}
                  </Tt>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Categories Filter */}
          <View className="mt-6">
            <Tt className="font-interSemiBold text-hsl20 mb-3">Categories</Tt>
            <View className="flex-row flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <Pressable
                  key={cat}
                  onPress={() => toggleCategory(cat)}
                  className={`px-4 py-2 rounded-full border ${
                    localFilters.categories.includes(cat)
                      ? "bg-primary border-primary"
                      : "bg-white dark:bg-hsl15 border-hsl80"
                  }`}
                >
                  <Tt
                    className={`font-interMedium ${
                      localFilters.categories.includes(cat) ? "text-white" : "text-hsl30 dark:text-hsl90"
                    }`}
                  >
                    {cat}
                  </Tt>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Allergens Filter */}
          <View className="mt-6">
            <Tt className="font-interSemiBold text-hsl20 mb-3">Contains Allergens</Tt>
            <View className="flex-row flex-wrap gap-2">
              {ALLERGIES.map((allergen) => (
                <Pressable
                  key={allergen}
                  onPress={() => toggleAllergen(allergen)}
                  className={`px-4 py-2 rounded-full border ${
                    localFilters.allergens.includes(allergen)
                      ? "bg-primary border-primary"
                      : "bg-white dark:bg-hsl15 border-hsl80"
                  }`}
                >
                  <Tt
                    className={`font-interMedium ${
                      localFilters.allergens.includes(allergen) ? "text-white" : "text-hsl30 dark:text-hsl90"
                    }`}
                  >
                    {allergen}
                  </Tt>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Suitability Filter */}
          <View className="mt-6 mb-8">
            <Tt className="font-interSemiBold text-hsl20 mb-3">Suitability</Tt>
            <View className="flex-row flex-wrap gap-2">
              {SUITABILITY_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => setSuitability(opt.value)}
                  className={`px-4 py-2 rounded-full border ${
                    localFilters.suitability === opt.value
                      ? "bg-primary border-primary"
                      : "bg-white dark:bg-hsl15 border-hsl80"
                  }`}
                >
                  <Tt
                    className={`font-interMedium ${
                      localFilters.suitability === opt.value ? "text-white" : "text-hsl30 dark:text-hsl90"
                    }`}
                  >
                    {opt.label}
                  </Tt>
                </Pressable>
              ))}
            </View>
          </View>
        </ScrollView>

        {/* Apply Button */}
        <View className="px-4 py-4 border-t border-hsl85 dark:border-hsl20">
          <Pressable
            onPress={handleApply}
            className="bg-primary py-3 rounded-lg active:opacity-80"
          >
            <Tt className="text-white text-center font-interSemiBold text-lg">
              Apply Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
            </Tt>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// Filter chip component for showing active filters
interface FilterChipProps {
  label: string;
  onRemove: () => void;
}

export function FilterChip({ label, onRemove }: FilterChipProps) {
  return (
    <View className="flex-row items-center bg-primary/10 border border-primary/30 rounded-full px-3 py-1 mr-2 mb-2">
      <Tt className="text-primary font-interMedium text-sm mr-2">{label}</Tt>
      <Pressable onPress={onRemove} hitSlop={8}>
        <IconGeneral type="close" fill="#FF3F3F" size={14} />
      </Pressable>
    </View>
  );
}
