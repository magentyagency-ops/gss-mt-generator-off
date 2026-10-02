import fs from 'fs';
import path from 'path';
import { recalerSurReference, texteBrut, nettoyerReponseCadre, completerSousTitresVides } from '../../src/generation/memoire_type_cadre';
import { nettoyerChampCadre } from '../../src/generation/base_memoires';
const mt = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../src/generation/memoire_type/memoire_type.json'), 'utf-8'));
const ref = ['b2_ecologie_mobilite_numerique', 'b2_ecologie_energie_recyclage'].map((id) => texteBrut(mt.rubriques.find((r: any) => r.id === id).texte)).join('\n\n');
const a = nettoyerReponseCadre(ref); const b = completerSousTitresVides(a, []).texte; const c = nettoyerChampCadre(b);
const show = (x: string, y: string, n: string) => { const X = x.split('\n'), Y = y.split('\n'); console.log(n, X.length, Y.length); X.forEach((l, i) => { if (!Y.includes(l)) console.log('  -', l); }); };
show(ref, a, 'nettoyerReponseCadre'); show(b, a, 'completer+'); show(b, c, 'nettoyerChamp');
