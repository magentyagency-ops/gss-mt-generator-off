// Campagne « zéro défaut », tour 3 : pièces du DCE (T3-COH-5, T3-COH-6, T3G-2).
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key-not-used';
import { MemoireGenerator, alerteCadreAbsent, alerteCctpAbsent } from '../src/generation/memoire_generator';
import { estPieceAdministrative, estCahierDesCharges, estCahierDesChargesParContenu, dceCctpDAbord } from '../src/generation/base_memoires';

describe('cadre de réponse imposé fourni en PDF (T3-COH-5)', () => {
  it('cadre présent parmi les pièces : jamais « n’est pas parmi les pièces », jamais « pdf --- » cité', () => {
    const dce = "\n\n--- RC.pdf ---\nRèglement de la consultation\nArticle 5 : Le mémoire technique est obligatoirement rédigé dans le cadre de réponse technique joint au DCE.\n\n--- 05 - Cadre de réponse technique.pdf ---\nCADRE DE REPONSE TECHNIQUE\n1. Moyens humains\n\n--- CCTP.pdf ---\nCahier des clauses techniques particulières";
    expect(alerteCadreAbsent(dce)).toEqual([]);
    const sansPiece = "\n\n--- RC.pdf ---\nRèglement de la consultation\nArticle 5 : Le mémoire technique est obligatoirement rédigé dans le cadre mémoire technique joint au DCE.\n\n--- CCTP.pdf ---\nCahier des clauses techniques particulières";
    const a = alerteCadreAbsent(sansPiece);
    expect(a.length).toBe(1);
    expect(a[0]).not.toMatch(/pdf ---/);
    expect(a[0]).toMatch(/Article 5 : Le mémoire technique est obligatoirement rédigé dans le cadre mémoire technique joint au DCE\. »\) : ce document n.est pas parmi les pièces/);
  });
  it('seul un PDF « CADRE MEMOIRE TECHNIQUE » : réponse libre, alerte exacte', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gss-t3-cadre-'));
    for (const f of ['RC.pdf', '2026MA006 - CADRE MEMOIRE TECHNIQUE LOT 1.pdf', 'CCTP.pdf']) fs.writeFileSync(path.join(dir, f), 'x');
    const g: any = new MemoireGenerator();
    expect(g.findDceTemplate(dir)).toBeNull();
    expect(g.alertesFormat[0]).toBe("Le cadre de réponse imposé « 2026MA006 - CADRE MEMOIRE TECHNIQUE LOT 1.pdf » n'est fourni qu'en PDF : le mémoire a été rédigé hors de ce cadre. Pouvez-vous obtenir sa version Word, l'ajouter au dossier et relancer la génération ?");
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('RC nommé avec des soulignés (T3-COH-6)', () => {
  const RC = "Règlement de la consultation. Article 2 : le DCE comprend le présent RC, le cahier des clauses techniques particulières (CCTP) et le bordereau des prix unitaires (BPU).";
  for (const nom of ['RC_gardiennage_2026.pdf', '01_RC.pdf', 'DCE_RC_Bolbec.pdf']) {
    it(`« ${nom} » : pièce administrative, alerte « aucun cahier des charges »`, () => {
      expect(estPieceAdministrative(nom)).toBe(true);
      const dce = `\n\n--- ${nom} ---\n${RC}\n\n--- AE.pdf ---\nActe d'engagement.`;
      expect(alerteCctpAbsent(dce).join(' ')).toMatch(/cahier des charges|CCTP/);
    });
  }
});

describe('cahier des charges sous un autre nom ou reconnu par son contenu (T3G-2)', () => {
  it('noms', () => {
    for (const n of ['Description des prestations.pdf', 'Dossier technique.pdf', 'Expression des besoins.pdf', 'Cahier technique.pdf', 'Annexe technique.pdf', 'Termes de référence.pdf', 'Pièce 3 - Spécifications.pdf']) expect(estCahierDesCharges(n), n).toBe(true);
    expect(estCahierDesCharges('Dossier technique amiante.pdf')).toBe(false);
  });
  it('contenu : « DESCRIPTION DES PRESTATIONS » en tête d’une pièce au nom neutre, lue en premier par le bloc 1', () => {
    const corps = 'DESCRIPTION DES PRESTATIONS\nArticle 1 - Objet\nLe titulaire assure le gardiennage du site.';
    expect(estCahierDesChargesParContenu('Pièce 3.pdf', corps)).toBe(true);
    expect(estCahierDesChargesParContenu('RC.pdf', 'Règlement de la consultation\nArticle 1 - Objet\nLe titulaire…')).toBe(false);
    const dce = `\n\n--- RC.pdf ---\n${'x '.repeat(40000)}\n\n--- Pièce 3.pdf ---\n${corps}`;
    expect(dceCctpDAbord(dce, 60000)).toMatch(/^\n\n--- Pièce 3\.pdf ---\nDESCRIPTION DES PRESTATIONS/);
    expect(alerteCctpAbsent(dce)).toEqual([]);
  });
});

import { preparerMemoireType, chargerMemoireType } from '../src/generation/memoire_type';
describe('indicateurs jamais déclenchés par les pièces administratives (T3G-8)', () => {
  const CCTP = "\n\n--- CCTP.pdf ---\nCahier des clauses techniques particulières. Le site est un entrepôt. Le site n'est pas ouvert au public. L'agent effectue des rondes de nuit.";
  const AE = "\n\n--- AE.pdf ---\nActe d'engagement. Code banque Code guichet N° de compte Clé RIB.";
  const RC = "\n\n--- RC.pdf ---\nRèglement de la consultation. L'offre est remise sur support informatique, le BPU en version Excel. Rappel : décret n° 97-646 du 31 mai 1997 relatif à la mise en place de services d'ordre lors des manifestations sportives, récréatives ou culturelles.";
  it('« Code guichet », « version Excel », décret sur les manifestations : aucune rubrique ajoutée', () => {
    const i = (dce: string) => preparerMemoireType({ dce, analyse: {}, referents: '' } as any, { memoireType: chargerMemoireType() }).indicateurs;
    const seul = i(CCTP), tout = i(CCTP + AE + RC);
    for (const k of ['USAGERS', 'EVENEMENTIEL', 'INFORMATIQUE', 'FLUX_PUBLIC', 'ACCUEIL_PUBLIC']) expect([k, tout[k]]).toEqual([k, seul[k]]);
    expect(tout.USAGERS || tout.EVENEMENTIEL || tout.INFORMATIQUE).toBeFalsy();
  });
  it('« concertation » n’est pas un concert', () => {
    const i = preparerMemoireType({ dce: '\n\n--- CCTP.pdf ---\nCahier des clauses techniques particulières. La pause est organisée en concertation avec le chef du service sécurité.', analyse: {}, referents: '' } as any, { memoireType: chargerMemoireType() }).indicateurs;
    expect(i.EVENEMENTIEL).toBeFalsy();
  });
});
