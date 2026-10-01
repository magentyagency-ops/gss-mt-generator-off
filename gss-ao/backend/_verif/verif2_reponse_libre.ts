/**
 * HARNAIS HORS LIGNE — RÉPONSE LIBRE v2 (mémoire type en 5 blocs), AUCUN APPEL OPENAI :
 *  1. génération complète (generate → generateFullMarpPdf → réponse libre v2) sur un DCE du corpus, appels au modèle
 *     interceptés au niveau du SDK (réponses simulées réalistes : _verif/reponse_libre_v2_simulation.ts), rendu réel
 *     (Marp + Chromium, moteur de schémas Python) ;
 *  2. contrôles : sommaire en 5 blocs dans l'ordre du mémoire type ; pour chaque rubrique 1 à 2 pages de texte puis
 *     exactement 1 page de schéma (dessin ≥ 70 % de la hauteur utile de la page) ; aucun débordement ; aucune variable {{…}}, aucune
 *     mention « Non communiqué », aucun marqueur interne, aucun autre acheteur du corpus ; rubriques fixes intactes ;
 *     propositions signalées (état, consultations, premier message de l'assistant) ;
 *  3. pages en PNG (pdftoppm) et planche-contact ;
 *  4. (becquerel) assistant : valider, modifier, supprimer une proposition, ajouter une rubrique au bloc V, saisie
 *     d'un « [À COMPLÉTER] » ; recomposition d'un état v1 (rendu v1 inchangé).
 * Usage : npx ts-node --transpile-only -P tsconfig.json _verif/reponse_libre_v2.ts <becquerel|caen> <dossier de sortie> [--assistant] [--v1]
 */
import fs from 'fs';
import path from 'path';
import { execSync, spawnSync } from 'child_process';
import OpenAI from 'openai';
import { DB } from '../src/core/db';
import * as tempStorage from '../src/core/temp_storage';
import { MemoireGenerator } from '../src/generation/memoire_generator';
import { MarpGenerator } from '../src/generation/marp_generator';
import { feuilleMarp, imagesTheme, themeActif } from '../src/generation/themes';
import { lireEtat, ecrireEtat, recomposerPdf, remplirSaisie, EtatCompletion } from '../src/generation/completion';
import { discuter } from '../src/generation/assistant_memoire';
import * as memoireType from '../src/generation/memoire_type';
import { repondre, embedding, journal, inconnus, assistant, Corpus } from './verif2_simulation';

const corpus = process.argv[2] as Corpus;
const SORTIE = path.resolve(process.argv[3] || path.join(__dirname, `sorties_reponse_libre_v2_${corpus}`));
const AVEC_ASSISTANT = process.argv.includes('--assistant');
const AVEC_V1 = process.argv.includes('--v1');
if (!['becquerel', 'caen', 'ign'].includes(corpus)) { console.error('Corpus : becquerel ou caen'); process.exit(2); }
const id = `rlv2-${corpus}`;
const ROOT = path.resolve(__dirname, '../..');
const B = path.resolve(__dirname, '..');
const dceDir = path.join(ROOT, 'data/output', `dce_${id}`);
const MARP_DIR = path.join(B, 'src/generation/marp');
fs.rmSync(SORTIE, { recursive: true, force: true });
fs.mkdirSync(SORTIE, { recursive: true });
fs.rmSync(dceDir, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, '_corpus_verif', corpus), dceDir, { recursive: true });

// ── Chrome sans synchronisation d'affichage : écran du Mac en veille, requestAnimationFrame ne se déclenche plus et
//    Marp CLI attend indéfiniment (constaté le 01/10/2026) ; le lanceur ajoute les options qui le libèrent. ──
if (!process.env.CHROME_PATH) {
  const lanceur = path.join(SORTIE, 'chrome.sh');
  fs.writeFileSync(lanceur, `#!/bin/sh\nexec "${require('puppeteer').executablePath()}" --disable-gpu-vsync --disable-frame-rate-limit --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows "$@"\n`);
  fs.chmodSync(lanceur, 0o755);
  process.env.CHROME_PATH = lanceur;
}

