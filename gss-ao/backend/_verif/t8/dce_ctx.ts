// Tour 8 : texte du DCE tel que le générateur le construit (getDceContext), écrit dans un fichier (sans modèle).
// Usage : npx ts-node --transpile-only -P tsconfig.json _verif/t8/dce_ctx.ts <id_dossier> <sortie.txt>
const fs = require('fs');
const { DB } = require('../../src/core/db');
const { MemoireGenerator } = require('../../src/generation/memoire_generator');
const [id, sortie] = process.argv.slice(2);
DB.getDossier = async () => ({ id, dce_files: [] });
MemoireGenerator.prototype.materializeDceFromStorage = async () => null;
(async () => {
  const t = await (new MemoireGenerator() as any).getDceContext(id);
  fs.writeFileSync(sortie, t);
  console.log('écrit', sortie, t.length);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(2); });
