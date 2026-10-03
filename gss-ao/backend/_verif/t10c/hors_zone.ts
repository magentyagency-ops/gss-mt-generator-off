// T10-COH-6 : sites certainement hors de la zone de GSS (moitié nord), sur le corpus et le DCE sud du vérificateur.
import fs from 'fs';
import { alerteHorsZone } from '../../src/generation/base_memoires';
const dir = `${__dirname}/../../../_corpus_verif/_dce_textes/`;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.txt'))) console.log(f.padEnd(18), alerteHorsZone({}, fs.readFileSync(dir + f, 'utf8')).join(' ').slice(0, 160));
const sud = "Le présent CCTP définit les prestations de l'Hôpital Nord, 15 chemin des Bourrely, 13015 Marseille (lot 1), et du Centre hospitalier de Gap, 1 place Auguste Muret, 05000 Gap (lot 2).";
console.log('sud'.padEnd(18), alerteHorsZone({}, sud).join(' '));
