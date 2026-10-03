import fs from 'fs';
import { preparerMemoireType, publierMemoire } from '../../src/generation/memoire_type';
const dce = fs.readFileSync('../_corpus_verif/_dce_textes/etampes2.txt', 'utf-8');
const prep = preparerMemoireType({ dce, analyse: { clientName: "Mairie d'Etampes" } } as any);
const ids = publierMemoire(prep).filter((p) => p.texte).map((p) => p.id);
console.log('PLAN', ids.filter((x) => /rempla|intrusion/.test(x)).join(' '));
const p = publierMemoire(prep).find((x) => x.id === 'b5_remplacement_imprevu');
console.log('IMPREVU', p?.texte?.slice(0, 600));
