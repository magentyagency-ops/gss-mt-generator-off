/**
 * Entrées de référence des harnais de thèmes (themes_identite.ts, themes_rendu.ts) : mémoire type publiposté sur le
 * DCE Becquerel (analyse simulée, aucun appel OpenAI), réparti en chapitres de l'ancienne mise en page (I à IV) et en
 * blocs du mémoire type (1 à 5), réponses de cadre et parties de format court.
 * Usage : npx ts-node --transpile-only -P tsconfig.json _verif/themes_fixtures_gen.ts
 */
import fs from 'fs';
import path from 'path';
import { chargerMemoireType, preparerMemoireType, publierMemoire, type ContexteMarche } from '../src/generation/memoire_type';
import { MarpGenerator } from '../src/generation/marp_generator';

const RACINE = path.resolve(__dirname, '../..');
const ANALYSES = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../tests/fixtures/memoire_type_analyses.json'), 'utf-8')).analyses;
const referents = fs.readFileSync(path.resolve(__dirname, '../Template/Documentation GSS/Personnes'), 'utf-8');
const dce = fs.readFileSync(path.join(RACINE, '_corpus_verif/_dce_textes/becquerel.txt'), 'utf-8');
const mt = chargerMemoireType();
const ctx: ContexteMarche = { analyse: ANALYSES.becquerel, dce, referents };
const prep = preparerMemoireType(ctx, { memoireType: mt });
const rubriques = publierMemoire(prep).filter((r) => r.texte && r.texte.trim());
const par = (bloc: string) => prep.plan.blocs.find((b) => b.cle === bloc || (b as any).id === bloc);
const texte = (id: string) => rubriques.find((r) => r.id === id);

// Ancienne mise en page (I à IV) : quelques rubriques du mémoire type sous des identifiants b_* de la réponse libre.
const choix: Array<[string, string, string]> = [
  ['I', 'b_presentation', 'b2_catalogue'], ['I', 'b_encadrement', 'b2_organigramme'], ['I', 'b_engagement_rse', 'b2_ecologie_mobilite_numerique'],
  ['II', 'b_recrutement_formation', 'b3_formations_internes'], ['II', 'b_dispositif_absence', 'b5_remplacement_imprevu'],
  ['III', 'b_rondes', 'b4_rondes'], ['III', 'b_moyens_materiels', 'b4_communication'],
  ['IV', 'b_suivi_qualite', 'b5_controle_fond'], ['IV', 'b_organisation', 'b5_mise_en_place'],
];
const TITRES: Record<string, string> = { I: 'Présentation de la société et conformité', II: 'Moyens humains', III: 'Moyens opérationnels et matériels', IV: 'Organisation, qualité et continuité' };
const chapters = ['I', 'II', 'III', 'IV'].map((ch) => ({
  key: ch, title: TITRES[ch],
  sections: choix.filter(([c]) => c === ch).map(([, id, ref]) => {
    const r = texte(ref);
    if (!r) throw new Error(`Rubrique absente du mémoire publiposté : ${ref}`);
    return { id, title: r.titre, text: r.texte! };
  }),
}));
const pages = MarpGenerator.enumerateContentSlides(chapters as any).map((sl) => {
  const [ci, si] = sl.key.split('_').map(Number);
  return { key: sl.key, sectionId: (chapters as any)[ci].sections[si].id, sectionTitle: sl.title, text: sl.text };
});
const cover = { client: ANALYSES.becquerel.clientName, title: ANALYSES.becquerel.projectTitle, ref: ANALYSES.becquerel.marketRef, objet: ANALYSES.becquerel.projectTitle };
const ronde = texte('b4_rondes') || rubriques[0];
const reponses_cadre = [
  { cle: 'GSS_CH_1', question: 'Décrivez les rondes de surveillance, le contrôleur de rondes et les pointeaux', texte: ronde.texte!.slice(0, 1500) },
  { cle: 'GSS_CH_2', question: "Composition des équipes et organisation hiérarchique de l'encadrement", texte: 'Organisation hiérarchique de GSS pour le marché.' },
];
const parties_court = ['b2_catalogue', 'b4_rondes', 'b5_controle_fond'].map((id) => {
  const r = texte(id) || rubriques[0];
  return { titre: r.titre, texte: r.texte!.slice(0, 2600) };
});
// Mémoire type par blocs (nouvelle mise en page : 1 à 2 pages de texte, puis 1 page de schéma).
const blocs = prep.plan.blocs.map((b: any) => ({
  cle: b.cle, titre: b.titre,
  rubriques: (b.rubriques as string[]).map((id) => rubriques.find((r) => r.id === id)).filter(Boolean)
    .map((r: any) => ({ id: r.id, titre: r.titre, texte: r.texte, schema: r.schema })),
}));

const sortie = path.join(__dirname, 'themes_fixtures.json');
fs.writeFileSync(sortie, JSON.stringify({ description: 'Entrées de référence des harnais de thèmes (générées par themes_fixtures_gen.ts, DCE Becquerel, aucun appel OpenAI).', referents, cover, chapters, pages, reponses_cadre, parties_court, blocs }, null, 1));
console.log(`${sortie} : ${chapters.reduce((n, c) => n + c.sections.length, 0)} rubriques (ancienne mise en page), ${pages.length} pages, ${blocs.length} blocs (${blocs.map((b: any) => b.rubriques.length).join(' + ')} rubriques)`);
void par;
