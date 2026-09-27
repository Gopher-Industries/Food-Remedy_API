/* Scan client-reachable source for accidental SDK, credential or adapter imports. */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const clientRoots = ['app', 'components', 'config', 'hooks', 'services', 'src', 'types'];
const forbidden = /@typesafe-ai\/sdk|TYPESAFE_API_KEY|typesafeSemanticFitClient|EXPO_PUBLIC_TYPESAFE/;
const offenders = [];

function walk(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    const relative = path.relative(root, file).replaceAll('\\', '/');
    if (entry.isDirectory()) {
      if (relative === 'app/api' || relative.includes('/__tests__') || entry.name === 'node_modules') continue;
      walk(file);
    } else if (/\.[cm]?[jt]sx?$/.test(entry.name) && forbidden.test(fs.readFileSync(file, 'utf8'))) {
      offenders.push(relative);
    }
  }
}

for (const directory of clientRoots) walk(path.join(root, directory));
if (offenders.length) {
  console.error(`TypeSafe server boundary violation: ${offenders.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('TypeSafe client source boundary: no credential, SDK or adapter references');
}
