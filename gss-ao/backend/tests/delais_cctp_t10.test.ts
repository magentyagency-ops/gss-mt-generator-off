// T10-COH-1 : délais du CCTP écrits sans chiffre (« d'une heure », « dans l'heure », « d'une demi-heure », « n'excédant
// pas 1 heure », « inférieur à 30 minutes ») lus partout ; T10C-2 : plusieurs délais imposés pour un même sujet (citedia)
// cités à GSS, jamais « le DCE n'en impose aucun ».
import { describe, it, expect } from 'vitest';
import { delaiDuDce, delaisDuDce, chargerMemoireType, preparerMemoireType } from '../src/generation/memoire_type';
import { delaisHorsNormandie, obligationsChiffrees } from '../src/generation/base_memoires';
import { exigenceDuFiltre, adaptationsDesValeursImposees } from '../src/generation/adaptations_cctp';
import { aCorpus, DCE } from './fixtures/corpus';

const REMPLACEMENT = (fin: string) => `--- CCTP.docx ---\nEn cas d'absence d'un agent, le titulaire assure son remplacement ${fin}.`;
const GSS_ASTREINTE = "si le responsable de site n'a pas reçu de prise de service 10 minutes avant le début de la prestation, il appelle l'agent et mobilise automatiquement l'agent d'astreinte, qui est sur site en 60 minutes maximum ;";

describe('délais écrits sans chiffre (T10-COH-1)', () => {
  const cas: Array<[string, string]> = [
    ["dans un délai maximal d'une heure", '1 heure'],
    ["dans un délai d'une heure", '1 heure'],
    ["dans l'heure", '1 heure'],
    ["dans un délai d'une demi-heure", '30 minutes'],
    ['au plus tard une heure après le constat', '1 heure'],
    ["dans un délai n'excédant pas 1 heure", '1 heure'],
    ['dans un délai inférieur à 30 minutes', '30 minutes'],
    ['dans un délai de deux heures', '2 heures'],
  ];
  for (const [fin, attendu] of cas) {
    it(`« ${fin} » → ${attendu}`, () => {
      expect(delaiDuDce(REMPLACEMENT(fin), 'remplacement')).toBe(attendu);
    });
  }
  for (const fin of ["dans un délai maximal d'une heure", 'dans un délai de 1 heure', 'dans un délai de 1 h', "dans l'heure", 'dans un délai de 60 minutes']) {
    it(`hors Normandie, « 60 minutes » de GSS gardé quand le CCTP écrit « ${fin} »`, () => {
      const r = delaisHorsNormandie(GSS_ASTREINTE, REMPLACEMENT(fin), true);
      expect(r.retires).toEqual([]);
      expect(r.texte).toBe(GSS_ASTREINTE);
    });
  }
  it('obligations chiffrées : « d’une heure » repéré, repris par « 1 heure » ou « 60 minutes »', () => {
    const o = obligationsChiffrees(`\n\n${REMPLACEMENT("dans un délai maximal d'une heure")}`);
    expect(o.length).toBe(1);
    expect(o[0].cle.test('sur site en 1 heure maximum')).toBe(true);
    expect(o[0].cle.test('sur site en 60 minutes maximum')).toBe(true);
    expect(o[0].cle.test('sur site en 45 minutes maximum')).toBe(false);
  });
  it('Normandie : « d’une demi-heure » remplace les 45 minutes de GSS, et la phrase adaptée est signalée (D8)', () => {
    const dce = "--- CCTP.docx ---\nLe site est situé 12 rue Jeanne d'Arc, 76000 Rouen. En cas d'alarme transmise par la télésurveillance, l'intervenant arrive sur site dans un délai d'une demi-heure.";
    const mt = chargerMemoireType();
    const p = preparerMemoireType({ dce, analyse: {} } as any, { memoireType: mt });
    expect(p.variables.DELAI_INTERVENTION_ALARME.valeur).toBe('30 minutes');
    const ad = adaptationsDesValeursImposees(mt, { dce, analyse: {} } as any, ['b4_proc_alarme']);
    expect(ad.length).toBe(1);
    expect(ad[0].apres).toMatch(/en 30 minutes au maximum/);
    expect(ad[0].exigence).toMatch(/d'une demi-heure/);
  });
});

const ALARMES = `--- CCTP.docx ---
Le site est situé 3 rue de Paris, 35000 Rennes.
A réception d'une alarme au frontal du PC, le chef d'équipe SSIAP 2 doit appliquer les consignes sur le site concerné sous un délai de 3 minutes maximum.
Les interventions seront effectuées sur le site en alerte par l'intervenant dans un délai de 15 minutes maximum à compter de la réception de l'alarme au PC de télésurveillance.
Les interventions sur alarme intrusion sont à effectuer dans un délai de 30 minutes maximum à compter de la réception de l'alarme au PC de télésurveillance.`;

describe('plusieurs délais du CCTP pour un même sujet (T10C-2)', () => {
  it('le délai de traitement au PC n’est pas un délai d’arrivée ; 15 et 30 minutes lus', () => {
    expect(delaisDuDce(ALARMES, 'alarme').map((d) => d.valeur)).toEqual(['15 minutes', '30 minutes']);
    expect(delaiDuDce(ALARMES, 'alarme')).toBe('');
  });
  it('hors Normandie : aucune question « Marché hors Normandie », la question cite les phrases du CCTP', () => {
    const p = preparerMemoireType({ dce: ALARMES, analyse: {} } as any, { memoireType: chargerMemoireType() });
    const v = p.variables.DELAI_INTERVENTION_ALARME;
    expect(v.valeur).toBeNull();
    expect(v.question).toMatch(/^Le CCTP impose plusieurs délais pour ce point .*15 minutes.*30 minutes/);
    expect(v.question).not.toMatch(/hors Normandie/);
  });
  it('le délai retiré est signalé avec les phrases du CCTP, jamais « le DCE n’en impose aucun »', () => {
    const o = 'Le rondier arrive sur site en 45 minutes au maximum après l’appel de la télésurveillance.';
    const ex = exigenceDuFiltre({ origine: o, adaptee: 'Le rondier arrive sur site après l’appel de la télésurveillance.' } as any, ALARMES, true, {});
    expect(ex).toMatch(/15 minutes maximum/);
    expect(ex).not.toMatch(/n'en impose aucun/);
    const ad = adaptationsDesValeursImposees(chargerMemoireType(), { dce: ALARMES, analyse: {} } as any, ['b4_proc_alarme']);
    expect(ad.length).toBe(1);
    expect(ad[0].avant).toMatch(/en 45 minutes au maximum/);
    expect(ad[0].apres).not.toMatch(/minutes/);
    expect(ad[0].exigence).toMatch(/15 minutes maximum.*30 minutes maximum/);
  });
});

describe.skipIf(!aCorpus('citedia'))('citedia (T10C-2)', () => {
  it('alarme : 15 et 30 minutes, jamais les 3 minutes du PC', () => {
    expect([...new Set(delaisDuDce(DCE('citedia'), 'alarme').map((d) => d.valeur))]).toEqual(['15 minutes', '30 minutes']);
  });
});
