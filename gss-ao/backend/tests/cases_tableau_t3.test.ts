// T3N-1 : cases du tableau CNAPS du cadre havre2 (état réel v-havre2-335) : une donnée par case, la question en clair
// rejoint ses cases, aucun groupe ne réunit deux questions différentes.
import { describe, it, expect } from 'vitest';
import { preciserQuestionsCadre } from '../src/generation/completion';

const generique = 'contenu de rubrique non precise';
const etat = () => [
  { cle: 'GSS_AC_1', question: "Périodes neutralisées (fermeture de l'entreprise) : GSS a-t-elle des périodes de fermeture à déclarer pour ce marché ? Si GSS assure la prestation sans interruption, la réponse est « Aucune ».", contexte: '[À COMPLÉTER]', statut: 'ouvert', groupe: 'periodes neutralisees pour fermeture de l entreprise' },
  { cle: 'GSS_AC_2', question: 'Tableau du cadre, ligne « Autorisation dirigeant », colonne « Date de délivrance de l’autorisation d’exercer — Date d’obtention » : quelle valeur faut-il écrire ?', contexte: '[À COMPLÉTER]', statut: 'ouvert', groupe: generique },
  { cle: 'GSS_AC_3', question: 'Tableau du cadre, ligne « Autorisation dirigeant », colonne « Date de délivrance de l’autorisation d’exercer — Date de fin de validité » : quelle valeur faut-il écrire ?', contexte: '[À COMPLÉTER]', statut: 'ouvert', groupe: generique },
  { cle: 'GSS_AC_4', question: 'Tableau du cadre, ligne « Autorisation entreprise », colonne « Date de délivrance de l’autorisation d’exercer — Date de fin de validité » : quelle valeur faut-il écrire ?', contexte: '[À COMPLÉTER]', statut: 'ouvert', groupe: generique },
  { cle: 'GSS_AC_5', question: 'Quelle est la date de fin de validité de l’autorisation d’exercer de GLOBAL SECURITY SERVICES délivrée par le CNAPS ?', contexte: 'Date de fin de validité : [À COMPLÉTER].', statut: 'ouvert', groupe: 'date de fin de validite de l autorisation cnaps de l entreprise' },
  { cle: 'GSS_AC_6', question: 'Quelles sont les dates de délivrance et de fin de validité de l’agrément CNAPS du dirigeant Adil Marchani ?', contexte: 'Date de délivrance et date de fin de validité : [À COMPLÉTER].', statut: 'ouvert', groupe: 'dates de delivrance et de fin de validite de l agrement cnaps du dirigeant' },
  { cle: 'GSS_AC_7', question: 'Pour chaque agent autorisé à intervenir, quels sont ses nom et prénom, sa date de formation, son numéro individuel d’agrément et la date de validité de cet agrément ?', contexte: 'Les noms… : [À COMPLÉTER].', statut: 'ouvert', groupe: 'informations individuelles d agrement et de formation des agents' },
] as any[];
const signets = (els: any[]) => els.map((e, i) => ({ cle: e.cle, champ: i < 4 ? 5 : 20 + i, contexte: e.contexte, environnement: e.contexte }));

describe('cases du tableau CNAPS (T3N-1)', () => {
  const els = etat();
  preciserQuestionsCadre(els, signets(etat()));
  const g = (c: string) => els.find((e) => e.cle === c)!;
  it('la question en clair du dirigeant réunit ses deux cases ; celle de l’entreprise, sa case de fin de validité', () => {
    expect(g('GSS_AC_2').groupe).toBe(g('GSS_AC_6').groupe);
    expect(g('GSS_AC_3').groupe).toBe(g('GSS_AC_6').groupe);
    expect(g('GSS_AC_2').question).toBe(g('GSS_AC_6').question);
    expect(g('GSS_AC_4').groupe).toBe(g('GSS_AC_5').groupe);
    expect(g('GSS_AC_4').groupe).not.toBe(g('GSS_AC_6').groupe);
  });
  it('chaque case dit la donnée qu’elle attend', () => {
    expect(g('GSS_AC_2').contexte).toBe('Autorisation dirigeant — Date d’obtention : [À COMPLÉTER]');
    expect(g('GSS_AC_3').contexte).toBe('Autorisation dirigeant — Date de fin de validité : [À COMPLÉTER]');
  });
  it('aucun groupe ne réunit deux questions différentes ; plus de groupe générique', () => {
    const parGroupe = new Map<string, Set<string>>();
    for (const e of els) (parGroupe.get(e.groupe) ?? parGroupe.set(e.groupe, new Set()).get(e.groupe)!).add(e.question);
    for (const [, q] of parGroupe) expect(q.size).toBe(1);
    expect(els.some((e) => e.groupe === generique)).toBe(false);
    expect(new Set(els.map((e) => e.groupe)).size).toBe(4);
  });
  it('cases sans question en clair : une donnée par case (ligne et colonne)', () => {
    const seuls = etat().filter((e) => ['GSS_AC_2', 'GSS_AC_3', 'GSS_AC_4'].includes(e.cle));
    preciserQuestionsCadre(seuls, signets(seuls));
    expect(new Set(seuls.map((e) => e.groupe)).size).toBe(3);
  });
});
