const { getDietLifestyleTags } = require('./dietLifestyleTagger');

function runTests() {
  // Mixed-category product samples
  const samples = [];

  // 1. Rolled oats (should be vegan, vegetarian, halal, dairyFree, glutenFree depending on source; our heuristic: vegan, vegetarian, halal, dairyFree, lowGI)
  samples.push({
    name: 'Rolled Oats',
    product: { ingredients_text: 'Rolled oats', allergens: '' },
    norm: { carbohydrates_g: 66, sugars_g: 1.0, fiber_g: 10 },
    existing: [] ,
    expectDiet: ['vegan','vegetarian','dairyFree','glutenFree'],
    expectLifestyle: ['lowGI']
  });

  // 2. Milk chocolate (not dairyFree, not vegan; contains sugar -> not diabeticFriendly)
  samples.push({
    name: 'Milk Chocolate',
    product: { ingredients_text: 'Sugar, cocoa butter, milk powder, cocoa mass, lactose', allergens: 'milk' },
    norm: { carbohydrates_g: 60, sugars_g: 50, fiber_g: 3 },
    existing: ['highSugar'],
    expectDiet: ['glutenFree','vegetarian'],
    expectLifestyle: []
  });

  // 3. Canned tuna in olive oil (not vegan/vegetarian, likely halal depending; assume meat present)
  samples.push({
    name: 'Canned Tuna',
    product: { ingredients_text: 'Tuna, olive oil, salt', allergens: 'fish' },
    norm: { carbohydrates_g: 0, sugars_g: 0, fiber_g: 0 },
    existing: [],
    expectDiet: ['dairyFree','glutenFree'],
    expectLifestyle: ['ketoFriendly','diabeticFriendly']
  });

  // 4. Gluten-free bread (contains rice/flour alternatives)
  samples.push({
    name: 'Gluten Free Bread',
    product: { ingredients_text: 'Rice flour, water, yeast, salt', allergens: '' },
    norm: { carbohydrates_g: 40, sugars_g: 2, fiber_g: 2 },
    existing: [],
     expectDiet: ['vegan','vegetarian','dairyFree','glutenFree'],
     expectLifestyle: []
  });

  // 5. Yogurt (dairy product)
  samples.push({
    name: 'Yogurt',
    product: { ingredients_text: 'Milk, live cultures', allergens: 'milk' },
    norm: { carbohydrates_g: 4, sugars_g: 4, fiber_g: 0 },
    existing: [],
    expectDiet: ['glutenFree','vegetarian'],
    expectLifestyle: ['diabeticFriendly','ketoFriendly']
  });

  // --- Additional coverage tests ---
  // 6. Gluten-present product (contains wheat/barley)
  samples.push({
    name: 'Wheat Crackers',
    product: { ingredients_text: 'Wheat flour, barley malt, salt', allergens: 'gluten, wheat' },
    norm: { carbohydrates_g: 60, sugars_g: 2, fiber_g: 3 },
    existing: [],
    expectDiet: ['dairyFree','vegan','vegetarian'], // glutenFree must be excluded
    expectLifestyle: ['lowGI']
  });

  // 7. Non-halal / non-vegetarian (pork + gelatine)
  samples.push({
    name: 'Pork Jelly',
    product: { ingredients_text: 'Pork, gelatine, salt', allergens: '' },
    norm: { carbohydrates_g: 0, sugars_g: 0, fiber_g: 0 },
    existing: [],
    expectDiet: ['dairyFree','glutenFree'], // should not be vegan/vegetarian/halal but dairy/gluten absent
    expectLifestyle: ['ketoFriendly','diabeticFriendly']
  });

  // 8. Artificial-sweetener zero-sugar soft drink
  samples.push({
    name: 'Zero Cola',
    product: { ingredients_text: 'Carbonated water, sweetener (sucralose), natural flavour', allergens: '' },
    norm: { carbohydrates_g: 0, sugars_g: 0, fiber_g: 0 },
    existing: [],
    expectDiet: ['vegan','vegetarian','dairyFree','glutenFree'],
    expectLifestyle: ['diabeticFriendly','ketoFriendly']
  });

  // 9. Missing-data robustness
  samples.push({
    name: 'Mystery Item',
    product: { ingredients_text: '', allergens: '' },
    norm: {},
    existing: [],
    expectDiet: [],
    expectLifestyle: []
  });

  // Run assertions
  for (const s of samples) {
    const res = getDietLifestyleTags(s.product, s.norm, s.existing);
    const diet = res.dietTags.sort();
    const life = res.lifestyleTags.sort();

    const expectDiet = (s.expectDiet || []).sort();
    const expectLife = (s.expectLifestyle || []).sort();

    const dietOk = JSON.stringify(diet) === JSON.stringify(expectDiet);
    const lifeOk = JSON.stringify(life) === JSON.stringify(expectLife);

    console.log(`${s.name}: dietTags=${JSON.stringify(diet)} lifestyleTags=${JSON.stringify(life)} reasons=${JSON.stringify(res.reasons)}`);
    if (!dietOk) {
      throw new Error(`${s.name} DIET MISMATCH\n  got:      ${JSON.stringify(diet)}\n  expected: ${JSON.stringify(expectDiet)}\n  reasons:  ${JSON.stringify(res.reasons)}`);
    }
    if (!lifeOk) {
      throw new Error(`${s.name} LIFESTYLE MISMATCH\n  got:      ${JSON.stringify(life)}\n  expected: ${JSON.stringify(expectLife)}\n  reasons:  ${JSON.stringify(res.reasons)}`);
    }
  }

  console.log('All diet/lifestyle tagger tests passed');
}

if (require.main === module) runTests();
