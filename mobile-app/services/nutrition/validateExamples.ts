import scorer from './nutritionScorer';

// Load seed examples from the database seeding file to validate scoring against real-world samples.
// Adjust the relative path if running from a different working directory.
const samples = require('../../../database/seeding/cleanTestSample.json');

function runValidation() {
  console.log('Running nutrition scoring validation for sample products');
  for (const p of samples) {
    const out = scorer.scoreProduct(p);
    console.log('---');
    console.log('Product:', p.product_name || p.name || p.code || 'unnamed');
    console.log('Tags:', out.tags.join(', '));
    console.log('CompositeScore:', out.compositeScore);
    console.log('Scores:', out.scores);
    console.log('Raw values:', out.raw);
  }
}

if (require.main === module) runValidation();

export { runValidation };
