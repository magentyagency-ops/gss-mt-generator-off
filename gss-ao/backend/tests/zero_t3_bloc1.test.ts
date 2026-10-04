// Campagne « zéro défaut », tour 3 : bloc 1, libellés EXIGENCE et schéma de secours (T3N-5, T3-COH-7, T3-CONS-2).
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { titreExigence, libellesBloc1, specSecoursBesoin, phraseDeRubriqueGss, defautsEtapesBesoin } from '../src/generation/reponse_libre_v2';
import { pageBloc1Marine } from '../src/generation/bloc1_marine';
import { chargerMemoireType } from '../src/generation/memoire_type';

describe('libellé EXIGENCE (T3N-5, T3-COH-7)', () => {
  it('complément de tête, acteur générique, objet générique, négation, valeur gardée', () => {
    expect(titreExigence("Pendant toute absence du responsable, le remplacer par une personne disposant de compétences et moyens identiques.")).toBe('Absence du responsable');
    expect(titreExigence('Sur demande écrite de la Direction précisant les jours, réaliser une ronde supplémentaire de 19 h 30 à 07 h 20.')).toBe('Réaliser une ronde supplémentaire');
    expect(titreExigence("Réaliser une ronde d'ouverture chaque jour d'ouverture du site, pour une ouverture effective à 07 h 20.")).toBe("Réaliser une ronde d'ouverture");
    expect(titreExigence('Le titulaire transmet le planning mensuel au plus tard le 20 du mois précédent.')).toBe('Planning mensuel');
    expect(titreExigence('les agents en charge de la vigilance devront être titulaires du diplôme SSIAP 1')).toBe('Diplôme SSIAP 1');
    expect(titreExigence("se conformer aux dispositions de l'Accord du 5 mars 2002 […] quant à la reprise du personnel")).toBe('Reprise du personnel');
    expect(titreExigence('Aucun collaborateur CSTB ne doit rester sur le site après 19 h 30, sauf accord écrit.')).toBe('Aucun collaborateur après 19 h 30');
    expect(titreExigence('présent sur site dans un délai maximal de 30 minutes', 46)).toBe('Présent sur site en 30 minutes');
  });
  it('tableau du bloc 1 : jamais une case EXIGENCE vide ni le titre d’une rubrique de GSS ; renvoi au bloc complété', () => {
    const t = libellesBloc1([
      '## Vos attentes et nos engagements',
      '- **« les agents en charge de la vigilance devront être titulaires du diplôme SSIAP 1 »** : nous vérifions l’adéquation des qualifications → notre réponse : « L’adéquation de nos moyens humains avec votre besoin », développée au bloc 3.',
      '## Les points de vigilance identifiés et nos réponses',
      '- **Prise de fonctions** : le personnel doit effectuer deux périodes de travail en doublure → notre réponse : « L’intégration d’un nouvel agent ».',
      '- Aucun collaborateur CSTB ne doit rester sur le site après 19 h 30, sauf accord écrit → notre réponse : « La planification ».',
    ].join('\n'));
    const p = pageBloc1Marine(t, {}, { bandeau: false, sources: false, blocsRubriques: { 'L’intégration d’un nouvel agent': 5, 'La planification': 4 } });
    const rangs = p.split('\n').filter((l) => /^\| (?!Exigence|---)/.test(l));
    expect(rangs[0]).toMatch(/^\| Diplôme SSIAP 1 \|/);
    expect(rangs.join('\n')).not.toMatch(/^\| L’adéquation de nos moyens humains/m);
    for (const r of rangs) expect(r).not.toMatch(/^\|\s+\|/);
    expect(rangs[1]).toMatch(/« L’intégration d’un nouvel agent » <span class="gss-bloc">→ BLOC 5<\/span>/);
  });
});

describe('schéma de secours du bloc 1 : cartes « nous » (T3-CONS-2)', () => {
  it('ign 1351 : les cartes 03 et 04 portent une phrase de GSS, jamais la colonne du CCTP', () => {
    const t = fs.readFileSync(path.join(__dirname, 'fixtures', 'bloc1_ign_1351.md'), 'utf-8');
    const mt = chargerMemoireType();
    const s = specSecoursBesoin(t, (x) => phraseDeRubriqueGss(mt, x))!;
    expect(s).not.toBeNull();
    const etapes: Array<{ titre: string; texte: string; role: string }> = s.params.etapes;
    const nous = etapes.filter((e) => e.role === 'bleu');
    expect(nous.length).toBeGreaterThanOrEqual(1);
    for (const e of nous) {
      expect(e.texte).not.toMatch(/ouvre Coriolis à 6h00|accèdent à Carnot-Cassini/);
      expect(e.texte).toMatch(/\b(?:nous|notre|nos|GSS)\b/i);
    }
  });
  it('carte « nous » recopiée du DCE : refusée', () => {
    const etapes = [{ titre: 'A', texte: 'a' }, { titre: 'B', texte: 'b' }, { titre: 'La protection du travailleur isolé', texte: 'Les chercheurs accèdent à Carnot-Cassini 24h/24 et 7j/7' }, { titre: 'D', texte: 'Nous contrôlons' }, { titre: 'Votre résultat', texte: 'Continuité de service' }];
    expect(defautsEtapesBesoin(etapes, { dce: 'CCTP. Les chercheurs accèdent à Carnot-Cassini 24h/24 et 7j/7 ; des consignes…' }).join(' ')).toMatch(/étape 3 .* recopie une exigence du CCTP/);
  });
});
