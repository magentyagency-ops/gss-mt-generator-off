// ════════════════════════════════════════════════════════════════════════════════════════
// ASSISTANT DE MODIFICATION DU MÉMOIRE GÉNÉRÉ (demande de Clarence)
// ════════════════════════════════════════════════════════════════════════════════════════
// Un échange en langage naturel pour refaire, corriger, modifier ou ajouter des pages dans le
// mémoire déjà généré, sans relancer la génération :
//  • réponse libre (.pdf) : chaque rubrique peut être réécrite, supprimée, et de nouvelles rubriques
//    (pages) peuvent être ajoutées dans le chapitre voulu ; le PDF est recomposé avec les schémas
//    existants (seules les pages nouvelles ou réécrites reçoivent un nouveau schéma) ;
//  • cadre imposé (.docx) : seules les RÉPONSES rédigées pour GSS (signets GSS_CH_n) peuvent être
//    réécrites ou complétées ; le texte de l'acheteur n'est jamais touché ; des pages peuvent être
//    ajoutées en annexe, à la fin du document.
// Toute réécriture s'appuie sur les mémoires GSS et le registre, avec les mêmes règles que la
// génération : aucune donnée inventée, « [À COMPLÉTER] » conservés.

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import PizZip from 'pizzip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import {
  lireEtat, ecrireEtat, EtatCompletion, ElementACompleter, elements, nouveauRun, nouveauT, json, openai,
  recomposerPdf, poserSignets, formulerQuestions, PLACEHOLDER, MARQUE_CHAMP, REPERE,
} from './completion';
import { rechercherMemoires, blocMemoires, blocRegistre, REGLES_REUTILISATION } from './base_memoires';
import { SECTIONS_REPONSE_LIBRE, CHAPITRES_REPONSE_LIBRE } from './memoire_generator';
import { dimensions, insererPhotoDocx, paragrapheDuChamp } from './docx_images';
import { nombrePages } from './format_court';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const EMBED_MODEL = process.env.RAG_EMBEDDING_MODEL || process.env.EMBEDDING_MODEL_MEMOIRE || 'text-embedding-3-small';

/** Pièce jointe à un message : photo (insérable dans le mémoire) ou document (source d'information). */
export interface PieceJointe {
  ref: string;              // P1, P2… (désignation pour l'assistant)
  nom: string;
  chemin: string;           // copie conservée avec le dossier (une photo insérée doit pouvoir être re-rendue)
  type: 'image' | 'document';
  texte?: string;           // document : contenu extrait
  description?: string;     // photo : ce qu'elle montre (lu par l'IA)
}

export interface ResultatAssistant {
  etat: EtatCompletion;
  reponse: string;
  modifies: string[];      // cadre : signets GSS_CH_n modifiés ; libre : ids de rubriques
  page?: number;           // réponse libre : page du PDF où se trouve la première modification
}

const REGLES_REDACTION = `RÈGLES DE RÉDACTION (impératives, identiques à la génération du mémoire) :
- N'invente AUCUNE donnée (chiffre, nom, délai, effectif, certification, référence client) absente des sources fournies : mémoires GSS, registre, texte actuel, demande de l'utilisateur. Une donnée nécessaire mais inconnue s'écrit exactement [À COMPLÉTER].
- Conserve chaque « [À COMPLÉTER] » encore présent, sauf si l'utilisateur fournit l'information correspondante.
- Une information donnée par l'utilisateur dans sa demande est une donnée valable.
${REGLES_REUTILISATION}
- Registre : une valeur marquée [À CONFIRMER] peut être utilisée, sans ajouter de marqueur de consultation.`;

/** Extraits des mémoires GSS et registre pour une réécriture (capitalisation sur les contenus GSS). */
async function sourcesGss(requete: string): Promise<string> {
  try {
    const r = await openai().embeddings.create({ model: EMBED_MODEL, input: [requete.slice(0, 4000)] });
    return blocMemoires(rechercherMemoires(r.data[0].embedding as number[], 6, requete, 3)) + blocRegistre();
  } catch {
    return blocRegistre();
  }
}

