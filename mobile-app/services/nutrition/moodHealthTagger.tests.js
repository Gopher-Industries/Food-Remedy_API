const { getMoodHealthTags } = require('./moodHealthTagger');

function expectIncludes(tags, expected) {
  const names = tags.map(t => t.tag);
  for (const e of expected) {
    if (!names.includes(e)) {
      console.error('FAIL: expected', e, 'but got', names);
      return false;
    }
  }
  console.log('PASS: includes', expected.join(','));
  return true;
}

function runTests() {
  const coffee = { ingredients: 'instant coffee, sugar', sugars_100g: 0.1 };
  const oats = { ingredients: 'oats, malt extract', fiber_100g: 6.5, proteins_100g: 13 };
  const soda = { ingredients: 'sugar, water', sugars_100g: 30 };
  const probiotic = { ingredients: 'yoghurt, live cultures', fibre_100g: 0.5 };

  console.log('Test coffee -> energyBoost');
  expectIncludes(getMoodHealthTags(coffee), ['energyBoost']);

  console.log('Test oats -> gutHealth and weightLoss (protein high)');
  expectIncludes(getMoodHealthTags(oats), ['gutHealth','weightLoss']);

  console.log('Test soda -> no weightLoss');
  const sodaTags = getMoodHealthTags(soda);
  if (!sodaTags.map(t => t.tag).includes('weightLoss')) console.log('PASS: soda excludes weightLoss');
  else console.error('FAIL: soda should not include weightLoss');

  console.log('Test probiotic -> gutHealth');
  expectIncludes(getMoodHealthTags(probiotic), ['gutHealth']);
}

if (require.main === module) runTests();

module.exports = { runTests };
