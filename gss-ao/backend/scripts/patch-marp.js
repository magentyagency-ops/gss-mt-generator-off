/**
 * Post-install patch : injecte « --disable-dev-shm-usage » dans le code
 * marp-cli bundlé, pour éviter que Chromium plante sur Railway (où /dev/shm
 * est trop petit).  Idempotent : ne patche qu'une seule fois.
 */
const fs = require('fs');
const path = require('path');
const glob = require('path');

const marpDir = path.join(__dirname, '..', 'node_modules', '@marp-team', 'marp-cli', 'lib');
if (!fs.existsSync(marpDir)) {
  console.log('[patch-marp] marp-cli not installed yet, skipping.');
  process.exit(0);
}

const files = fs.readdirSync(marpDir).filter(f => f.endsWith('.js'));
let patched = false;

for (const file of files) {
  const filePath = path.join(marpDir, file);
  let content = fs.readFileSync(filePath, 'utf-8');

  // Cherche l'endroit où marp-cli construit les args Puppeteer et ajoute
  // --disable-dev-shm-usage s'il n'y est pas déjà.
  if (content.includes('--disable-dev-shm-usage')) {
    console.log(`[patch-marp] ${file}: already patched, skipping.`);
    continue;
  }

  // Pattern : après "--no-sandbox", on insère les flags critiques pour Railway
  const marker = 't.add("--no-sandbox")';
  if (content.includes(marker)) {
    const extraFlags = [
      '--disable-dev-shm-usage',
      '--single-process',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-default-apps',
      '--no-first-run',
      '--js-flags=--max-old-space-size=512',
    ].map(f => `t.add("${f}")`).join(',');

    content = content.replace(marker, marker + ',' + extraFlags);
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`[patch-marp] ${file}: injected Railway Chrome flags ✓`);
    patched = true;
  }
}

if (!patched) {
  console.log('[patch-marp] No patchable file found (pattern may have changed).');
}
