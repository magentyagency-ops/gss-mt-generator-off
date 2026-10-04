// Tour 8 (correcteur) : questions à GSS et délais (T8-CONS-15, T8-CONS-17, T8N-6, T8N-10).
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { questionExacte } from '../src/generation/questions_gss';
import { sansConsultationsDelaiHorsNormandie } from '../src/generation/base_memoires';
import { chargerMemoireType, variablesDuMarche, valeursIndicateurs, evaluerIndicateurs } from '../src/generation/memoire_type';

describe('consigne à l’infinitif après tout complément de tête (T8N-6) ; infinitif coordonné (T8-CONS-17)', () => {
  it('cinq formes', () => {
    expect(questionExacte("À la demande du service bénéficiaire et pour la date qu'il indique, rédiger et présenter un PCA de l'entreprise.")).toBe("À la demande du service bénéficiaire et pour la date qu'il indique, pouvez-vous rédiger et présenter un PCA de l'entreprise ?");
    expect(questionExacte('Sur demande du CNRS, transmettre la liste des agents.')).toBe('Sur demande du CNRS, pouvez-vous transmettre la liste des agents ?');
    expect(questionExacte('En début de marché, fournir le plan de prévention.')).toBe('En début de marché, pouvez-vous fournir le plan de prévention ?');
    expect(questionExacte('Chaque mois, transmettre le rapport d’activité.')).toBe('Chaque mois, pouvez-vous transmettre le rapport d’activité ?');
    expect(questionExacte('Au plus tard 72 heures avant la prise de service, transmettre la fiche de l’agent.')).toBe('Au plus tard 72 heures avant la prise de service, pouvez-vous transmettre la fiche de l’agent ?');
  });
  it('« Validez-vous … et préciser … ? » : deux questions', () => {
    expect(questionExacte('Validez-vous l’organisation locale proposée hors Normandie, soit 16,35 ETP, et préciser comment ces ressources permettront de tenir les délais ?'))
      .toBe('Validez-vous l’organisation locale proposée hors Normandie, soit 16,35 ETP ? Pouvez-vous préciser comment ces ressources permettront de tenir les délais ?');
  });
});

describe('consultation du modèle sur un délai hors Normandie retirée avec son annonce (T8-CONS-15)', () => {
  it('annonce « … le délai d’intervention est : » retirée', () => {
    const r = sansConsultationsDelaiHorsNormandie("GSS mobilise des renforts. Pour l'IMM, le délai d'intervention est : [CONSULTATION REQUISE : Quel délai GSS prévoit-elle pour mobiliser des renforts sur le site de l'IMM à Paris ?]\nSuite.", true);
    expect(r.texte).toBe('GSS mobilise des renforts.\nSuite.');
  });
});

describe('délai d’arrivée du rondier : jamais une levée de doute mesurée depuis le PCS (T8N-10)', () => {
  it('imm : aucune question des délais multiples', () => {
    const dce = fs.readFileSync(path.join(__dirname, '../../_corpus_verif/_dce_textes/imm.txt'), 'utf-8');
    const mt = chargerMemoireType();
    const ctx: any = { analyse: {}, cover: {}, dce };
    const v: any = variablesDuMarche(mt, ctx, valeursIndicateurs(evaluerIndicateurs(mt, ctx)));
    expect(String(v.DELAI_INTERVENTION_ALARME?.question || '')).not.toMatch(/plusieurs délais/);
  });
});

import { sansAncienJalonPlanning } from '../src/generation/reponse_libre_v2';
import { envoiPlanningsClientDce } from '../src/generation/memoire_type';
describe('jalon des plannings imposé par le CCTP : ni ancien jalon ni seconde question (T8-CONS-3, T8-CONS-4)', () => {
  const t = "Notre calendrier de planification :\n- J-10 : envoi des plannings du mois suivant ;\n- [À COMPLÉTER][CONSULTATION REQUISE : Le cahier des charges impose d'envoyer les plannings au client au moins 10 jours avant le début du mois. Quel jalon faut-il indiquer pour l'envoi des plannings au client ?] : envoi des plannings au Centre Henri Becquerel ;\n\nLes plannings du mois suivant sont envoyés aux agents à J-10, validés par les agents à J-7, puis transmis au client à J-3. [CONSULTATION REQUISE : Quel jalon GSS prévoit-elle pour transmettre au responsable sécurité du CHB les plannings mensuels au moins 10 jours avant le début du mois ?]\n\n## Nos engagements\n- GSS transmet au Responsable sécurité les plannings mensuels d’affectation au moins 10 jours avant le début du mois concerné, avec un envoi prévu à J-15.";
  const r = sansAncienJalonPlanning(t, 'Centre Henri Becquerel', 'au moins 10 jours avant le début du mois considéré');
  it('calendrier redit et J-15 retirés, question du jalon gardée seule', () => {
    expect(r.texte).not.toMatch(/J-3|J-15|Quel jalon GSS prévoit/);
    expect(r.texte).toMatch(/Le cahier des charges impose d'envoyer les plannings/);
    expect(r.texte).toMatch(/au moins 10 jours avant le début du mois concerné\.$/);
  });
  it('citation sans l’intitulé « Plannings »', () => expect(envoiPlanningsClientDce('\n\n--- CCTP ---\nPlannings\nLes plannings mensuels devront être transmis au responsable sécurité du CHB au moins 10 jours avant le début du mois considéré.\n')?.phrase).toMatch(/^Les plannings mensuels/));
});