// ── Neutralisations (comme _verif/gen.ts) : aucune écriture en base, aucun Storage ──
(DB as any).saveDossier = async () => null;
(DB as any).getDossier = async () => ({ id, dce_files: [] });
(tempStorage as any).uploadTempDocx = async () => null;
(MemoireGenerator.prototype as any).materializeDceFromStorage = async () => null;

// ── Interception du SDK OpenAI (après le chargement de modeles_ia.ts, qui pose son repli Flex sur le même prototype) ──
const cli: any = new OpenAI({ apiKey: 'hors-ligne' });
const CP = Object.getPrototypeOf(cli.chat.completions);
const EP = Object.getPrototypeOf(cli.embeddings);
const appels: Array<{ model: string; effort?: string; temperature?: number }> = [];
CP.create = async function (body: any) {
  appels.push({ model: body.model, effort: body.reasoning_effort, temperature: body.temperature });
  return { choices: [{ message: { content: repondre(corpus, body) } }], usage: {}, model: body.model };
};
EP.create = async function (body: any) {
  const inp: string[] = Array.isArray(body.input) ? body.input : [body.input];
  return { data: inp.map((t, i) => ({ index: i, embedding: embedding(String(t)) })) };
};

// ── Capture du Markdown Marp de chaque rendu ──
const markdowns: string[] = [];
const P: any = MarpGenerator.prototype;
const construire = P.buildMarkdown;
P.buildMarkdown = function (...args: any[]) { const md = construire.apply(this, args); markdowns.push(md); return md; };

// ── Capture des textes publipostés (contrôle des rubriques fixes) ──
const publies: Record<string, string> = {};
const mt: any = memoireType;
const publierOrigine = mt.publierMemoire;
mt.publierMemoire = (...args: any[]) => { const r = publierOrigine(...args); for (const p of r) if (p.texte) publies[p.id] = p.texte; return r; };

const ACHETEURS: Record<string, RegExp> = {
  imm: /Montsouris|Nouvel IMM/, etampes1: /[ÉE]tampes/, cstb: /CSTB/, becquerel: /Becquerel/, s2e: /Seine-Eure|S2E/, fontainebleau: /Fontainebleau/,
  caen: /ACOSS|URSSAF/, ign: /\bIGN\b|ENPC/, ifsem: /IFSeM/, ifits: /IFITS|Théodore Simon/, citedia: /Citédia|Citedia/, havre1: /Havre/, vitry: /Vitry/,
  ca_normandie: /[Cc]our d.appel|BOP Normand/, parc_expo: /Parc des Expositions/,
};

interface Diapo { index: number; classe: string; entete: string; contenu: string }
function diapos(md: string): Diapo[] {
  const corps = md.split(/\n---\n/).slice(1);
  let entete = '';
  return corps.map((c, i) => {
    const h = /<!-- header: "([^"]*)" -->/.exec(c);
    if (h) entete = h[1];
    const hl = /<!-- _header: "([^"]*)" -->/.exec(c);
    const classe = (/<!-- _class: (\w+) -->/.exec(c) || [])[1] || 'texte';
    return { index: i + 1, classe, entete: hl ? hl[1] : entete, contenu: c };
  });
}

