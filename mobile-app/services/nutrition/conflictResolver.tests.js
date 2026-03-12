const { resolveConflicts } = require('./conflictResolver');

function runTests() {
  console.log('Test 1: highSugar vs weightLoss');
  const tags1 = [{ tag: 'highSugar' }, { tag: 'weightLoss', confidence: 0.7 }];
  const r1 = resolveConflicts(tags1);
  console.log('Final:', r1.finalTags.map(t=>t.tag), 'Removed:', r1.removed.map(t=>t.tag));

  console.log('Test 2: highSaturatedFat vs heartHealth');
  const tags2 = [{ tag: 'highSaturatedFat'}, { tag: 'heartHealth', confidence: 0.6 }];
  const r2 = resolveConflicts(tags2);
  console.log('Final:', r2.finalTags.map(t=>t.tag), 'Removed:', r2.removed.map(t=>t.tag));

  console.log('Test 3: lowSugar vs highSugar');
  const tags3 = [{ tag: 'lowSugar', confidence: 0.6 }, { tag: 'highSugar', confidence: 0.9 }];
  const r3 = resolveConflicts(tags3);
  console.log('Final:', r3.finalTags.map(t=>t.tag), 'Removed:', r3.removed.map(t=>t.tag));
}

if (require.main === module) runTests();

module.exports = { runTests };
