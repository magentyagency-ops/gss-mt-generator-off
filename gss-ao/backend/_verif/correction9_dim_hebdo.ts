// Tour 1 (B12) : volume annuel du DCE et heures par semaine cohérents (ifits 171 : « 84 h par semaine » pour 1 751 h par an).
import { calculerDimensionnement, questionDimensionnement } from '../src/generation/dimensionnement';
let ko = 0;
const v = (nom: string, ok: boolean, detail = '') => { console.log(`${ok ? 'OK ' : 'KO '} ${nom}${detail ? ` — ${detail}` : ''}`); if (!ok) ko++; };
const dce = 'Gardiennage avec agent conducteur de chien du lundi au vendredi de 5h à 8h et de 17h à 20h. Volume estimé : 1751 heures en 2027.';
const d = calculerDimensionnement({ postes: [{ profil: 'Agent conducteur de chien', citation: 'agent conducteur de chien du lundi au vendredi de 5h à 8h', heures_an: 1751,
  plages: [{ jours: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'], debut: '05:00', fin: '17:00' }] }] }, dce);
const p = d?.profils[0];
v('heures par semaine tirées du volume annuel du DCE', !!p && Math.abs(p.heuresSemaine - 1751 / 52) < 0.1 && p.heuresAn === 1751, JSON.stringify(p));
const q = d ? questionDimensionnement(d) : '';
v('question sans « 84 heures par semaine »', !/84 h/.test(q), q.slice(0, 300));
console.log(ko ? `${ko} échec(s)` : 'Tout est conforme.');
process.exit(ko ? 1 : 0);
