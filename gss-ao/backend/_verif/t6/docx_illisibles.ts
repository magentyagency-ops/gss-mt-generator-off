// REG6-1 : lecture de toutes les pièces .docx du corpus ; celles que le parseur XML ne lit pas passent par mammoth.
import fs from 'fs';
import path from 'path';
import { extractText, loadDocxText } from '../../src/ingestion/docConverter';
const R = path.join(__dirname, '../../../_corpus_verif');
(async () => {
  for (const d of fs.readdirSync(R)) {
    const dir = path.join(R, d);
    if (!fs.statSync(dir).isDirectory() || d.startsWith('_')) continue;
    for (const f of fs.readdirSync(dir).filter((x) => /\.docx$/i.test(x))) {
      let ok = true;
      try { loadDocxText(path.join(dir, f)); } catch { ok = false; }
      if (ok) continue;
      const t = await extractText(path.join(dir, f));
      console.log(`${d}/${f} : repli mammoth, ${t.length} caractères`);
    }
  }
})();