/** Rendu HTML par Marp (même feuille que le PDF) et mesures dans Chromium : débordements, hauteur des schémas. */
async function mesurer(md: string, theme: string): Promise<any> {
  const travail = path.join(SORTIE, 'html');
  fs.rmSync(travail, { recursive: true, force: true });
  fs.mkdirSync(travail, { recursive: true });
  fs.writeFileSync(path.join(travail, 'gss-theme.css'), feuilleMarp(theme, fs.readFileSync(path.join(MARP_DIR, 'gss-theme.css'), 'utf-8')));
  for (const f of [path.join(MARP_DIR, 'logogss.png'), ...imagesTheme(theme)]) fs.copyFileSync(f, path.join(travail, path.basename(f)));
  fs.symlinkSync(path.join(MARP_DIR, 'media'), path.join(travail, 'media'));
  fs.writeFileSync(path.join(travail, 'm.md'), md);
  execSync(`"${path.join(B, 'node_modules/.bin/marp')}" m.md --theme gss-theme.css --html --allow-local-files -o m.html --no-stdin`, { cwd: travail, stdio: 'pipe' });
  const puppeteer = require('puppeteer');
  const nav = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  try {
    const page = await nav.newPage();
    await page.setViewport({ width: 1100, height: 1500 });
    await page.goto(`file://${path.join(travail, 'm.html')}`, { waitUntil: 'load' });
    await page.evaluate('document.fonts.ready');
    return await page.evaluate(() => {
      const sections = Array.from(document.querySelectorAll('section')) as HTMLElement[];
      const res: any = { pages: sections.length, schemas: [] as any[], debordements: [] as any[], remplissages: [] as number[] };
      sections.forEach((s, i) => {
        const r = s.getBoundingClientRect();
        const svg = s.querySelector('.schema-page svg') as SVGSVGElement | null;
        const cs = getComputedStyle(s);
        if (svg && s.classList.contains('schema')) {
          // Hauteur du DESSIN (union des éléments, hors fond de toile), et non de la boîte <svg> (marges blanches
          // comprises), rapportée à la hauteur utile : sous le titre, au-dessus du pied de page.
          const b = svg.getBoundingClientRect();
          const vb = svg.viewBox.baseVal;
          let y0 = Infinity, y1 = -Infinity;
          svg.querySelectorAll(':scope > *:not(defs)').forEach((e) => {
            if (e.tagName === 'rect' && +(e.getAttribute('width') || 0) >= vb.width && +(e.getAttribute('height') || 0) >= vb.height) return;
            const eb = e.getBoundingClientRect();
            if (!eb.width && !eb.height) return;
            y0 = Math.min(y0, eb.top); y1 = Math.max(y1, eb.bottom);
          });
          const k = r.height / s.offsetHeight;
          const h2 = s.querySelector('h2');
          const haut = h2 ? h2.getBoundingClientRect().bottom : r.top + parseFloat(cs.paddingTop) * k;
          const basU = r.bottom - parseFloat(cs.paddingBottom) * k;
          res.schemas.push({ page: i + 1, hauteur: +((y1 - y0) / (basU - haut)).toFixed(3), boite_svg: +(b.height / r.height).toFixed(3), dans_page: b.bottom <= r.bottom + 0.5 });
        }
        const bas = r.bottom - parseFloat(cs.paddingBottom) * (r.height / s.offsetHeight) + 2;
        let max = 0;
        s.querySelectorAll(':scope > *:not(header):not(footer)').forEach((e) => { max = Math.max(max, (e as HTMLElement).getBoundingClientRect().bottom); });
        if (max > bas) res.debordements.push({ page: i + 1, classe: s.className, depassement_px: +(max - bas).toFixed(1) });
        if (!/schema|intercalaire|lead/.test(s.className)) {
          const haut = r.top + parseFloat(cs.paddingTop) * (r.height / s.offsetHeight);
          res.remplissages.push(+((max - haut) / (bas - 2 - haut)).toFixed(2));
        }
      });
      return res;
    });
  } finally {
    await nav.close();
  }
}

