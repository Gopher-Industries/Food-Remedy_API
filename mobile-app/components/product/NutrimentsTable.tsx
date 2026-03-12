// Nutriments Table tsx

import { nutrimentsToRows } from '@/services/utils/nutrimentsTable';
import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';


export default function NutrimentsTable({ nutriments }: { nutriments: Record<string, any> }) {
  const rows = nutrimentsToRows(nutriments);

  return (
    <View className="rounded-lg bg-white dark:bg-hsl15 overflow-hidden border border-hsl85 dark:border-hsl20">
      {/* header */}
      <View className="flex-row items-center px-4 py-3 bg-hsl95 dark:bg-hsl10">
        <Text className="flex-[1.2] text-sm font-interSemiBold text-hsl20">Nutrient</Text>
        <Text className="flex-1 text-right text-sm font-interSemiBold text-hsl20">Per serving</Text>
        <Text className="flex-1 text-right text-sm font-interSemiBold text-hsl20">Per 100g</Text>
      </View>

      {/* rows */}
      {rows.map((r, i) => (
        <View key={r.label}
          className={`flex-row items-center px-4 py-3 ${i % 2 ? 'bg-hsl98 dark:bg-hsl10' : ''}`}
        >
          <Text className="flex-[1.2] text-sm text-hsl20">{r.label}</Text>
          <Text className="flex-1 text-right text-sm text-hsl30 dark:text-hsl90">{r.perServing}</Text>
          <Text className="flex-1 text-right text-sm text-hsl30 dark:text-hsl90">{r.per100}</Text>
        </View>
      ))}
    </View>
  );
}