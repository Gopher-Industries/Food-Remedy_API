const iq = require('./ingredientQualityTagger');

function assertEqual(a, b, msg) {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa !== sb) throw new Error(`${msg}\n  got: ${sa}\n  expected: ${sb}`);
}

function runTests() {
  // 1. Clean-food example: Apple
  const apple = ['Apple'];
  const r1 = iq.aggregateProductScore(apple);
  console.log('Apple:', r1);
  if (r1.riskLevel !== 'lowRisk') throw new Error('Apple should be lowRisk');

  // 2. Clean-food example: Almonds
  const almonds = ['Almonds'];
  const r2 = iq.aggregateProductScore(almonds);
  console.log('Almonds:', r2);
  if (r2.riskLevel !== 'lowRisk') throw new Error('Almonds should be lowRisk');

  // 3. Processed-food: Instant Noodles
  const noodles = [
    'Wheat flour',
    'Palm oil',
    'Hydrolysed vegetable protein',
    'Salt',
    'Monosodium glutamate',
    'Maltodextrin'
  ];
  const r3 = iq.aggregateProductScore(noodles);
  console.log('Instant Noodles:', r3);
  if (r3.riskLevel === 'lowRisk') {
    throw new Error('Instant Noodles should not be lowRisk');
  }
  if (
    !r3.additiveSummary ||
    (!r3.additiveSummary.thickeners &&
     !r3.additiveSummary.flavourings &&
     !r3.additiveSummary.emulsifiers)
  ) {
    console.warn('Warning: expected some additives for instant noodles', r3);
  }

  // 4. Diet soda: artificial sweeteners
  const soda = [
    'Carbonated water',
    'Caramel colour',
    'Sweetener (sucralose)',
    'Natural flavour'
  ];
  const r4 = iq.aggregateProductScore(soda);
  console.log('Diet Soda:', r4);
  if (!r4.additiveSummary || !r4.additiveSummary.sweeteners) {
    throw new Error('Diet Soda should detect sweeteners');
  }
  if (r4.riskLevel === 'lowRisk') {
    throw new Error('Diet Soda should not be lowRisk');
  }

  // 5. Processed yoghurt with stabilisers
  const yog = ['Milk', 'Sugar', 'Carrageenan', 'Natural flavour'];
  const r5 = iq.aggregateProductScore(yog);
  console.log('Yogurt:', r5);
  if (r5.riskLevel === 'lowRisk') {
    throw new Error('Yogurt with carrageenan should be at least moderateRisk');
  }

  console.log('All ingredient quality tests passed');
}

if (require.main === module) runTests();
module.exports = { runTests };