/** Décrit une photo (ce qu'elle montre, texte lisible) pour que l'assistant sache où et comment l'utiliser. */
export async function decrirePhoto(chemin: string): Promise<string> {
  try {
    const ext = path.extname(chemin).toLowerCase() === '.png' ? 'png' : 'jpeg';
    const r = await openai().chat.completions.create({
      model: process.env.MEMOIRE_MODEL || 'gpt-5.6-luna',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: "Décris précisément cette image en 2 à 3 phrases, en français : ce qu'elle montre et tout texte, chiffre ou information lisible qu'elle contient. Aucune supposition." },
          { type: 'image_url', image_url: { url: `data:image/${ext};base64,${fs.readFileSync(chemin).toString('base64')}` } },
        ] as any,
      }],
    });
    return (r.choices?.[0]?.message?.content || '').trim();
  } catch {
    return '';
  }
}

/** Bloc « pièces jointes » pour les prompts. */
function blocPieces(pieces: PieceJointe[], complet: boolean): string {
  if (!pieces.length) return '';
  return '\n\nPIÈCES JOINTES PAR L\'UTILISATEUR (sources valables) :\n' + pieces.map((p) => p.type === 'image'
    ? `[${p.ref}] photo « ${p.nom} » : ${p.description || '(description indisponible)'}`
    : `[${p.ref}] document « ${p.nom} » :\n${(p.texte || '').slice(0, complet ? 12000 : 1500)}`).join('\n\n');
}

const historique = (etat: EtatCompletion) =>
  (etat.conversation || []).slice(-6).map((m) => `${m.role === 'utilisateur' ? 'Utilisateur' : 'Assistant'} : ${m.texte}`).join('\n');

const nettoyerTexte = (t: string) => String(t || '').replace(/\uE000\d+\uE001/g, '').replace(/\[CONSULTATION REQUISE\s*:[^\]]*\][ \t]*[.;,]?/gi, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

// ─── Cadre imposé ──────────────────────────────────────────────────────────────────────────

/** Nœuds compris entre le signet `cle` et sa fin (frères dans le paragraphe). */
function noeudsDuChamp(xmlDoc: any, cle: string): { debut: any; fin: any; noeuds: any[] } | null {
  const debut = elements(xmlDoc, 'bookmarkStart').find((b) => b.getAttribute('w:name') === cle);
  if (!debut) return null;
  const id = debut.getAttribute('w:id');
  const noeuds: any[] = [];
  let fin: any = null;
  for (let n = debut.nextSibling; n; n = n.nextSibling) {
    if (n.nodeType === 1 && n.localName === 'bookmarkEnd' && n.getAttribute('w:id') === id) { fin = n; break; }
    noeuds.push(n);
  }
  return fin ? { debut, fin, noeuds } : null;
}

/** Texte d'un champ (sauts de ligne conservés). */
function texteDuChamp(noeuds: any[]): string {
  let out = '';
  const walk = (n: any) => {
    if (n.nodeType !== 1) return;
    if (n.localName === 't') { out += n.textContent || ''; return; }
    if (n.localName === 'br') { out += '\n'; return; }
    if (n.childNodes) for (let i = 0; i < n.childNodes.length; i++) walk(n.childNodes[i]);
  };
  noeuds.forEach(walk);
  return out.trim();
}

/** Écrit `texte` dans un run (lignes séparées par des sauts de ligne Word). */
function ecrireRun(xmlDoc: any, run: any, texte: string): void {
  texte.split(/\r?\n/).forEach((ligne, i) => {
    if (i > 0) run.appendChild(xmlDoc.createElementNS(W_NS, 'w:br'));
    run.appendChild(nouveauT(xmlDoc, ligne));
  });
}

/**
 * Remplace le contenu d'une réponse (entre ses signets) par `texte`. Les « [À COMPLÉTER] » du nouveau
 * texte sont marqués pour recevoir leur propre signet. Renvoie les emplacements GSS_AC disparus.
 */
function remplacerChamp(xmlDoc: any, cle: string, texte: string, marque: number): string[] {
  const c = noeudsDuChamp(xmlDoc, cle);
  if (!c) throw new Error(`Réponse ${cle} introuvable dans le document.`);
  const premierRun = c.noeuds.find((n) => n.nodeType === 1 && n.localName === 'r');
  const rPr = premierRun ? elements(premierRun, 'rPr')[0] : null;
  const disparus = c.noeuds
    .filter((n) => n.nodeType === 1 && n.localName === 'bookmarkStart' && /^GSS_AC_/.test(n.getAttribute('w:name') || ''))
    .map((n) => n.getAttribute('w:name'));
  c.noeuds.forEach((n) => n.parentNode.removeChild(n));
  const run = nouveauRun(xmlDoc, rPr);
  ecrireRun(xmlDoc, run, texte.split(PLACEHOLDER).join(`${PLACEHOLDER}${MARQUE_CHAMP(marque)}`));
  c.fin.parentNode.insertBefore(run, c.fin);
  return disparus;
}

