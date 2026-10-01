// Correction 9 : texte du DCE tel que le générateur le lit (getDceContext, tableurs compris), sans appel au modèle.
// Usage : correction9_dce.ts <code corpus> <fichier de sortie>
import fs from 'fs';
import path from 'path';
import { DB } from '../src/core/db';
import { MemoireGenerator } from '../src/generation/memoire_generator';
const [code, sortie] = process.argv.slice(2);
const id = `v-c9dce-${code}`;
const ROOT = path.resolve(__dirname, '../..');
const dceDir = path.join(ROOT, 'data/output', `dce_${id}`);
fs.rmSync(dceDir, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, '_corpus_verif', code), dceDir, { recursive: true });
(DB as any).getDossier = async () => ({ id, dce_files: [] });
const P: any = MemoireGenerator.prototype;
P.materializeDceFromStorage = async () => null;
(async () => {
  const t = await P.getDceContext.call(new MemoireGenerator(), id);
  fs.writeFileSync(sortie, t);
  fs.rmSync(dceDir, { recursive: true, force: true });
  console.log(code, t.length, 'caractères');
  process.exit(0);
})();
