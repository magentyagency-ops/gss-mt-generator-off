// Où une exigence de la matrice est rattachée (exigencesParRubrique) d'après un indicateurs_<n>.json capturé.
import fs from 'fs';
const { chargerMemoireType, exigencesParRubrique } = require('../../src/generation/memoire_type');
const [f, motif] = process.argv.slice(2);
const j = JSON.parse(fs.readFileSync(f, 'utf-8'));
const r = exigencesParRubrique(chargerMemoireType(), j.plan, j.matrice);
const rx = new RegExp(motif, 'i');
for (const [rub, l] of Object.entries(r.parRubrique) as any) for (const e of l) if (rx.test(e.exigence)) console.log(rub, '←', e.exigence.slice(0, 100));
for (const e of r.nouvelles) if (rx.test(e.exigence)) console.log('NOUVELLE ←', e.exigence.slice(0, 100));