/** Ajoute une annexe à la fin du document : titre + contenu (signet GSS_CH_ pour pouvoir la modifier). */
function ajouterAnnexe(xmlDoc: any, cle: string, titre: string, texte: string, nouvellePage: boolean, marque: number, idSignet: number): void {
  const body = elements(xmlDoc, 'body')[0];
  const sectPr = Array.from({ length: body.childNodes.length }, (_, i) => body.childNodes[i]).reverse()
    .find((n: any) => n.nodeType === 1 && n.localName === 'sectPr');
  const inserer = (el: any) => (sectPr ? body.insertBefore(el, sectPr) : body.appendChild(el));

  const pTitre = xmlDoc.createElementNS(W_NS, 'w:p');
  const rTitre = xmlDoc.createElementNS(W_NS, 'w:r');
  if (nouvellePage) {
    const br = xmlDoc.createElementNS(W_NS, 'w:br');
    br.setAttribute('w:type', 'page');
    rTitre.appendChild(br);
  }
  const rPrT = xmlDoc.createElementNS(W_NS, 'w:rPr');
  rPrT.appendChild(xmlDoc.createElementNS(W_NS, 'w:b'));
  const sz = xmlDoc.createElementNS(W_NS, 'w:sz');
  sz.setAttribute('w:val', '28');
  rPrT.appendChild(sz);
  rTitre.insertBefore(rPrT, rTitre.firstChild);
  rTitre.appendChild(nouveauT(xmlDoc, titre));
  pTitre.appendChild(rTitre);
  inserer(pTitre);

  const p = xmlDoc.createElementNS(W_NS, 'w:p');
  const debut = xmlDoc.createElementNS(W_NS, 'w:bookmarkStart');
  debut.setAttribute('w:id', String(idSignet));
  debut.setAttribute('w:name', cle);
  const fin = xmlDoc.createElementNS(W_NS, 'w:bookmarkEnd');
  fin.setAttribute('w:id', String(idSignet));
  const run = xmlDoc.createElementNS(W_NS, 'w:r');
  ecrireRun(xmlDoc, run, texte.split(PLACEHOLDER).join(`${PLACEHOLDER}${MARQUE_CHAMP(marque)}`));
  p.appendChild(debut); p.appendChild(run); p.appendChild(fin);
  inserer(p);
}

