/**
 * Tour 4, correcteur (T4-CONS-9, T4-CONS-11) : la colonne « NOTRE RÉPONSE » du bloc 1 renvoie à la rubrique qui traite
 * l'exigence (citedia 1461) ; un renvoi plausible n'est jamais déplacé sur un seul mot commun ; le titre du schéma n'a pas de
 * point final.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { renvoisBloc1Pertinents, nettoyerBloc1, titreSansPointFinal } from '../src/generation/reponse_libre_v2';
import { preparerMemoireType } from '../src/generation/memoire_type';

const prep = preparerMemoireType({ analyse: { clientName: 'Citédia Métropole' }, dce: 'Lieu : Rennes (35000). Télésurveillance et interventions sur alarmes.' } as any);
const TEXTE = [
  '## Les points de vigilance identifiés et nos réponses',
  '',
  '- **Lot 1 : assurer la télésurveillance incendie**, technique et intrusion, la supervision et l’assistance à distance 24h/24, 365 jours par an, depuis un PC de télésurveillance, par un chef d’équipe SSIAP 2 → notre réponse : « L\'intégration d\'un nouveau marché », développée au bloc 5.',
  '- **Articuler traitement de l\'alarme, mobilisation et déplacement de l\'agent** : « Les interventions seront effectuées sur le site en alerte par l\'intervenant TLS dans un délai de 15 minutes maximum » → notre réponse : « La planification », développée au bloc 4.',
  '- **Alarme incendie** : effectuer une vérification vidéo, appeler l’AES pour connaître la levée de doute → notre réponse : « Notre socle de procédures : l\'intervention sur alarme et la télésurveillance », développée au bloc 4.',
].join('\n');

describe('renvois du bloc 1 (T4-CONS-9)', () => {
  it('rubrique citée sans rapport avec l\'exigence : la procédure d\'intervention sur alarme, avec son bloc', () => {
    const r = renvoisBloc1Pertinents(TEXTE, prep.plan);
    expect(r.corriges).toBe(2);
    expect(r.texte).not.toMatch(/« L'intégration d'un nouveau marché »|« La planification »/);
    expect(r.texte.match(/« Notre socle de procédures : l'intervention sur alarme et la télésurveillance », développée au bloc 4/g)?.length).toBe(3);
    // Même correction dans le nettoyage du bloc 1.
    expect(nettoyerBloc1(TEXTE, prep.plan, '1 an').texte).not.toMatch(/« La planification »/);
  });
  it('renvois plausibles des blocs 1 réels (fixtures) : jamais déplacés', () => {
    const dir = path.join(__dirname, 'fixtures');
    for (const f of fs.readdirSync(dir).filter((x) => /^bloc1_.*\.md$/.test(x))) {
      const t = fs.readFileSync(path.join(dir, f), 'utf-8');
      expect(renvoisBloc1Pertinents(t, prep.plan).corriges, f).toBe(0);
    }
  });
});

describe('titre du schéma (T4-CONS-11)', () => {
  it('sans point final', () => {
    expect(titreSansPointFinal('Des alarmes traitées, des prestations suivies.')).toBe('Des alarmes traitées, des prestations suivies');
    expect(titreSansPointFinal('Notre réponse à votre besoin, en un process')).toBe('Notre réponse à votre besoin, en un process');
    expect(titreSansPointFinal('Nos engagements :')).toBe('Nos engagements');
  });
});
