// T3-COH-4 : grille « Éléments de candidature » du cadre de vitry laissée en pointillés, sans question à GSS.
import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';
import { describe, it, expect } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { completerGrilleCandidature, CHAMP_GRILLE_CANDIDATURE, elements } from '../src/generation/completion';
import { questionDonneeGss } from '../src/generation/base_memoires';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const p = (t: string) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
const xml = `<w:document xmlns:w="${W}"><w:body><w:tbl><w:tr>
<w:tc>${p('Effectifs moyens annuels et part de l’encadrement')}${p('2025 : ….. dont ….. cadres')}${p('2024 : ….. dont ….. cadres')}</w:tc>
<w:tc>${p('Références professionnelles publiques ou privées')}${p('2025 – Dénomination sociale (public ou privé) ')}${p('– n° de téléphone du contact dans cet établissement ')}${p('- Montant annuel HT ')}</w:tc>
<w:tc>${p('Chiffre d\'affaires HT au cours des trois derniers exercices')}${p('2025 : ….. €')}</w:tc>
</w:tr></w:tbl>${p('Hors tableau : 2025 : ….. €')}</w:body></w:document>`;
const texte = (doc: any) => elements(doc, 'p').map((x: any) => elements(x, 't').map((t: any) => t.textContent).join('')).join('\n');

describe('grille de candidature (T3-COH-4)', () => {
  it('chaque donnée en pointillés reçoit un emplacement et une question exacte à GSS', () => {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const qs = completerGrilleCandidature(doc);
    const t = texte(doc);
    const n = (i: number) => `[À COMPLÉTER]${CHAMP_GRILLE_CANDIDATURE + i}`;
    expect(t).toContain(`2025 : ${n(0)} dont ${n(1)} cadres`);
    expect(t).toContain(`2025 – Dénomination sociale (public ou privé) : ${n(4)}`);
    expect(t).toContain(`– n° de téléphone du contact dans cet établissement : ${n(5)}`);
    expect(t).toContain(`- Montant annuel HT : ${n(6)}`);
    expect(t).toContain(`2025 : ${n(7)} €`);
    expect(t).toContain('Hors tableau : 2025 : ….. €');
    expect(qs).toEqual([
      "Éléments de candidature : quel était l'effectif moyen annuel de GSS en 2025 ?",
      "Éléments de candidature : combien de cadres GSS comptait-elle en 2025 (part de l'encadrement) ?",
      "Éléments de candidature : quel était l'effectif moyen annuel de GSS en 2024 ?",
      "Éléments de candidature : combien de cadres GSS comptait-elle en 2024 (part de l'encadrement) ?",
      'Éléments de candidature, référence 2025 : quel établissement client (dénomination sociale, public ou privé) faut-il citer ?',
      'Éléments de candidature, référence 2025 : quel est le numéro de téléphone du contact dans cet établissement ?',
      'Éléments de candidature, référence 2025 : quel est le montant annuel HT de cette prestation ?',
      "Éléments de candidature : quel a été le chiffre d'affaires HT de GSS pour l'exercice 2025 ?",
    ]);
  });
  it('cadre réel de vitry (s’il est présent) : plus aucun « ….. » dans la grille', () => {
    const f = path.resolve(__dirname, '../../_corpus_verif/_resultats/v-vitry-351.docx');
    if (!fs.existsSync(f)) return;
    const doc = new DOMParser().parseFromString(new PizZip(fs.readFileSync(f)).file('word/document.xml')!.asText(), 'text/xml');
    const qs = completerGrilleCandidature(doc);
    expect(qs.length).toBe(18);
    const t = texte(doc);
    expect(t).not.toMatch(/20\d\d : (?:…|\.){2,}/);
  });
  it('donnée de GSS jamais « à demander à l’acheteur »', () => {
    expect(questionDonneeGss('À demander à l’acheteur : quelle était la dénomination sociale de l’établissement client concerné en 2023 ?'))
      .toBe('Quelle était la dénomination sociale de l’établissement client concerné en 2023 ?');
    expect(questionDonneeGss("À demander à l'acheteur : quel est le chiffre d'affaires HT de GSS en 2024 ?")).toBe("Quel est le chiffre d'affaires HT de GSS en 2024 ?");
    const acheteur = "À demander à l'acheteur : les caméras du site sont-elles reliées au PC sécurité ?";
    expect(questionDonneeGss(acheteur)).toBe(acheteur);
  });
});

describe('calendrier de GSS jamais « à demander à l’acheteur » (ifsem 361)', () => {
  it('préfixe retiré', () => {
    expect(questionDonneeGss('À demander à l’acheteur : quelles échéances faut-il retenir pour l’envoi du planning nominatif prévisionnel au service prescripteur — exigé au moins 10 jours ouvrés avant le début du mois —, sa validation par les agents et son envoi à l’acheteur, compte tenu du calendrier GSS proposé (J-10, J-7 et J-3) ?'))
      .toMatch(/^Quelles échéances faut-il retenir/);
  });
});
