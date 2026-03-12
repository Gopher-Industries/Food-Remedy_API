// nutrimentsTable.ts
export type Nutriments = Record<string, number | string | undefined>;

type FieldCfg = {
  label: string;
  per100Key: string;
  perServingKey: string;
  unitKey?: string;
};

const FIELDS: FieldCfg[] = [
  { label: 'Energy (kcal)', per100Key: 'energy-kcal_100g', perServingKey: 'energy-kcal_serving', },
  // { label: 'Energy (kJ)', per100Key: 'energy_100g', perServingKey: 'energy_serving', },
  { label: 'Fat', per100Key: 'fat_100g', perServingKey: 'fat_serving', unitKey: 'fat_unit' },
  { label: 'Saturated fat', per100Key: 'saturated-fat_100g', perServingKey: 'saturated-fat_serving', unitKey: 'saturated-fat_unit' },
  { label: 'Carbs', per100Key: 'carbohydrates_100g', perServingKey: 'carbohydrates_serving', unitKey: 'carbohydrates_unit' },
  { label: 'Sugars', per100Key: 'sugars_100g', perServingKey: 'sugars_serving', unitKey: 'sugars_unit' },
  { label: 'Protein', per100Key: 'proteins_100g', perServingKey: 'proteins_serving', unitKey: 'proteins_unit' },
  { label: 'Fibre', per100Key: 'fibre_100g', perServingKey: 'fibre_serving', unitKey: 'fibre_unit' },
  { label: 'Salt', per100Key: 'salt_100g', perServingKey: 'salt_serving', unitKey: 'salt_unit' },
  { label: 'Sodium', per100Key: 'sodium_100g', perServingKey: 'sodium_serving', unitKey: 'sodium_unit' },
];

const fmt = (n: unknown) =>
  typeof n === 'number' && isFinite(n) ? Number(n.toFixed(2)) : n ?? '-';

export function nutrimentsToRows(nutriments: Nutriments) {
  return FIELDS.map(f => {
    const unit = (nutriments[f.unitKey ?? ''] as string) || '';
    const per100 = nutriments[f.per100Key] as number | undefined;
    const perServing = nutriments[f.perServingKey] as number | undefined;

    return {
      label: f.label,
      per100: per100 != null ? `${fmt(per100)} ${unit}`.trim() : '-',
      perServing: perServing != null ? `${fmt(perServing)} ${unit}`.trim() : '-',
    };
  });
}
