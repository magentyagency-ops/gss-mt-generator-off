/**
 * Vocabulaire du CCTP (« chef de poste », IGN) aussi dans les textes des schémas de la bibliothèque (vérification 9,
 * bug 11 ; correction 10, bug 3 en partie) : même rôle, mot de l'acheteur ; le dessin, les idées et les autres textes
 * ne changent pas. Format page (redessin depuis les spécifications, textes contrôlés) et paysage (cadre, format court :
 * dessin d'origine, terme coupé sur deux lignes réparti sans allonger une ligne). Retour arrière et DCE sans ce terme :
 * schémas inchangés. Aucun appel OpenAI.
 * Usage : npx ts-node --transpile-only _verif/restes_vocabulaire_schemas.ts [sortie_png]
 */
import fs from 'fs';
import path from 'path';
import { schemasBibliotheque } from '../src/generation/themes';
import { vocabulaireSchemas } from '../src/generation/base_memoires';
import { rendrePng } from '../src/generation/visuels_cadre';

let ko = 0;
const verifier = (nom: string, ok: boolean, detail = '') => { console.log(`${ok ? 'OK ' : 'KO '} ${nom}${detail ? ` — ${detail}` : ''}`); if (!ok) ko++; };
const dce = (c: string) => fs.readFileSync(path.resolve(__dirname, `../../_corpus_verif/_dce_textes/${c}.txt`), 'utf-8');
const textes = (svg: string) => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1].replace(/&amp;/g, '&')).join(' | ');
const ANCIEN = /(?:chef|responsable)s?\s+de(?:\s|\s\|\s)+site/i;

const voc = vocabulaireSchemas(dce('ign'));
verifier('IGN : vocabulaire « chef de poste » transmis aux schémas', voc.length === 2, JSON.stringify(voc));
for (const c of ['citedia2', 'becquerel', 'etampes1', 'imm']) verifier(`${c} : aucun vocabulaire (le CCTP n'impose pas « chef de poste »)`, !vocabulaireSchemas(dce(c)).length);

const IDS = ['II-ENC-10', 'IV-ORG-01', 'IV-QUA-08', 'IV-PLA-02', 'II-REC-06', 'II-ABS-01', 'IV-QUA-10', 'IV-AME-03', 'III-ACC-03b', 'IV-PLA-01'];
const sortie = process.argv[2];
(async () => {
  for (const format of ['page', 'paysage'] as const) {
    const avec = schemasBibliotheque([...IDS, 'I-PRE-01'], format, 'marine', voc);
    const sans = schemasBibliotheque([...IDS, 'I-PRE-01'], format, 'marine');
    for (const id of IDS) {
      const t = textes(avec.get(id) || ''), t0 = textes(sans.get(id) || '');
      verifier(`${format} ${id} : « chef de poste », plus l'ancien terme`, !ANCIEN.test(t) && /chefs? de poste|chefs? de \| poste/i.test(t), t.match(/[^|]{0,30}chefs? de[^|]{0,12}(?:\| [^|]{0,12})?/gi)?.join(' ¦ '));
      const reste = (x: string) => x.replace(/(?:chef|responsable)s?(?: \| | )de(?: \| | )(?:site|poste)/gi, '').replace(/[\s|]+/g, ' ').trim();
      verifier(`${format} ${id} : autres textes identiques`, reste(t) === reste(t0), `${reste(t).slice(0, 80)} ≠ ${reste(t0).slice(0, 80)}`);
      if (format === 'page') verifier(`page ${id} : redessiné en portrait (pas de repli paysage)`, /viewBox="0 0 1000 1270"/.test(avec.get(id) || '') || /data-format="page"/.test(avec.get(id) || ''), (avec.get(id) || '').slice(0, 120));
    }
    verifier(`${format} : schéma sans le terme identique (I-PRE-01)`, avec.get('I-PRE-01') === sans.get('I-PRE-01'));
  }
  const ret = schemasBibliotheque(['II-ENC-10'], 'paysage', 'gss-2026-09', voc).get('II-ENC-10');
  verifier('retour arrière : schéma d\'origine inchangé', ret === fs.readFileSync(path.resolve(__dirname, '../python/schemas_gss/bibliotheque/II-ENC-10.svg'), 'utf-8'));
  if (sortie) {
    fs.mkdirSync(sortie, { recursive: true });
    const p = schemasBibliotheque(['II-ENC-10', 'IV-QUA-08'], 'page', 'marine', voc);
    const q = schemasBibliotheque(['IV-QUA-08', 'IV-PLA-02'], 'paysage', 'marine', voc);
    const pngs = await rendrePng([p.get('II-ENC-10')!, p.get('IV-QUA-08')!, q.get('IV-QUA-08')!, q.get('IV-PLA-02')!], 'marine');
    ['page_II-ENC-10', 'page_IV-QUA-08', 'paysage_IV-QUA-08', 'paysage_IV-PLA-02'].forEach((n, i) => fs.copyFileSync(pngs[i], path.join(sortie, `${n}.png`)));
  }
  console.log(ko ? `${ko} ÉCHEC(S)` : 'TOUT OK');
})();
