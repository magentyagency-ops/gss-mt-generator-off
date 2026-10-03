/** Dessin hors ligne du schéma demandé du champ 9 du cadre etampes2 (cas pratique) avec le code courant. */
import fs from 'fs';
import { calculerDimensionnement, etapesSchemaDemande } from '../../src/generation/dimensionnement';
import { specProcessBesoin, resultatBesoin } from '../../src/generation/reponse_libre_v2';
import { dessinerSpecs } from '../../src/generation/schema_service';
import { themeActif } from '../../src/generation/themes';
const [texteF, sortie] = process.argv.slice(2);
const dce = fs.readFileSync('../_corpus_verif/_dce_textes/etampes2.txt', 'utf-8');
const P = ['Agent de sécurité', 'Maître-chien', 'Agent de sécurité incendie', 'Encadrant'];
const pl = [{ libelle: 'Dimanche férié, 6 h–21 h', debut: '06:00', fin: '21:00' }, { libelle: 'Nuit, 21 h–6 h', debut: '21:00', fin: '06:00' }, { libelle: 'Lundi férié, 6 h–21 h', debut: '06:00', fin: '21:00' }];
const n: any = { 'Dimanche férié, 6 h–21 h': [10, 1, 1, 1], 'Nuit, 21 h–6 h': [4, 1, 1, 0], 'Lundi férié, 6 h–21 h': [10, 1, 1, 1] };
const d = calculerDimensionnement({ postes: [], cas_pratique: { plages: pl, dispositif: pl.flatMap((p) => P.map((pr, i) => ({ plage: p.libelle, profil: pr, en_service: n[p.libelle][i] }))) } }, dce)!;
const tout = fs.readFileSync(texteF, 'utf-8');
const debut = tout.indexOf('Répartition des effectifs sur le périmètre');
const champ9 = tout.slice(debut, tout.indexOf('……………………/10 points', debut));
const res = resultatBesoin(champ9);
console.log('résultat tiré du texte :', JSON.stringify(res));
const spec = specProcessBesoin(etapesSchemaDemande(champ9, d, res) || [], 'flux')!;
console.log(JSON.stringify(spec.params.etapes));
(async () => {
  const r = await dessinerSpecs([{ id: 'c9', gabarit: spec.gabarit, params: spec.params, source: `${champ9}\n${tout}`, titre_section: 'Présentation de l’organisation du dispositif engagé au cours de la prestation' }], 'paysage', themeActif());
  const x = r.get('c9');
  console.log('ok', x?.ok, x?.erreurs);
  if (x?.svg) fs.writeFileSync(sortie, x.svg);
  process.exit(0);
})();
