/**
 * Tour 4, correcteur (T4-CONS-1, T4-CONS-2, T4-CONS-3) : recalage d'une réponse du cadre rédigée sous les intitulés des
 * éléments attendus (citedia2 1462, réponses réelles du modèle enregistrées). L'ordre des intitulés reste celui du cadre,
 * chaque intitulé garde son texte, un tableau de GSS n'est jamais coupé, une énumération n'est jamais retirée élément par
 * élément, une phrase dont la tête a été retirée reprend sa majuscule.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { recalerSurReference, attendusSansReponse, intituleAttendu } from '../src/generation/memoire_type_cadre';

const charger = (n: number) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', `recalage_citedia2_1462_${n}.json`), 'utf-8'));
const recaler = (d: any, o: any = {}) => recalerSurReference(d.reference, d.reponse, { ...d.options, exclure: (ph: string) => d.exclues.includes(ph), ...o });
const lignes = (t: string) => t.split('\n').map((l) => l.trim()).filter(Boolean);
const titresDans = (t: string, attendus: string[]) => lignes(t).filter((l) => intituleAttendu(l, attendus) >= 0);

describe('recalage du cadre par éléments attendus (T4-CONS-1)', () => {
  it('sous-critère 1 : intitulés dans l\'ordre de la réponse, chacun suivi de son texte', () => {
    const d = charger(3);
    const r = recaler(d);
    const att = d.options.attendus;
    expect(titresDans(r.texte, att)).toEqual(titresDans(d.reponse, att));
    expect(attendusSansReponse(r.texte, att)).toEqual([]);
    const l = lignes(r.texte);
    // « Dispositions favorisant la stabilité des équipes… » : suivi du texte de GSS sur la stabilité, jamais de l'intitulé suivant.
    const k = l.findIndex((x) => /^Dispositions favorisant la stabilit/.test(x));
    expect(l[k + 1]).toBe('La stabilité des équipes :');
    expect(l[k + 2]).toMatch(/^Nous privilégions la stabilité sur les sites fixes/);
    // Chaque intitulé est suivi d'un texte (jamais de l'intitulé suivant).
    for (const t of titresDans(r.texte, att)) expect(intituleAttendu(l[l.indexOf(t) + 1], att)).toBe(-1);
  });
  it('tableau de GSS jamais coupé : en-tête suivi de ses lignes, amorce gardée, aucun reste de pseudo-tableau', () => {
    const r = recaler(charger(3));
    const l = lignes(r.texte);
    const k = l.indexOf('Catégorie de personnel : Qualification : Nombre');
    expect(k).toBeGreaterThan(0);
    expect(l[k - 1]).toBe("Derrière l'équipe dédiée, GSS mobilise l'ensemble de ses ressources :");
    expect(l[k + 1]).toBe('Agents SSIAP 1 : SSIAP 1 : 185');
    expect(l[k + 11]).toBe('Responsables RSE : Master RH : 2');
    const r1 = recalerSurReference(charger(3).reference, charger(3).reponse.replace(/Catégorie de personnel : Qualification : Nombre : Observations\nAgent de sécurité : CQP APS ou CAP Agent de Sécurité – SSIAP1 : 3 : 84 h par semaine, soit 2,46 ETP/, 'Catégorie de personnel : Agent de sécurité\nQualification : CQP APS ou CAP Agent de Sécurité – SSIAP1\nNombre : 3 titulaires\nObservations : 84 h par semaine, soit 2,46 ETP'), { ...charger(3).options });
    expect(r1.texte).not.toMatch(/^Nombre : 3 titulaires$/m);
    expect(r1.texte).toContain('Agent de sécurité : CQP APS ou CAP Agent de Sécurité – SSIAP1 : 3 : 84 h par semaine, soit 2,46 ETP');
  });
  it('sous-critère 5 : « Outils de contrôle… » garde le texte de controlmaster, « Modalités d\'alerte » reste à sa place avec son texte', () => {
    const d = charger(9);
    const r = recaler(d);
    const att = d.options.attendus;
    expect(titresDans(r.texte, att)).toEqual(titresDans(d.reponse, att));
    expect(attendusSansReponse(r.texte, att)).toEqual([]);
    const l = lignes(r.texte);
    const outils = l.indexOf('Outils de contrôle de la bonne réalisation des prestations');
    expect(l[outils + 1]).toMatch(/^Le logiciel controlmaster nous permet de contrôler nos agents/);
    const alerte = l.findIndex((x) => /^Alerte en cas d.anomalie/.test(x));
    expect(alerte).toBeLessThan(outils);
    expect(intituleAttendu(l[alerte + 1], att)).toBe(-1);
    const acces = l.findIndex((x) => /^Accès de Citédia Métropole aux éléments de traçabilité/.test(x));
    expect(intituleAttendu(l[acces + 1], att)).toBe(-1);
  });
  it('phrase de GSS qui renvoie à la précédente (« Dans les deux cas… ») : remise avec sa procédure, une seule fois', () => {
    const r = recaler(charger(5));
    expect(r.texte.match(/Dans les deux cas, l'agent rédige un rapport d'incident/g)?.length).toBe(1);
    expect(r.texte).toMatch(/S'il refuse,[^\n]*\n\nDans les deux cas/);
    expect(r.texte).toContain('Notre socle de procédures : la gestion d\'un élément perturbateur');
  });
});

describe('énumération et majuscule après un retrait (T4-CONS-2, T4-CONS-3)', () => {
  it('énumération de la réponse retirée en entier pour tenir la limite, jamais « problèmes techniques ; » seul', () => {
    const d = charger(5);
    // Sans les éléments attendus (recalage global) et avec une limite serrée : des ajouts sont retirés.
    const r = recalerSurReference(d.reference, d.reponse, { limite: true, maxMots: 200, exclure: (ph: string) => d.exclues.includes(ph) });
    expect(r.ajoutsRetires).toBeGreaterThan(0);
    expect(r.texte).not.toMatch(/^\s*(?:sûreté et intrusion|problèmes techniques|toute autre thématique)/m);
    expect(r.texte).not.toMatch(/sécurité incendie ;\s*$/m);
  });
  it('phrase dont la proposition de tête est retirée : majuscule et liaison retirée', () => {
    const d = charger(7);
    const r = recalerSurReference(d.reference, d.reponse, { limite: true, maxMots: d.options.maxMots });
    expect(r.texte).not.toMatch(/[.!?] (?:; )?(?:et |mais )?le contrôle global/);
    expect(r.texte).not.toMatch(/[.!?] [a-zà-ÿ]/);
  });
  it('ligne de paragraphe dont la suite après « ; » a été retirée : finit par un point', () => {
    const ref = 'Les agents enregistrent leurs prises et fins de service sur la tablette dédiée au site.';
    const reponse = "Les agents enregistrent leurs prises et fins de service sur la tablette dédiée au site ; l'agent relit ensuite sa consigne du jour avec beaucoup d'attention et d'application.";
    const r = recalerSurReference(ref, reponse, { limite: true, maxMots: 15 });
    expect(r.texte).not.toMatch(/;\s*$/m);
  });
});
