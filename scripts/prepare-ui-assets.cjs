const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const portal = path.join(root, 'portal');

// Keep English source strings in the translation catalogue as well as their
// component fallbacks. This allows missing translations to fall back cleanly.
const enPath = path.join(portal, 'lib/i18n/locales/en.json');
const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
for (const file of ['components/AuthShell.tsx', 'components/AppLayout.tsx', 'app/page.tsx']) {
  const source = fs.readFileSync(path.join(portal, file), 'utf8');
  for (const match of source.matchAll(/\bt\("([^"]+)", "([^"]+)"\)/g)) en[match[1]] = match[2];
}
Object.assign(en, {
  'nav.workspace': 'WORKSPACE', 'nav.evidence': 'PRICE EVIDENCE',
  'nav.review': 'REVIEW & OVERSIGHT', 'nav.manage': 'MANAGEMENT',
  'nav.open': 'Open navigation', 'nav.close': 'Close navigation',
  'plannedBody': 'This module is planned and is not available yet. Use HS classifications and the international or local price tools to continue your evidence review.',
  'poolBody': 'International, Ethiopian local market and historical customs evidence remain separate.',
});
fs.writeFileSync(enPath, JSON.stringify(en, null, 2) + '\n');

const am = JSON.parse(fs.readFileSync(path.join(portal, 'lib/i18n/locales/am.json'), 'utf8'));
const interfaceKeys = Object.keys(en).filter(key => /^(auth|overview|nav)\./.test(key));
const missingTranslations = interfaceKeys.filter(key => !am[key]);
if (missingTranslations.length) throw new Error('Missing Amharic translations: ' + missingTranslations.join(', '));
console.log(interfaceKeys.length + ' interface keys verified in English and Amharic.');

async function prepareImage() {
  const sharp = require(require.resolve('sharp', { paths: [portal] }));
  await sharp(path.join(portal, 'public/images/trade-terminal.png'))
    .webp({ quality: 85 })
    .toFile(path.join(portal, 'public/images/trade-terminal.webp'));
  console.log('Prepared English UI catalogue and optimized trade image.');
}
prepareImage().catch(error => { console.error(error.message); process.exitCode = 1; });