async function assistantCadre(etat: EtatCompletion, message: string, pieces: PieceJointe[]): Promise<{ reponse: string; modifies: string[] }> {
  const zip = new PizZip(fs.readFileSync(etat.fichier));
  const xmlDoc = new DOMParser().parseFromString(zip.file('word/document.xml')!.asText(), 'text/xml');
  const champs = (etat.champs || [])
    .map((c) => { const n = noeudsDuChamp(xmlDoc, c.cle); return n ? { ...c, texte: texteDuChamp(n.noeuds) } : null; })
    .filter((c): c is { cle: string; libelle: string; texte: string } => !!c && !!c.texte);
  if (!champs.length) {
    return { reponse: "Ce document a été généré avant l'arrivée de l'assistant : ses réponses ne sont pas repérées. Relancez la génération pour pouvoir le modifier ici.", modifies: [] };
  }

  const plan = await json(
    `Tu es l'assistant de modification d'un mémoire technique GSS (sécurité privée) rédigé dans le CADRE IMPOSÉ par l'acheteur. Actions possibles :
1. "modifier" : réécrire, corriger, compléter, développer, raccourcir ou enrichir UNE réponse de GSS (repérée par sa clé GSS_CH_…). Ajouter du contenu à une réponse existante passe aussi par "modifier".
2. "annexe" : ajouter une ou plusieurs pages en annexe, à la fin du document (titre + contenu).
3. "image" : insérer une photo jointe (P1, P2…) dans le document, UNIQUEMENT si l'utilisateur le demande : sous une réponse ("cle": GSS_CH_…) ou sur une nouvelle page d'annexe ("annexe": "titre de la page"), avec une légende courte qui décrit UNIQUEMENT ce que montre la photo (d'après sa description) ou ce que l'utilisateur en dit, sans rien affirmer d'autre ("legende").
4. Aucune action : si l'utilisateur pose une question, réponds-lui simplement.
Les documents et photos joints sont des sources valables : utilise leurs informations dans les consignes quand l'utilisateur le demande. Une photo sans rapport avec la sécurité privée ou avec la partie visée (d'après sa description) n'est PAS insérée : explique-le dans ta réponse et demande confirmation.
Tu ne peux PAS modifier le texte de l'acheteur (intitulés, critères, barème, mise en page du cadre) : si on te le demande, explique-le poliment.
Identifie précisément la ou les réponses visées d'après leur libellé et leur contenu. Si la demande est ambiguë (plusieurs réponses possibles et aucune plus évidente), n'agis pas et demande laquelle. Dans chaque action, la "consigne" reprend fidèlement et complètement ce que veut l'utilisateur pour CETTE réponse (y compris les informations qu'il donne).
Renvoie {"reponse": "message court à l'utilisateur, en français, décrivant ce qui est fait", "actions": [{"type": "modifier", "cle": "GSS_CH_…", "consigne": "…"} ou {"type": "annexe", "titre": "…", "consigne": "…", "nouvellePage": true} ou {"type": "image", "piece": "P1", "cle": "GSS_CH_…", "legende": "…"} ou {"type": "image", "piece": "P1", "annexe": "…", "legende": "…"}]}.`,
    `${etat.demande ? `Demande particulière saisie avant la génération : ${etat.demande}\n\n` : ''}Échanges précédents :\n${historique(etat) || '(aucun)'}\n\nRéponses de GSS dans le document :\n${champs.map((c) => `- ${c.cle} | ${c.libelle} | ${c.texte.replace(/\s+/g, ' ').slice(0, 700)}`).join('\n')}${blocPieces(pieces, false)}\n\nDemande de l'utilisateur : ${message}`,
  );
  const actions: any[] = Array.isArray(plan.actions) ? plan.actions : [];
  const modifies: string[] = [];
  const maxAC = Math.max(0, ...etat.elements.map((e) => Number((e.cle.match(/^GSS_AC_(\d+)$/) || [])[1] || 0)));
  let marque = 900000;
  const libelles = new Map<number, string>();   // marque des nouveaux [À COMPLÉTER] → libellé de la réponse
  const disparus = new Set<string>();

  for (const a of actions) {
    if (a?.type === 'modifier') {
      const champ = champs.find((c) => c.cle === a.cle);
      if (!champ || !String(a.consigne || '').trim()) continue;
      const sources = await sourcesGss(`${champ.libelle} ${a.consigne}`);
      const r = await json(
        `Tu réécris UNE réponse d'un mémoire technique GSS (sécurité privée) rédigée dans le cadre imposé par l'acheteur, en appliquant exactement la consigne de l'utilisateur. Garde tout ce que la consigne ne demande pas de changer. Texte brut, sans Markdown ; sauts de ligne autorisés ; phrases naturelles, style d'un responsable d'exploitation de GSS.\n${REGLES_REDACTION}\nRenvoie {"texte": "…"}.`,
        `Question de l'acheteur (libellé) : ${champ.libelle}\n\nRéponse actuelle :\n${champ.texte}\n\nConsigne de l'utilisateur : ${a.consigne}${etat.demande ? `\nDemande particulière du mémoire : ${etat.demande}` : ''}${blocPieces(pieces, true)}${sources}`,
      );
      const texte = nettoyerTexte(r.texte);
      if (!texte) continue;
      libelles.set(++marque, champ.libelle);
      remplacerChamp(xmlDoc, champ.cle, texte, marque).forEach((c) => disparus.add(c));
      modifies.push(champ.cle);
    } else if (a?.type === 'annexe' && String(a.titre || '').trim()) {
      const sources = await sourcesGss(`${a.titre} ${a.consigne || ''}`);
      const r = await json(
        `Tu rédiges le contenu d'une annexe ajoutée à la fin d'un mémoire technique GSS (sécurité privée), selon la consigne de l'utilisateur. Texte brut, sans Markdown ; sauts de ligne entre les paragraphes ; un intitulé court par partie si utile. Ne répète pas le titre de l'annexe (il est déjà affiché au-dessus).\n${REGLES_REDACTION}\nRenvoie {"texte": "…"}.`,
        `Titre de l'annexe : ${a.titre}\nConsigne de l'utilisateur : ${a.consigne || a.titre}${etat.demande ? `\nDemande particulière du mémoire : ${etat.demande}` : ''}${blocPieces(pieces, true)}${sources}`,
      );
      const texte = nettoyerTexte(r.texte);
      if (!texte) continue;
      const n = (etat.champs || []).filter((c) => /^GSS_CH_A/.test(c.cle)).length + 1;
      const cle = `GSS_CH_A${n}`;
      libelles.set(++marque, `Annexe — ${String(a.titre).trim()}`);
      ajouterAnnexe(xmlDoc, cle, String(a.titre).trim(), texte, a.nouvellePage !== false, marque, 70000 + n);
      (etat.champs ||= []).push({ cle, libelle: `Annexe — ${String(a.titre).trim()}` });
      modifies.push(cle);
    } else if (a?.type === 'image') {
      const piece = pieces.find((p) => p.ref === a.piece && p.type === 'image');
      if (!piece) continue;
      const legende = String(a.legende || '').trim();
      const cible = a.cle ? paragrapheDuChamp(xmlDoc, a.cle) : null;
      if (cible) {
        insererPhotoDocx(zip, xmlDoc, piece, legende, cible, modifies.length);
        modifies.push(a.cle);
      } else {
        // Nouvelle page d'annexe consacrée à la photo.
        const titre = String(a.annexe || legende || 'Photo').trim();
        const n = (etat.champs || []).filter((c) => /^GSS_CH_A/.test(c.cle)).length + 1;
        const cle = `GSS_CH_A${n}`;
        ajouterAnnexe(xmlDoc, cle, titre, legende || ' ', true, ++marque, 70000 + n);
        (etat.champs ||= []).push({ cle, libelle: `Annexe — ${titre}` });
        insererPhotoDocx(zip, xmlDoc, piece, '', paragrapheDuChamp(xmlDoc, cle), modifies.length);
        modifies.push(cle);
      }
    }
  }

  if (modifies.length) {
    // Emplacements [À COMPLÉTER] : ceux qui ont disparu sont retirés, les nouveaux reçoivent leur signet
    // et leur question précise (même traitement qu'à la génération).
    etat.elements = etat.elements.filter((e) => !(disparus.has(e.cle) && e.statut === 'ouvert'));
    const nouveaux = poserSignets(xmlDoc, maxAC);
    if (nouveaux.length) {
      const qs = await formulerQuestions(nouveaux.map((x) => ({ cle: x.cle, contexte: x.contexte, environnement: x.environnement, critere: libelles.get(x.champ) || '' })));
      for (const x of nouveaux) {
        const q = qs.get(x.cle);
        const el: ElementACompleter = { cle: x.cle, question: q?.question || x.contexte, contexte: x.contexte, statut: 'ouvert', groupe: q?.groupe };
        etat.elements.push(el);
      }
      // Les emplacements sont listés dans l'ordre du document.
      const ordre = elements(xmlDoc, 'bookmarkStart').map((b) => b.getAttribute('w:name'));
      etat.elements.sort((a, b) => ordre.indexOf(a.cle) - ordre.indexOf(b.cle));
    }
    zip.file('word/document.xml', new XMLSerializer().serializeToString(xmlDoc));
    const sortie = path.join(path.dirname(etat.fichier), `Mémoire technique GSS_${Date.now()}.docx`);
    fs.writeFileSync(sortie, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }));
    etat.fichier = sortie;
  }
  return { reponse: String(plan.reponse || (modifies.length ? 'Modification effectuée.' : "Je n'ai rien modifié.")).trim(), modifies };
}

