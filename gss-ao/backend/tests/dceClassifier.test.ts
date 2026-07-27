import { describe, it, expect } from 'vitest';
import { classifyDceFile, pickBestPieces } from '../src/ingestion/dceClassifier';

const t = (n: string) => classifyDceFile(n).type;

describe('classifyDceFile — noms réels des DCE (dossiers « DCEDCE Neoma » / « MP2026_08 »)', () => {
  it('identifie le RC', () => {
    expect(t('2-RC 2026-08.doc')).toBe('rc');
    expect(t('2-RC 2026-08.docx')).toBe('rc');
    expect(t('Reglement de la consultation.pdf')).toBe('rc');
    expect(t('Règlement de Consultation.docx')).toBe('rc');
    expect(t('reglementdeconsultation.pdf')).toBe('rc');
    expect(t('RC.pdf')).toBe('rc');
  });

  it('identifie le CCTP', () => {
    expect(t('4-CCTP 2026-08.docx')).toBe('cctp');
    expect(t('CCTP SECURITE GARDIENNAGE.pdf')).toBe('cctp');
    expect(t('Cahier des clauses techniques particulieres.pdf')).toBe('cctp');
    expect(t('Cahierdesclausestechniquesparticulieres.pdf')).toBe('cctp');
    expect(t('CCP - prestations de securite.pdf')).toBe('cctp');
  });

  it('identifie le CCAP même mots collés', () => {
    expect(t('3-CCAP 2026-08.docx')).toBe('ccap');
    expect(t('Cahierdesclausesadministrativesparticulieres.pdf')).toBe('ccap');
    expect(t('Cahier des Clauses Administratives Particulières.pdf')).toBe('ccap');
  });

  it('identifie le BPU / DPGF, l’acte d’engagement et le compte rendu', () => {
    expect(t('6-DPGF et BPU - lot 1 - sites 76.docx')).toBe('bpu_dpgf');
    expect(t('BPU - DQE Sécurité.xlsx')).toBe('bpu_dpgf');
    expect(t('Bordereau des prix unitaires.xlsx')).toBe('bpu_dpgf');
    expect(t("1-Acte d'Engagement.doc")).toBe('acte_engagement');
    expect(t('Acted_engagement.pdf')).toBe('acte_engagement');
    expect(t('DC1 candidature.pdf')).toBe('acte_engagement');
    expect(t('Compte rendu de visite - Sacha.docx')).toBe('compte_rendu');
    expect(t('CR visite site Rouen.docx')).toBe('compte_rendu');
  });

  it('préserve les sous-dossiers du chemin relatif', () => {
    expect(t('DCE/AWS-MPI-1815580-PC/CCTP SECURITE GARDIENNAGE.pdf')).toBe('cctp');
    // Nom de fichier muet → le dossier parent tranche.
    expect(t('DCE/CCTP/document final v3.pdf')).toBe('cctp');
    expect(classifyDceFile('DCE/CCTP/document final v3.pdf').score).toBeLessThan(
      classifyDceFile('CCTP SECURITE GARDIENNAGE.pdf').score,
    );
  });

  it('écarte les faux positifs de l’ancien includes()', () => {
    // « technique » : notre propre mémoire de réponse
    expect(t('5-Mémoire Technique - lots 1-2-3_GSS.docx')).toBe('memoire');
    expect(t('5-Mémoire Technique - NEOMA (Reims-Rouen-Paris).docx')).toBe('memoire');
    // « cctp » dans une annexe : pièce jointe, pas le CCTP
    expect(t('Annexe 1 CCTP - Effectifs et horaires des postes de sécurité v2026.docx')).toBe('annexe');
    expect(t('Annexe 7 CCTP - FORMULAIRE_RESERV_PRESTA_SECU_2026.doc')).toBe('annexe');
    expect(t("Annexe 6 CCAP - Plans de l'Université de Rouen Normandie v2026.docx")).toBe('annexe');
    // « rc » au milieu d’un mot
    expect(t('Marché public de sécurité.docx')).toBe('autre');
    expect(t('Parc de matériel.pdf')).toBe('autre');
    expect(t('Sourcing fournisseurs.xlsx')).toBe('autre');
  });

  it('classe le CCTP explicite au-dessus d’un candidat vague', () => {
    const vague = classifyDceFile('Cahier technique.pdf');
    const franc = classifyDceFile('4-CCTP 2026-08.docx');
    expect(vague.type).toBe('cctp');
    expect(franc.score).toBeGreaterThan(vague.score);
  });

  it('pickBestPieces retient le meilleur candidat par type', () => {
    const noms = [
      'DCE/Cahier technique.pdf',
      'DCE/AWS-MPI-1815580-PC/CCTP SECURITE GARDIENNAGE.pdf',
      'DCE/2-RC 2026-08.doc',
      'DCE/Annexe 1 CCTP - Effectifs.docx',
    ];
    const best = pickBestPieces(noms, (n) => n);
    expect(best.cctp?.item).toBe('DCE/AWS-MPI-1815580-PC/CCTP SECURITE GARDIENNAGE.pdf');
    expect(best.rc?.item).toBe('DCE/2-RC 2026-08.doc');
    expect(best.annexe?.item).toBe('DCE/Annexe 1 CCTP - Effectifs.docx');
  });
});