function textePages(pdf: string): string[] {
  return (spawnSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf-8', maxBuffer: 256 << 20 }).stdout || '').split('\f');
}

function png(pdf: string, nom: string, dpi = 45): string {
  const d = path.join(SORTIE, nom);
  fs.mkdirSync(d, { recursive: true });
  execSync(`pdftoppm -r ${dpi} -png "${pdf}" "${d}/p"`);
  return d;
}

/** Contrôles de structure d'un rendu v2 (Markdown capturé) : blocs, rubriques, texte puis schéma. */
function structure(md: string, etat: EtatCompletion): any {
  const d = diapos(md);
  const plan = etat.libre!.plan!;
  const res: any = { diapos: d.length, blocs: [], rubriques: [], anomalies: [] as string[] };
  // Sommaire : les 5 blocs, dans l'ordre du plan.
  const sommaire = d.filter((x) => /## SOMMAIRE/.test(x.contenu)).map((x) => x.contenu).join('\n');
  const blocsSommaire = [...sommaire.matchAll(/^(\d+)\. __(.+?)__$/gm)].map((m) => `${m[1]}. ${m[2]}`);
  res.sommaire_blocs = [...new Set(blocsSommaire)];
  const attendu = plan.blocs.map((b, i) => `${i + 1}. ${b.titre.toUpperCase()}`);
  if (JSON.stringify(res.sommaire_blocs) !== JSON.stringify(attendu)) res.anomalies.push(`sommaire : ${JSON.stringify(res.sommaire_blocs)} ≠ ${JSON.stringify(attendu)}`);
  // Ouvertures de bloc, dans l'ordre.
  res.ouvertures = d.filter((x) => x.classe === 'intercalaire').map((x) => (/^# (.+)$/m.exec(x.contenu) || [])[1]);
  // Rubriques : suite de diapos de même en-tête (texte…, puis schéma).
  const ordre = new Map<string, number>();
  let courant: { entete: string; textes: number; schemas: number; debut: number } | null = null;
  const fin = () => { if (courant) res.rubriques.push(courant); courant = null; };
  for (const x of d) {
    if (x.classe === 'lead' || x.classe === 'intercalaire' || /## SOMMAIRE/.test(x.contenu)) { fin(); continue; }
    if (!courant || courant.entete !== x.entete) { fin(); courant = { entete: x.entete, textes: 0, schemas: 0, debut: x.index }; }
    if (x.classe === 'schema') courant.schemas++;
    else {
      if (courant.schemas) res.anomalies.push(`page de texte après la page de schéma : ${x.entete} (diapo ${x.index})`);
      courant.textes++;
    }
    ordre.set(x.entete, (ordre.get(x.entete) || 0) + 1);
  }
  fin();
  for (const r of res.rubriques) {
    if (r.textes < 1 || r.textes > 2) res.anomalies.push(`${r.entete} : ${r.textes} page(s) de texte`);
    if (r.schemas > 1) res.anomalies.push(`${r.entete} : ${r.schemas} pages de schéma`);
  }
  res.sans_schema = res.rubriques.filter((r: any) => !r.schemas).map((r: any) => r.entete);
  return res;
}

function controlesTexte(pdfTexte: string, etat: EtatCompletion): any {
  const out: any = {};
  out.variables = (pdfTexte.match(/\{\{|\}\}/g) || []).length;
  out.non_communique = (pdfTexte.match(/[Nn]on communiqu|[Nn]on précisé|undefined|\bnull\b|NaN/g) || []).length;
  out.marqueurs = (pdfTexte.match(/CONSULTATION REQUISE|⟦|⟧|\[CHAMP_/g) || []).length;
  out.a_completer = (pdfTexte.match(/\[À COMPLÉTER\]/g) || []).length;
  out.autres_acheteurs = Object.entries(ACHETEURS).filter(([c, rx]) => c !== corpus && ACHETEURS[corpus]?.source !== rx.source && rx.test(pdfTexte)).map(([c]) => c);
  out.client_cite = ACHETEURS[corpus].test(pdfTexte);
  out.covid = /[Cc]ovid|pass sanitaire|gestes barrières/.test(pdfTexte);
  // Article L. 1224-1 : seulement s'il est cité par le DCE (règle GSS).
  const dceCorpus = fs.readFileSync(path.join(ROOT, '_corpus_verif/_dce_textes', `${corpus}.txt`), 'utf-8');
  out.l1224_hors_dce = /L\.?\s?1224/.test(pdfTexte) && !/L\.?\s?1224/.test(dceCorpus);
  // Rubriques fixes : texte publiposté repris (fidélité au texte de référence).
  const plan = etat.libre!.plan!;
  const fixes = plan.rubriques.filter((r) => r.mode === 'fixe' && publies[r.id]);
  const nettoie = (t: string) => t.replace(/⟦AC:\d+⟧|\[CONSULTATION REQUISE[^\]]*\]/g, '');
  const fid = fixes.map((r) => ({ id: r.id, fidelite: +memoireType.fidelite(nettoie(publies[r.id]), nettoie(etat.libre!.sections[r.id] || '')).toFixed(3) }));
  out.fixes = { n: fid.length, sous_1: fid.filter((x) => x.fidelite < 1) };
  const adaptes = plan.rubriques.filter((r) => r.mode === 'adapte' && publies[r.id]);
  out.adaptes = adaptes.map((r) => ({ id: r.id, fidelite: +memoireType.fidelite(nettoie(publies[r.id]), nettoie(etat.libre!.sections[r.id] || '')).toFixed(3) }));
  return out;
}

async function main() {
  const t0 = Date.now();
  const bilan: any = { corpus, sortie: SORTIE, theme: themeActif() };
  const r: any = await new MemoireGenerator().generate(id, (p, m) => { if (p % 10 === 0 || /⚠/.test(m)) console.log(`  [${p} %] ${m.slice(0, 160)}`); });
  bilan.duree_s = Math.round((Date.now() - t0) / 1000);
  const etat = lireEtat(id)!;
  fs.copyFileSync(r.filePath, path.join(SORTIE, 'memoire.pdf'));
  fs.writeFileSync(path.join(SORTIE, 'etat.json'), JSON.stringify(etat, null, 1));
  fs.writeFileSync(path.join(SORTIE, 'memoire.md'), markdowns[markdowns.length - 1]);
  const pages = textePages(r.filePath);
  bilan.pages_pdf = pages.length - 1;
  bilan.version = etat.libre?.version;
  bilan.plan = etat.libre!.plan!.blocs.map((b) => `${b.cle}. ${b.titre} (${b.rubriques.length})`);
  bilan.structure = structure(markdowns[markdowns.length - 1], etat);
  bilan.textes = controlesTexte(pages.join('\n'), etat);
  bilan.mesures = await mesurer(markdowns[markdowns.length - 1], etat.libre!.theme!);
  bilan.mesures.sous_70 = bilan.mesures.schemas.filter((s: any) => s.hauteur < 0.7);
  bilan.mesures.hauteur_min = Math.min(...bilan.mesures.schemas.map((s: any) => s.hauteur));
  bilan.mesures.remplissage_texte = { max: Math.max(...bilan.mesures.remplissages), moyen: +(bilan.mesures.remplissages.reduce((a: number, x: number) => a + x, 0) / bilan.mesures.remplissages.length).toFixed(2) };
  delete bilan.mesures.remplissages;
  bilan.structure.rubriques_2_pages = bilan.structure.rubriques.filter((r: any) => r.textes === 2).map((r: any) => r.entete);
  bilan.consultations = r.consultations;
  bilan.elements = etat.elements.map((e) => ({ cle: e.cle, question: e.question.slice(0, 160), reperes: e.reperes, contexte: e.contexte.slice(0, 140) }));
  bilan.propositions = (etat.libre!.ajouts || []).map((a) => ({ id: a.id, titre: a.title, chapitre: a.chapter, apres: a.apres, proposition: a.proposition }));
  bilan.premier_message = etat.conversation?.[0]?.texte;
  bilan.appels_modele = Object.entries(journal.reduce((acc: any, x) => { acc[x.type] = (acc[x.type] || 0) + 1; return acc; }, {}));
  bilan.modeles = [...new Set(appels.map((a) => `${a.model}/${a.effort}${a.temperature !== undefined ? `/t=${a.temperature}` : ''}`))];
  bilan.signatures_inconnues = inconnus;
  bilan.png = png(r.filePath, 'png');

  if (AVEC_ASSISTANT) bilan.assistant = await scenariosAssistant(etat);
  if (AVEC_V1) bilan.v1 = await recompositionV1();

  fs.writeFileSync(path.join(SORTIE, 'bilan.json'), JSON.stringify(bilan, null, 1));
  console.log(JSON.stringify({ ...bilan, elements: `${bilan.elements.length} élément(s)` }, null, 1));
  fs.rmSync(dceDir, { recursive: true, force: true });
  process.exit(0);
}

/** Assistant de modification sur l'état v2 : valider, modifier, ajouter (bloc V), supprimer, saisie d'un [À COMPLÉTER]. */
async function scenariosAssistant(etat0: EtatCompletion): Promise<any> {
  const out: any = {};
  const props = (etat0.libre!.ajouts || []).filter((a) => a.proposition);
  if (props.length < 2) return { erreur: 'moins de deux propositions' };
  const pagesAvant = textePages(etat0.fichier).length - 1;
  // 1. Valider la première proposition : aucune recomposition, proposition = false.
  assistant.plan = { reponse: 'Proposition validée.', actions: [{ type: 'valider', id: props[0].id }] };
  let r = await discuter(id, `Je valide la proposition sur ${props[0].title}`);
  out.valider = { reponse: r.reponse, modifies: r.modifies, proposition: r.etat.libre!.ajouts!.find((a) => a.id === props[0].id)?.proposition, fichier_inchange: r.etat.fichier === etat0.fichier };
  // 2. Modifier la deuxième : texte réécrit, schéma reconstruit, reste à valider.
  assistant.plan = { reponse: 'Proposition complétée.', actions: [{ type: 'modifier', id: props[1].id, consigne: 'Ajoute que le responsable de site vérifie chaque mois.' }] };
  assistant.texteModifie = (t) => `${t.trim()}\n\nNotre responsable de site vérifie chaque mois la bonne application de cette organisation.`;
  r = await discuter(id, `Dans la proposition sur ${props[1].title}, ajoute que le responsable de site vérifie chaque mois.`);
  const e2 = lireEtat(id)!;
  out.modifier = { reponse: r.reponse, modifies: r.modifies, page: r.page, proposition: e2.libre!.ajouts!.find((a) => a.id === props[1].id)?.proposition, texte_ok: /vérifie chaque mois la bonne application/.test(e2.libre!.sections[props[1].id]), schema: !!e2.libre!.schemas[`${props[1].id}#schema`] };
  // 3. Ajouter une rubrique au bloc V : chapitre V, repère en place pour son [À COMPLÉTER].
  const blocV = e2.libre!.plan!.blocs[4];
  assistant.plan = { reponse: 'Rubrique ajoutée.', actions: [{ type: 'ajouter', chapitre: blocV.cle, titre: 'Nos engagements environnementaux sur le site', apres: blocV.rubriques[blocV.rubriques.length - 1], consigne: 'Une page sur nos engagements environnementaux.' }] };
  r = await discuter(id, 'Ajoute une page sur nos engagements environnementaux sur le site, à la fin du bloc 5.');
  const e3 = lireEtat(id)!;
  const ajout = e3.libre!.ajouts!.find((a) => a.title === 'Nos engagements environnementaux sur le site');
  out.ajouter = { reponse: r.reponse, modifies: r.modifies, chapitre: ajout?.chapter, page: r.page, repere_en_place: /\[À COMPLÉTER\]⟦AC:\d+⟧/.test(e3.libre!.sections[ajout?.id || ''] || ''), nouvel_element: e3.elements.some((e) => /bilan carbone|\[À COMPLÉTER\]/.test(e.contexte) && e.reperes?.length) };
  // 4. Supprimer la troisième proposition s'il y en a une, sinon la deuxième.
  const cible = props[2] || props[1];
  assistant.plan = { reponse: 'Proposition supprimée.', actions: [{ type: 'supprimer', id: cible.id }] };
  r = await discuter(id, `Supprime la proposition sur ${cible.title}`);
  const e4 = lireEtat(id)!;
  out.supprimer = { reponse: r.reponse, modifies: r.modifies, retire: !e4.libre!.ajouts!.some((a) => a.id === cible.id), pdf_sans_titre: !textePages(e4.fichier).join('\n').includes(cible.title) };
  // 5. Saisie directe d'un « [À COMPLÉTER] » publiposté (effectif titulaire) : la valeur remplace l'emplacement.
  const el = e4.elements.find((e) => /titulaires/.test(e.question) && e.statut === 'ouvert');
  if (el) {
    const e5 = await remplirSaisie(id, el.cle, '8');
    const sec = Object.values(e5.libre!.sections).find((t) => /équipe de 8 agents titulaires/.test(t));
    out.saisie = { cle: el.cle, remplace: !!sec, statut: e5.elements.find((e) => e.cle === el.cle)?.statut, pdf: /équipe de 8 agents titulaires/.test(textePages(e5.fichier).join('\n')) };
  }
  const efin = lireEtat(id)!;
  out.pages_avant = pagesAvant;
  out.pages_apres = textePages(efin.fichier).length - 1;
  out.structure_finale = structure(markdowns[markdowns.length - 1], efin).anomalies;
  fs.copyFileSync(efin.fichier, path.join(SORTIE, 'memoire_apres_assistant.pdf'));
  fs.writeFileSync(path.join(SORTIE, 'etat_apres_assistant.json'), JSON.stringify(efin, null, 1));
  out.conversation = (efin.conversation || []).map((m) => `${m.role} : ${m.texte.slice(0, 200)}`);
  return out;
}

/** État v1 (réponse libre d'avant la refonte, sans plan ni thème) : la recomposition garde le rendu v1. */
async function recompositionV1(): Promise<any> {
  const ref = JSON.parse(fs.readFileSync(path.join(ROOT, '_corpus_verif/_resultats', `v-${corpus}-11.json`), 'utf-8'));
  const idv1 = `${id}-v1`;
  const etat: EtatCompletion = {
    dossierId: idv1, mode: 'libre', fichier: '', majLe: '', reponsesTraitees: [],
    elements: (ref.elements || []).map((e: any, i: number) => ({ cle: `Q${i + 1}`, question: e.q, contexte: e.contexte || '', statut: e.statut, pourAcheteur: e.acheteur })),
    libre: { sections: ref.sections, schemas: {}, cover: { client: 'Client de test', title: 'Mémoire technique', ref: '' } },
  };
  ecrireEtat(etat);
  const n0 = markdowns.length;
  const fichier = await recomposerPdf(etat);
  const md = markdowns[n0];
  const d = diapos(md);
  const sommaire = d.filter((x) => /## SOMMAIRE/.test(x.contenu)).map((x) => x.contenu).join('\n');
  const res = {
    fichier, pages: textePages(fichier).length - 1,
    chapitres: [...new Set([...sommaire.matchAll(/^(\d+)\. __(.+?)__$/gm)].map((m) => `${m[1]}. ${m[2]}`))],
    references_apres_I: /ILS NOUS FONT CONFIANCE/.test(sommaire),
    schemas_sous_texte: (md.match(/class="schema-gss"/g) || []).length,
    pages_schema: d.filter((x) => x.classe === 'schema').length,
    theme_retour_arriere: !/gss-bloc-numero/.test(md),
  };
  fs.copyFileSync(fichier, path.join(SORTIE, 'recomposition_v1.pdf'));
  fs.rmSync(path.resolve(__dirname, '../response/etats', `${idv1}.json`), { force: true });
  return res;
}

main().catch((e) => { console.error(e); fs.rmSync(dceDir, { recursive: true, force: true }); process.exit(1); });