// ─── Réponse libre ────────────────────────────────────────────────────────────────────────

const REGLES_FORME_LIBRE = `RÈGLES DE FORME (rendu du mémoire) :
- Ne répète pas le titre de la rubrique (il est ajouté automatiquement).
- Structure avec des sous-titres Markdown « ## Sous-titre », séparés du paragraphe suivant par une ligne vide ; alterne paragraphes courts et listes à puces « - » ; mets en gras (**…**) les mots-clés et engagements forts.
- Conserve à l'identique les repères de la forme ⟦AC:n⟧ présents dans le texte (ils marquent des informations à compléter).`;

function titreRubrique(etat: EtatCompletion, id: string): string {
  return etat.libre?.court?.plan.find((p) => p.id === id)?.title || SECTIONS_REPONSE_LIBRE.find((s) => s.id === id)?.title || etat.libre?.ajouts?.find((a) => a.id === id)?.title || id;
}

function chapitreRubrique(etat: EtatCompletion, id: string): string {
  return SECTIONS_REPONSE_LIBRE.find((s) => s.id === id)?.chapter || etat.libre?.ajouts?.find((a) => a.id === id)?.chapter || '';
}

/**
 * Page du PDF où apparaît un texte (titre de rubrique, légende de photo), hors couverture et sommaire,
 * pour ouvrir l'aperçu au bon endroit. `derniere` : dernière page correspondante (photo ajoutée en fin de rubrique).
 */
