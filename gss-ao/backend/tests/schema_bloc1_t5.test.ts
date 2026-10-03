// Tour 5 : schéma de process du bloc 1 et texte de la compréhension (T5N-8, T5CP-9, T5CP-12, T5N-9).
import { describe, it, expect } from 'vitest';
import { specProcessBesoin, anomaliesSchemaBloc1, etapesDesPuces, titreDeRubriqueSeul, retirerParagrapheEtapes } from '../src/generation/reponse_libre_v2';
import { coupeApresComprehension } from '../src/generation/format_court';

describe('étape qui redit son titre (T5N-8, becquerel 591)', () => {
  const debut = [
    { titre: 'Deux postes', texte: 'Le PC sécurité et l’accueil sont au rez-de-chaussée de la rue d’Amiens.' },
    { titre: 'Renfort sous 2 heures', texte: 'Des renforts sont mobilisables dans un délai de 2 heures maximum.' },
    { titre: 'Plannings transmis', texte: 'Transmission au moins 10 jours avant le début du mois considéré.' },
  ];
  it('« La continuité des deux postes : … » sous « Continuité des deux postes » : seule la suite reste', () => {
    const s = specProcessBesoin([...debut, { titre: 'Continuité des deux postes', texte: 'La continuité des deux postes : remplacement immédiat d’un agent absent.' }], 'flux')!;
    expect(s.params.etapes[3].texte).toBe('Remplacement immédiat d’un agent absent.');
    expect(anomaliesSchemaBloc1(s)).toEqual([]);
  });
  it('redite avec article, dernière étape comprise : signalée', () => {
    const s = specProcessBesoin([...debut, { titre: 'Continuité des deux postes', texte: 'La continuité des deux postes est assurée sans interruption.' }], 'flux')!;
    expect(anomaliesSchemaBloc1(s)).toContain('étape 4 « Continuité des deux postes » : le texte redit le titre');
  });
});

describe('schéma de secours (T5CP-12, T5N-9)', () => {
  it('le besoin d’abord, le pilotage en dernier ; jamais un titre de rubrique comme texte d’étape', () => {
    expect(titreDeRubriqueSeul("L'agent SSIAP 1")).toBe(true);
    expect(titreDeRubriqueSeul('Nous vérifions les recyclages SSIAP 1')).toBe(false);
    expect(titreDeRubriqueSeul('Formations et certifications : l’agent SSIAP 1 (le feu, la sécurité incendie, les moyens de secours)')).toBe(true);
    expect(titreDeRubriqueSeul('Les réunions de suivi et la remontée des indicateurs')).toBe(true);
    const t = "## Vos attentes et nos engagements\n- **Ce que vous attendez** : poste permanent de sécurité incendie 24 h/24 → notre réponse : une équipe dédiée tient le poste en continu avec une équipe suppléante formée.\n\n## Les points de vigilance identifiés et nos réponses\n- **Point de vigilance** : réunion de suivi trimestrielle avec le responsable sécurité → notre réponse : nous préparons chaque réunion avec les indicateurs de la main courante.\n- **Point de vigilance** : reprise du personnel en place selon l'accord du 5 mars 2002 → notre réponse : « La reprise du personnel en place ».\n- **Point de vigilance** : agents titulaires du SSIAP 1 à jour → notre réponse : nous vérifions les recyclages SSIAP 1 de chaque agent avant son affectation.";
    const e = etapesDesPuces(t);
    expect(e[0].titre).toMatch(/^Poste permanent/);
    expect(e[e.length - 1].titre).toMatch(/^Réunion de suivi/);
    expect(e.some((x) => /reprise du personnel/i.test(String(x.texte)))).toBe(false);
  });
});

describe('texte de la compréhension (T5CP-9) et placement du schéma en format court (T5CP-12)', () => {
  const etapes = [
    { texte: 'Le CCTP prévoit 3 rondes de nuit entre 21h30 et 06h30.' }, { texte: 'Les agents réalisent les rondes à pied et tracent les anomalies.' },
    { texte: 'La main courante enregistre les faits marquants des rondes et interventions.' }, { texte: 'Le CSTB dispose de rondes exécutées, d’anomalies signalées et d’interventions tracées.' },
  ];
  const texte = "## Les points de vigilance identifiés et nos réponses\n- **Continuité des rondes** : les fréquences varient → nous organisons les remplacements.\n\nLe CCTP prévoit 3 rondes de nuit entre 21h30 et 06h30. Les agents réalisent les rondes à pied et tracent les anomalies. La main courante enregistre les faits marquants des rondes et interventions. Le CSTB dispose de rondes exécutées, d’anomalies signalées et d’interventions tracées.";
  it('paragraphe des textes d’étapes non retenues retiré ; gardé quand le schéma dessiné les reprend', () => {
    const r = retirerParagrapheEtapes(texte, etapes, []);
    expect(r.texte).toBe("## Les points de vigilance identifiés et nos réponses\n- **Continuité des rondes** : les fréquences varient → nous organisons les remplacements.");
    expect(retirerParagrapheEtapes(texte, etapes, etapes).texte).toBe(texte);
    expect(retirerParagrapheEtapes(`${texte}\n\nUne phrase propre à GSS.`, etapes, []).retire).toBe('');
  });
  it('format court : schéma juste après l’explication de la compréhension, avant les autres rubriques', () => {
    const p = "## Notre compréhension de votre besoin\n\n## Vos attentes et nos engagements\n- a\n\n## Les points de vigilance identifiés et nos réponses\n- b\n\n## La cohérence du prix\nTexte.";
    const c = coupeApresComprehension(p);
    expect(c.avant).toMatch(/- b\s*$/);
    expect(c.apres).toBe('## La cohérence du prix\nTexte.');
    expect(coupeApresComprehension('## Autre\nTexte.').apres).toBe('');
  });
});
