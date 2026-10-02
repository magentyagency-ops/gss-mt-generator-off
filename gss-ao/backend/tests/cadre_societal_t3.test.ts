// T3N-7 : champ « Mesures et initiatives sociétales » (havre1, havre2) dont la « question » n'est qu'une consigne de forme.
import { describe, it, expect } from 'vitest';
import { questionUtileChamp, candidatsReference } from '../src/generation/memoire_type_cadre';
import { chargerMemoireType, preparerMemoireType, publierMemoire, rechercherRubriques } from '../src/generation/memoire_type';

const renvoi = 'Le renvoi vers un rapport général de la responsabilité sociétale de l’entreprise (du groupe) est à proscrire, sauf à cibler spécifiquement les chapitres / paragraphes de celui-ci. Les réponses doivent être rédigée en Français.';
const ctx = `Section: "MESURES ET INITIATIVES SOCIETALES MISES EN PLACE DANS LE CADRE DE LA PRESTATION" | Question: "${renvoi}" | Contexte: "Cela peut concerner les personnes éloignées de l’emploi ou les jeunes en situation de décrochage scolaire, la lutte contre les discriminations, la sélection et l’audit de ses fournisseurs sur leur responsabilité sociétale, etc. / ${renvoi}"`;

describe('question utile d’un champ du cadre (T3N-7)', () => {
  it('consigne de forme seule : titre du champ et paragraphe voisin, sans la consigne', () => {
    const q = questionUtileChamp(ctx);
    expect(q).toMatch(/^MESURES ET INITIATIVES SOCIETALES MISES EN PLACE DANS LE CADRE DE LA PRESTATION Cela peut concerner les personnes éloignées de l’emploi/);
    expect(q).not.toMatch(/renvoi|proscrire|paragraphes de celui-ci|rédigée en Français/);
  });
  it('question ordinaire : inchangée (question, puis critère)', () => {
    expect(questionUtileChamp('Section: "2" | Question: "2.1 L’organisation mise en place pour le contrôle" | Critère: "Valeur technique"')).toBe('2.1 L’organisation mise en place pour le contrôle Valeur technique');
    expect(questionUtileChamp('Section: "2" | Question: "" | Contexte: "a / Décrivez vos rondes"')).toBe('Décrivez vos rondes');
  });
  it('le texte de GSS sur la non-discrimination et le recrutement (France Travail, Mission locale) est trouvé', () => {
    const mt = chargerMemoireType();
    const ids = rechercherRubriques(mt, questionUtileChamp(ctx), 2).map((x) => x.id);
    expect(ids).toEqual(['b3_valeurs_sociales', 'b3_recrutement']);
    const textes: Record<string, string> = {};
    for (const p of publierMemoire(preparerMemoireType({ analyse: {}, dce: '' } as any, { memoireType: mt }))) if (p.texte && p.mode !== 'besoin') textes[p.id] = p.texte;
    expect(candidatsReference(mt, textes, questionUtileChamp(ctx)).map((c) => c.id)).toContain('b3_valeurs_sociales');
  });
});