function pageDe(fichier: string, titre: string, derniere = false): number | undefined {
  const r = spawnSync('pdftotext', ['-layout', fichier, '-'], { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0 || !r.stdout) return undefined;
  const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const cible = norm(titre).slice(0, 40);
  const pages = r.stdout.split('\f');
  const trouvees = pages.map((p, i) => ({ p: norm(p), i })).filter(({ p, i }) => i > 0 && !/^\s*sommaire\b/.test(p) && !p.includes(' sommaire ') && p.includes(cible));
  const t = derniere ? trouvees[trouvees.length - 1] : trouvees[0];
  return t ? t.i + 1 : undefined;
}

async function assistantLibre(etat: EtatCompletion, message: string, pieces: PieceJointe[]): Promise<{ reponse: string; modifies: string[]; page?: number }> {
  const lib = etat.libre!;
  lib.ajouts ||= [];
  const court = lib.court;
  const ids = (court ? court.plan.map((p) => p.id) : [...SECTIONS_REPONSE_LIBRE.map((s) => s.id), ...lib.ajouts.map((a) => a.id)]).filter((id) => (lib.sections[id] || '').trim());
  // Format court imposé par le RC : le plan est celui du RC (pas d'ajout de partie) et la limite de pages s'impose.
  const organisation = court
    ? `au FORMAT IMPOSÉ PAR LE RÈGLEMENT DE CONSULTATION (${court.pagesMax} pages maximum), organisé selon le plan du RC en parties (les « rubriques » ci-dessous). Une nouvelle demande de contenu s'intègre à la partie concernée (action "modifier") : les actions "ajouter" et "image" ne sont pas disponibles dans ce format (limite de pages) : explique-le si l'utilisateur les demande`
    : `organisé en chapitres (${Object.entries(CHAPITRES_REPONSE_LIBRE).map(([k, v]) => `${k} : ${v}`).join(' ; ')}) et en rubriques`;
  const plan = await json(
    `Tu es l'assistant de modification d'un mémoire technique GSS (sécurité privée) déjà généré, ${organisation}. Actions possibles :
1. "modifier" : refaire, corriger, compléter, développer, raccourcir ou enrichir une rubrique existante (repérée par son id).
2. "ajouter" : ajouter une nouvelle rubrique (une ou plusieurs pages) dans un chapitre (I, II, III ou IV), éventuellement juste après une rubrique donnée ("apres": id).
3. "supprimer" : retirer une rubrique, UNIQUEMENT si l'utilisateur le demande explicitement.
4. "image" : insérer une photo jointe (P1, P2…) sur une page dédiée à la suite d'une rubrique ("id"), UNIQUEMENT si l'utilisateur le demande, avec une légende courte qui décrit UNIQUEMENT ce que montre la photo (d'après sa description) ou ce que l'utilisateur en dit, sans rien affirmer d'autre ("legende").
5. Aucune action : si l'utilisateur pose une question, réponds-lui simplement.
Les documents et photos joints sont des sources valables : utilise leurs informations dans les consignes quand l'utilisateur le demande. Une photo sans rapport avec la sécurité privée ou avec la partie visée (d'après sa description) n'est PAS insérée : explique-le dans ta réponse et demande confirmation.
Identifie précisément la ou les rubriques visées. Si la demande est ambiguë, n'agis pas et demande une précision. Dans chaque action, la "consigne" reprend fidèlement et complètement ce que veut l'utilisateur (y compris les informations qu'il donne).
Renvoie {"reponse": "message court à l'utilisateur, en français, décrivant ce qui est fait", "actions": [{"type": "modifier", "id": "…", "consigne": "…"} ou {"type": "ajouter", "chapitre": "II", "titre": "…", "apres": "…", "consigne": "…"} ou {"type": "supprimer", "id": "…"} ou {"type": "image", "piece": "P1", "id": "…", "legende": "…"}]}.`,
    `${etat.demande ? `Demande particulière saisie avant la génération : ${etat.demande}\n\n` : ''}Échanges précédents :\n${historique(etat) || '(aucun)'}\n\nRubriques du mémoire :\n${ids.map((id) => `- ${id} | chapitre ${chapitreRubrique(etat, id)} | ${titreRubrique(etat, id)} | ${lib.sections[id].replace(/⟦AC:\d+⟧/g, '').replace(/\s+/g, ' ').slice(0, 300)}`).join('\n')}${blocPieces(pieces, false)}\n\nDemande de l'utilisateur : ${message}`,
  );
  const actions: any[] = Array.isArray(plan.actions) ? plan.actions : [];
  const modifies: string[] = [];
  const oublierSchemas = (id: string) => { for (const k of Object.keys(lib.schemas || {})) if (k.startsWith(`${id}#`)) delete lib.schemas[k]; };

  for (const a of actions) {
    if (a?.type === 'modifier' && ids.includes(a.id) && String(a.consigne || '').trim()) {
      const titre = titreRubrique(etat, a.id);
      const sources = await sourcesGss(`${titre} ${a.consigne}`);
      const r = await json(
        `Tu réécris une rubrique d'un mémoire technique GSS (sécurité privée) en appliquant exactement la consigne de l'utilisateur. Garde tout ce que la consigne ne demande pas de changer.${court ? ` Le mémoire est limité à ${court.pagesMax} pages par le règlement de consultation : sauf demande contraire, la rubrique garde une longueur comparable (${(lib.sections[a.id] || '').split(/\s+/).length} mots environ), dans un style dense.` : ''}\n${REGLES_REDACTION}\n${REGLES_FORME_LIBRE}\nRenvoie {"texte": "…"}.`,
        `Rubrique : ${titre}\n\nTexte actuel :\n${lib.sections[a.id]}\n\nConsigne de l'utilisateur : ${a.consigne}${etat.demande ? `\nDemande particulière du mémoire : ${etat.demande}` : ''}${blocPieces(pieces, true)}${sources}`,
      );
      const texte = nettoyerTexte(r.texte);
      if (!texte) continue;
      lib.sections[a.id] = texte;
      oublierSchemas(a.id);
      modifies.push(a.id);
    } else if (a?.type === 'ajouter' && !court && String(a.titre || '').trim()) {
      const chapitre = ['I', 'II', 'III', 'IV'].includes(a.chapitre) ? a.chapitre : 'IV';
      const titre = String(a.titre).trim();
      const sources = await sourcesGss(`${titre} ${a.consigne || ''}`);
      const r = await json(
        `Tu rédiges une nouvelle rubrique d'un mémoire technique GSS (sécurité privée) selon la consigne de l'utilisateur, au niveau de qualité des autres rubriques (contenu concret, méthodes et exemples GSS). Longueur : celle que demande l'utilisateur, sachant qu'une page du mémoire contient environ 150 à 200 mots (« une page » ≈ 150-200 mots, « deux pages » ≈ 300-400 mots) ; sans précision, environ 200 à 350 mots.\n${REGLES_REDACTION}\n${REGLES_FORME_LIBRE}\nRenvoie {"texte": "…"}.`,
        `Titre de la rubrique : ${titre} (chapitre ${chapitre} — ${CHAPITRES_REPONSE_LIBRE[chapitre]})\nConsigne de l'utilisateur : ${a.consigne || titre}${etat.demande ? `\nDemande particulière du mémoire : ${etat.demande}` : ''}${blocPieces(pieces, true)}${sources}`,
      );
      const texte = nettoyerTexte(r.texte);
      if (!texte) continue;
      const id = `x_${Date.now().toString(36)}${lib.ajouts.length}`;
      lib.sections[id] = texte;
      lib.ajouts.push({ id, chapter: chapitre, title: titre, apres: ids.includes(a.apres) ? a.apres : undefined });
      modifies.push(id);
    } else if (a?.type === 'image' && !court && ids.includes(a.id)) {
      const piece = pieces.find((p) => p.ref === a.piece && p.type === 'image');
      if (!piece || !dimensions(fs.readFileSync(piece.chemin))) continue;
      lib.photos ||= {};
      (lib.photos[a.id] ||= []).push({ chemin: piece.chemin, legende: String(a.legende || '').trim() });
      modifies.push(a.id);
    } else if (a?.type === 'supprimer' && ids.includes(a.id)) {
      lib.sections[a.id] = '';
      lib.ajouts = lib.ajouts.filter((x) => x.id !== a.id);
      if (lib.photos) delete lib.photos[a.id];
      oublierSchemas(a.id);
      modifies.push(a.id);
    }
  }

  // Données inconnues écrites « [À COMPLÉTER] » par l'assistant : comme à la génération, chacune devient
  // un repère suivi (question précise dans « À compléter »), jamais un texte brut imprimé dans le PDF.
  const nouveaux: Array<{ n: number; id: string }> = [];
  let maxRepere = Math.max(0, ...etat.elements.flatMap((e) => e.reperes || []), ...Object.values(lib.sections).flatMap((t) => [...t.matchAll(/⟦AC:(\d+)⟧/g)].map((m) => Number(m[1]))));
  for (const id of modifies) {
    if (!lib.sections[id]?.includes(PLACEHOLDER)) continue;
    lib.sections[id] = lib.sections[id].split(PLACEHOLDER).map((morceau, i) => {
      if (i === 0) return morceau;
      nouveaux.push({ n: ++maxRepere, id });
      return `${REPERE(maxRepere)}${morceau}`;
    }).join('');
  }
  if (nouveaux.length) {
    const phrase = (n: number, id: string) => {
      const t = lib.sections[id];
      const p = t.indexOf(REPERE(n));
      return (t.slice(Math.max(0, p - 220), p).split(/[.!?\n]/).pop() || '').replace(/⟦AC:\d+⟧/g, '[…]').replace(/[#*]/g, '').trim() + ` ${PLACEHOLDER}` + (t.slice(p + REPERE(n).length).split(/[.!?\n]/)[0] || '').replace(/⟦AC:\d+⟧/g, '[…]').replace(/[#*]/g, '');
    };
    const qs = await formulerQuestions(nouveaux.map(({ n, id }) => ({
      cle: `A${n}`, contexte: phrase(n, id), environnement: lib.sections[id].replace(/⟦AC:\d+⟧/g, PLACEHOLDER).slice(0, 1200), critere: titreRubrique(etat, id),
    })));
    const q0 = etat.elements.filter((e) => /^Q\d+$/.test(e.cle)).length;
    nouveaux.forEach(({ n, id }, i) => {
      const q = qs.get(`A${n}`);
      etat.elements.push({ cle: `Q${q0 + i + 1}`, question: q?.question || phrase(n, id), contexte: `${titreRubrique(etat, id)} — ${phrase(n, id)}`, statut: 'ouvert', reperes: [n], groupe: q?.groupe });
    });
  }

  let page: number | undefined;
  if (modifies.length) {
    etat.fichier = await recomposerPdf(etat);
    if (court) {
      const pages = nombrePages(etat.fichier);
      if (pages > court.pagesMax) plan.reponse = `${String(plan.reponse || 'Modification effectuée.').trim()} Attention : le mémoire fait maintenant ${pages} pages pour ${court.pagesMax} autorisées par le RC ; demandez-moi de raccourcir une partie.`;
    }
    const visible = modifies.find((id) => (lib.sections[id] || '').trim());
    const photo = actions.some((a) => a?.type === 'image' && a.id === visible);
    if (visible) page = pageDe(etat.fichier, titreRubrique(etat, visible), photo);
  }
  return { reponse: String(plan.reponse || (modifies.length ? 'Modification effectuée.' : "Je n'ai rien modifié.")).trim(), modifies, page };
}

// ─── Point d'entrée ───────────────────────────────────────────────────────────────────────

export async function discuter(dossierId: string, message: string, pieces: PieceJointe[] = []): Promise<ResultatAssistant> {
  const etat = lireEtat(dossierId);
  if (!etat) throw new Error('Aucun document généré pour ce dossier.');
  const texte = message.trim() || (pieces.length ? 'Voici des pièces jointes.' : '');
  for (const p of pieces) if (p.type === 'image' && !p.description) p.description = await decrirePhoto(p.chemin);
  const r = etat.mode === 'cadre' ? await assistantCadre(etat, texte, pieces) : await assistantLibre(etat, texte, pieces);
  const date = new Date().toISOString();
  (etat.conversation ||= []).push({ role: 'utilisateur', texte, date, pieces: pieces.length ? pieces.map((p) => p.nom) : undefined });
  etat.conversation.push({ role: 'assistant', texte: r.reponse, date: new Date().toISOString(), modifies: r.modifies });
  ecrireEtat(etat);
  return { etat, reponse: r.reponse, modifies: r.modifies, page: (r as any).page };
}
