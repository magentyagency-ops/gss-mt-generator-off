import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import PizZip from 'pizzip';
import OpenAI from 'openai';

// Aucun appel OpenAI : le plan de l'assistant est simulé au niveau du SDK.
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key-not-used';

import { ecrireEtat, lireEtat, type EtatCompletion } from '../src/generation/completion';
import { discuter } from '../src/generation/assistant_memoire';
import type { PhraseAdaptee } from '../src/generation/adaptations_cctp';

/**
 * D8, cadre imposé : la phrase adaptée au CCTP est validée, modifiée ou rétablie par l'assistant dans la réponse du
 * cadre (docx), sans réécrire le reste de la réponse ni toucher à sa mise en forme.
 */
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const ADAPTEE = "Nos agents consignent chaque événement sur la main courante fournie par GSS et mise à disposition dans l’accueil.";
const ORIGINE = "Nos agents consignent chaque événement sur la tablette équipée de la main courante électronique Trackforce.";
const RETIREE = "Si l'agent ne répond pas, le rondier d'astreinte se rend sur place en 45 minutes au maximum.";
const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body>`
  + '<w:p><w:r><w:t>2.1 Moyens de communication et de traçabilité</w:t></w:r></w:p>'
  + '<w:p><w:bookmarkStart w:id="11" w:name="GSS_CH_7"/>'
  + '<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">La traçabilité. </w:t></w:r>'
  + `<w:r><w:t xml:space="preserve">${ADAPTEE.replace(/'/g, '&apos;')}</w:t><w:br/><w:t xml:space="preserve">Chaque ronde est tracée par des pointeaux.</w:t></w:r>`
  + '<w:bookmarkEnd w:id="11"/></w:p></w:body></w:document>';

const id = `test-d8-cadre-${process.pid}`;
let dossier = '';
let plan: any = null;
const cp: any = Object.getPrototypeOf(new OpenAI({ apiKey: 'x' }).chat.completions);
const createOrigine = cp.create;
const texteDocx = (f: string) => new PizZip(fs.readFileSync(f)).file('word/document.xml')!.asText();
const adaptations = (): PhraseAdaptee[] => [
  { n: 1, rubrique: 'GSS_CH_7', titre: 'Moyens de communication et de traçabilité', origine: ORIGINE, adaptee: ADAPTEE, exigence: 'Dans ce local, l’agent de surveillance présent dispose d’une main courante, fournie par le titulaire.', etape: 'Cohérence avec le CCTP', statut: 'a_valider' },
  { n: 2, rubrique: 'GSS_CH_7', titre: 'Moyens de communication et de traçabilité', origine: RETIREE, adaptee: '', avant: 'Chaque ronde est tracée par des pointeaux.', exigence: 'Marché hors Normandie (site de Neuilly-sur-Marne).', etape: 'Délais hors Normandie et interdits du CCTP', statut: 'a_valider' },
];

beforeAll(() => {
  cp.create = async () => ({ choices: [{ message: { content: JSON.stringify(plan) } }], usage: {} });
  dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'd8-cadre-'));
});
afterAll(() => {
  cp.create = createOrigine;
  fs.rmSync(dossier, { recursive: true, force: true });
  fs.rmSync(path.resolve(__dirname, '../response/etats', `${id}.json`), { force: true });
});

function etatInitial(): EtatCompletion {
  const fichier = path.join(dossier, 'memoire.docx');
  const zip = new PizZip();
  zip.file('word/document.xml', document);
  fs.writeFileSync(fichier, zip.generate({ type: 'nodebuffer' }));
  const etat: EtatCompletion = { dossierId: id, mode: 'cadre', fichier, majLe: '', elements: [], reponsesTraitees: [], champs: [{ cle: 'GSS_CH_7', libelle: 'Moyens de communication et de traçabilité' }], adaptations: adaptations() };
  ecrireEtat(etat);
  return etat;
}

describe('D8, cadre imposé : choix de GSS sur une phrase adaptée, par l\'assistant', () => {
  it('valider : aucun document réécrit ; la phrase n\'est plus à valider', async () => {
    const e0 = etatInitial();
    plan = { reponse: 'C\'est noté.', actions: [{ type: 'adaptation', n: 1, choix: 'valider' }] };
    const r = await discuter(id, 'Je valide la phrase adaptée n° 1');
    expect(r.modifies).toEqual([]);
    expect(r.etat.fichier).toBe(e0.fichier);
    expect(lireEtat(id)!.adaptations![0].statut).toBe('validee');
    expect(r.reponse).toContain('Phrase adaptée n° 1 validée');
    expect(r.reponse).toContain('Il reste une phrase adaptée au cahier des charges à valider (n° 2).');
  });

  it('modifier puis rétablir : seule la phrase change, mise en forme et reste de la réponse gardés', async () => {
    etatInitial();
    const texteGss = 'Nos agents consignent chaque événement dans la main courante papier fournie par GSS, relevée chaque semaine.';
    plan = { reponse: 'Phrase remplacée.', actions: [{ type: 'adaptation', n: 1, choix: 'modifier', texte: texteGss }] };
    let r = await discuter(id, `Pour la phrase adaptée n° 1, écris : ${texteGss}`);
    expect(r.modifies).toEqual(['GSS_CH_7']);
    let xml = texteDocx(r.etat.fichier);
    expect(xml).toContain('relevée chaque semaine');
    expect(xml).not.toContain('mise à disposition dans l’accueil');
    expect(xml).toContain('<w:b/></w:rPr><w:t xml:space="preserve">La traçabilité. </w:t>');
    expect(xml).toContain('Chaque ronde est tracée par des pointeaux.');
    expect(xml).toContain('w:name="GSS_CH_7"');
    expect(lireEtat(id)!.adaptations![0]).toMatchObject({ statut: 'modifiee', texteGss });
    // GSS change d'avis : il rétablit sa phrase d'origine.
    plan = { reponse: 'Phrase d\'origine rétablie.', actions: [{ type: 'adaptation', n: 1, choix: 'retablir' }, { type: 'adaptation', n: 2, choix: 'retablir' }] };
    r = await discuter(id, 'Rétablis mes phrases d\'origine n° 1 et n° 2');
    xml = texteDocx(r.etat.fichier);
    expect(xml).toContain('tablette équipée de la main courante électronique Trackforce');
    expect(xml).not.toContain('relevée chaque semaine');
    // Phrase retirée (délai normand) remise à sa place, après sa voisine.
    expect(xml).toMatch(/Chaque ronde est tracée par des pointeaux\. Si l&apos;agent ne répond pas|Chaque ronde est tracée par des pointeaux\. Si l'agent ne répond pas/);
    expect(lireEtat(id)!.adaptations!.map((a) => a.statut)).toEqual(['retablie', 'retablie']);
    expect(r.reponse).toContain('Toutes les phrases adaptées au cahier des charges ont reçu votre choix.');
  });

  it('modifier sans texte : rien n\'est changé, l\'assistant demande la phrase', async () => {
    etatInitial();
    plan = { reponse: 'D\'accord.', actions: [{ type: 'adaptation', n: 1, choix: 'modifier' }] };
    const r = await discuter(id, 'Je veux modifier la phrase adaptée n° 1');
    expect(r.modifies).toEqual([]);
    expect(r.reponse).toContain('donnez-moi la phrase à écrire');
    expect(lireEtat(id)!.adaptations![0].statut).toBe('a_valider');
  });
});
