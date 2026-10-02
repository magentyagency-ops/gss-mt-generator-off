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
import { reglagesIA } from '../core/modeles_ia';
import { SECTIONS_REPONSE_LIBRE, CHAPITRES_REPONSE_LIBRE } from './memoire_generator';
import { dimensions, insererPhotoDocx, paragrapheDuChamp } from './docx_images';
import { estPlanV2, type PlanMemoireType } from './memoire_type';
import { sectionsV2, chapitresV2, schemaFixe } from './reponse_libre_v2';
import { nombrePages } from './format_court';
import { deciderAdaptation, blocAdaptationsAssistant, ACTION_ADAPTATION, aValider, type PhraseAdaptee } from './adaptations_cctp';

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
      ...reglagesIA('mecanique'),
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
  // Phrases de GSS adaptées au cahier des charges (D8) : validées, modifiées ou rétablies une à une.
  const adaptations = etat.adaptations || [];
  const messagesAdaptations: string[] = [];

  const plan = await json(
    `Tu es l'assistant de modification d'un mémoire technique GSS (sécurité privée) rédigé dans le CADRE IMPOSÉ par l'acheteur. Actions possibles :
1. "modifier" : réécrire, corriger, compléter, développer, raccourcir ou enrichir UNE réponse de GSS (repérée par sa clé GSS_CH_…). Ajouter du contenu à une réponse existante passe aussi par "modifier".
2. "annexe" : ajouter une ou plusieurs pages en annexe, à la fin du document (titre + contenu).
3. "image" : insérer une photo jointe (P1, P2…) dans le document, UNIQUEMENT si l'utilisateur le demande : sous une réponse ("cle": GSS_CH_…) ou sur une nouvelle page d'annexe ("annexe": "titre de la page"), avec une légende courte qui décrit UNIQUEMENT ce que montre la photo (d'après sa description) ou ce que l'utilisateur en dit, sans rien affirmer d'autre ("legende").
4. Aucune action : si l'utilisateur pose une question, réponds-lui simplement.${adaptations.length ? `
5. ${ACTION_ADAPTATION}` : ''}
Les documents et photos joints sont des sources valables : utilise leurs informations dans les consignes quand l'utilisateur le demande. Une photo sans rapport avec la sécurité privée ou avec la partie visée (d'après sa description) n'est PAS insérée : explique-le dans ta réponse et demande confirmation.
Tu ne peux PAS modifier le texte de l'acheteur (intitulés, critères, barème, mise en page du cadre) : si on te le demande, explique-le poliment.
Identifie précisément la ou les réponses visées d'après leur libellé et leur contenu. Si la demande est ambiguë (plusieurs réponses possibles et aucune plus évidente), n'agis pas et demande laquelle. Dans chaque action, la "consigne" reprend fidèlement et complètement ce que veut l'utilisateur pour CETTE réponse (y compris les informations qu'il donne).
Renvoie {"reponse": "message court à l'utilisateur, en français, décrivant ce qui est fait", "actions": [{"type": "modifier", "cle": "GSS_CH_…", "consigne": "…"} ou {"type": "annexe", "titre": "…", "consigne": "…", "nouvellePage": true} ou {"type": "image", "piece": "P1", "cle": "GSS_CH_…", "legende": "…"} ou {"type": "image", "piece": "P1", "annexe": "…", "legende": "…"}${adaptations.length ? ' ou {"type": "adaptation", "n": 1, "choix": "valider"}' : ''}]}.`,
    `${etat.demande ? `Demande particulière saisie avant la génération : ${etat.demande}\n\n` : ''}Échanges précédents :\n${historique(etat) || '(aucun)'}\n\nRéponses de GSS dans le document :\n${champs.map((c) => `- ${c.cle} | ${c.libelle} | ${c.texte.replace(/\s+/g, ' ').slice(0, 700)}`).join('\n')}${blocAdaptationsAssistant(adaptations)}${blocPieces(pieces, false)}\n\nDemande de l'utilisateur : ${message}`,
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
    } else if (a?.type === 'adaptation') {
      // Phrase adaptée au CCTP (D8) : seule la phrase change, à sa place dans la réponse ; rien d'autre n'est réécrit.
      const ad = adaptations.find((x) => x.n === Number(a.n));
      const champ = ad && champs.find((c) => c.cle === ad.rubrique);
      if (!ad || !champ) { messagesAdaptations.push(`Je n'ai pas trouvé la phrase adaptée n° ${a.n}.`); continue; }
      const sauvegarde = { ...ad };
      const r = deciderAdaptation(champ.texte, ad, String(a.choix || ''), String(a.texte || ''));
      if (r.ok && r.change && !remplacerDansChamp(xmlDoc, champ.cle, champ.texte, r.texte)) {
        Object.assign(ad, sauvegarde);
        messagesAdaptations.push(`Je n'ai pas pu modifier la phrase adaptée n° ${ad.n} dans le document.`);
        continue;
      }
      messagesAdaptations.push(r.message);
      if (r.ok && r.change) { champ.texte = r.texte; if (!modifies.includes(champ.cle)) modifies.push(champ.cle); }
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
  return { reponse: avecAdaptations(String(plan.reponse || (modifies.length || messagesAdaptations.length ? 'Modification effectuée.' : "Je n'ai rien modifié.")).trim(), messagesAdaptations, adaptations), modifies };
}

/** Réponse de l'assistant complétée par le résultat de chaque choix sur une phrase adaptée et ce qui reste à valider (D8). */
function avecAdaptations(reponse: string, messages: string[], adaptations: PhraseAdaptee[]): string {
  if (!messages.length) return reponse;
  const reste = aValider(adaptations);
  return [reponse, ...messages.filter((m) => !reponse.includes(m)),
    reste.length ? `${reste.length === 1 ? 'Il reste une phrase adaptée' : `Il reste ${reste.length} phrases adaptées`} au cahier des charges à valider (n° ${reste.map((x) => x.n).join(', ')}).` : 'Toutes les phrases adaptées au cahier des charges ont reçu votre choix.'].join(' ');
}

/**
 * Remplace, dans une réponse du cadre (entre ses signets), le texte `ancien` (texte actuel de la réponse) par `nouveau`
 * en ne touchant qu'au passage qui change : mise en forme, signets des « [À COMPLÉTER] » et reste de la réponse gardés.
 * Faux si le passage n'a pas pu être placé (le document n'est alors pas modifié).
 */
export function remplacerDansChamp(xmlDoc: any, cle: string, ancien: string, nouveau: string): boolean {
  const c = noeudsDuChamp(xmlDoc, cle);
  if (!c) return false;
  const segs: Array<{ n: any; t: string; br: boolean }> = [];
  const walk = (n: any) => {
    if (n.nodeType !== 1) return;
    if (n.localName === 't') { segs.push({ n, t: n.textContent || '', br: false }); return; }
    if (n.localName === 'br') { segs.push({ n, t: '\n', br: true }); return; }
    if (n.childNodes) for (let i = 0; i < n.childNodes.length; i++) walk(n.childNodes[i]);
  };
  c.noeuds.forEach(walk);
  const plein = segs.map((s) => s.t).join('');
  if (plein.trim() !== ancien) return false;
  // Seul le passage différent est réécrit (préfixe et suffixe communs gardés tels quels).
  let p = 0;
  while (p < ancien.length && p < nouveau.length && ancien[p] === nouveau[p]) p++;
  let s = 0;
  while (s < ancien.length - p && s < nouveau.length - p && ancien[ancien.length - 1 - s] === nouveau[nouveau.length - 1 - s]) s++;
  const decalage = plein.length - plein.trimStart().length;
  const debut = decalage + p, fin = decalage + ancien.length - s;
  const insertion = nouveau.slice(p, nouveau.length - s);
  let pos = 0;
  let cible: { seg: typeof segs[number]; rel: number } | null = null;
  const bornes = segs.map((seg) => { const b = { seg, deb: pos, fin: pos + seg.t.length }; pos = b.fin; return b; });
  for (const b of bornes) if (!b.seg.br && debut >= b.deb && debut <= b.fin && (!cible || debut < b.fin)) { cible = { seg: b.seg, rel: debut - b.deb }; if (debut < b.fin) break; }
  if (!cible) return false;
  for (const b of bornes) {
    const a = Math.max(debut, b.deb), z = Math.min(fin, b.fin);
    if (b.seg === cible.seg) continue;
    if (z > a) {
      if (b.seg.br) b.seg.n.parentNode.removeChild(b.seg.n);
      else { b.seg.n.textContent = b.seg.t.slice(0, a - b.deb) + b.seg.t.slice(z - b.deb); b.seg.n.setAttribute('xml:space', 'preserve'); }
    }
  }
  const bc = bornes.find((b) => b.seg === cible!.seg)!;
  const avantTxt = bc.seg.t.slice(0, cible.rel);
  const apresTxt = bc.seg.t.slice(Math.min(bc.seg.t.length, Math.max(cible.rel, fin - bc.deb)));
  const lignes = insertion.split('\n');
  const t0 = bc.seg.n;
  t0.setAttribute('xml:space', 'preserve');
  if (lignes.length === 1) { t0.textContent = avantTxt + lignes[0] + apresTxt; return true; }
  t0.textContent = avantTxt + lignes[0];
  let dernier = t0;
  lignes.slice(1).forEach((l, i) => {
    const br = xmlDoc.createElementNS(W_NS, 'w:br');
    const t = nouveauT(xmlDoc, l + (i === lignes.length - 2 ? apresTxt : ''));
    dernier.parentNode.insertBefore(br, dernier.nextSibling);
    br.parentNode.insertBefore(t, br.nextSibling);
    dernier = t;
  });
  return true;
}

// ─── Réponse libre ────────────────────────────────────────────────────────────────────────

const REGLES_FORME_LIBRE = `RÈGLES DE FORME (rendu du mémoire) :
- Ne répète pas le titre de la rubrique (il est ajouté automatiquement).
- Structure avec des sous-titres Markdown « ## Sous-titre », séparés du paragraphe suivant par une ligne vide ; alterne paragraphes courts et listes à puces « - » ; mets en gras (**…**) les mots-clés et engagements forts.
- Conserve à l'identique les repères de la forme ⟦AC:n⟧ présents dans le texte (ils marquent des informations à compléter).`;

/** Plan v2 de l'état (réponse libre construite sur le mémoire type), sinon undefined (plan v1). */
function planV2(etat: EtatCompletion): PlanMemoireType | undefined {
  return estPlanV2(etat.libre?.plan) ? etat.libre!.plan : undefined;
}

function titreRubrique(etat: EtatCompletion, id: string): string {
  const plan = planV2(etat);
  if (plan) return plan.rubriques.find((r) => r.id === id)?.titre || etat.libre?.ajouts?.find((a) => a.id === id)?.title || id;
  return etat.libre?.court?.plan.find((p) => p.id === id)?.title || SECTIONS_REPONSE_LIBRE.find((s) => s.id === id)?.title || etat.libre?.ajouts?.find((a) => a.id === id)?.title || id;
}

function chapitreRubrique(etat: EtatCompletion, id: string): string {
  const plan = planV2(etat);
  if (plan) return plan.rubriques.find((r) => r.id === id)?.cle || etat.libre?.ajouts?.find((a) => a.id === id)?.chapter || '';
  return SECTIONS_REPONSE_LIBRE.find((s) => s.id === id)?.chapter || etat.libre?.ajouts?.find((a) => a.id === id)?.chapter || '';
}

/** Liste de chapitres en français : « I, II, III ou IV ». */
const ouChapitres = (cles: string[]) => (cles.length > 1 ? `${cles.slice(0, -1).join(', ')} ou ${cles[cles.length - 1]}` : cles[0] || '');

/**
 * Page du PDF où apparaît un texte (titre de rubrique, légende de photo), hors couverture et sommaire,
 * pour ouvrir l'aperçu au bon endroit. `derniere` : dernière page correspondante (photo ajoutée en fin de rubrique).
 */
export function pageDe(fichier: string, titre: string, derniere = false): number | undefined {
  const r = spawnSync('pdftotext', ['-layout', fichier, '-'], { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0 || !r.stdout) return undefined;
  const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const cible = norm(titre).slice(0, 40);
  const pages = r.stdout.split('\f');
  // En-tête de page : 1re ligne non vide « GLOBAL SECURITY SERVICES … <TITRE DE LA RUBRIQUE> ».
  const entete = (p: string) => norm(p.split('\n').find((l) => l.trim()) || '');
  const candidates = pages.map((p, i) => ({ p: norm(p), e: entete(p), i })).filter(({ p, i }) => i > 0 && !/^\s*sommaire\b/.test(p) && !p.includes(' sommaire '));
  // Priorité aux pages dont l'en-tête porte le titre (pages de la rubrique elle-même) ; à défaut, le texte de la page,
  // hors pages d'ouverture de bloc (« 04 nos moyens… »), qui listent les titres de toutes leurs rubriques.
  const parEntete = candidates.filter(({ e }) => e.startsWith('global security services') && e.includes(cible));
  const trouvees = parEntete.length ? parEntete : candidates.filter(({ p }) => !/^\d{2} /.test(p) && p.includes(cible));
  const t = derniere ? trouvees[trouvees.length - 1] : trouvees[0];
  return t ? t.i + 1 : undefined;
}

async function assistantLibre(etat: EtatCompletion, message: string, pieces: PieceJointe[], imposees?: { reponse: string; actions: any[] }): Promise<{ reponse: string; modifies: string[]; page?: number }> {
  const lib = etat.libre!;
  lib.ajouts ||= [];
  const court = lib.court;
  // Réponse libre v2 (mémoire type) : rubriques et chapitres (blocs I à V) du plan enregistré ; sinon plan v1.
  const planMt = planV2(etat);
  const chapitres: Record<string, string> = planMt ? chapitresV2(planMt) : CHAPITRES_REPONSE_LIBRE;
  const ids = (court ? court.plan.map((p) => p.id) : planMt ? sectionsV2(planMt, lib.ajouts).map((r) => r.id) : [...SECTIONS_REPONSE_LIBRE.map((s) => s.id), ...lib.ajouts.map((a) => a.id)]).filter((id) => (lib.sections[id] || '').trim());
  // Propositions de réponse de l'IA aux questions nouvelles du DCE, encore à valider par GSS.
  const enAttente = (id: string) => !!lib.ajouts!.find((a) => a.id === id && a.proposition);
  const propositions = ids.filter(enAttente);
  // Phrases de GSS adaptées au cahier des charges (D8) : validées, modifiées ou rétablies une à une.
  const adaptations = imposees ? [] : (etat.adaptations || []);
  const messagesAdaptations: string[] = [];
  // Format court imposé par le RC : le plan est celui du RC (pas d'ajout de partie) et la limite de pages s'impose.
  const organisation = court
    ? `au FORMAT IMPOSÉ PAR LE RÈGLEMENT DE CONSULTATION (${court.pagesMax} pages maximum), organisé selon le plan du RC en parties (les « rubriques » ci-dessous). Une nouvelle demande de contenu s'intègre à la partie concernée (action "modifier") : les actions "ajouter" et "image" ne sont pas disponibles dans ce format (limite de pages) : explique-le si l'utilisateur les demande. Une partie du RC ne se supprime pas (action "supprimer" indisponible). Une proposition de réponse de l'IA ([PROPOSITION À VALIDER]) est un PASSAGE de la partie, pas la partie entière : pour la retirer, action "modifier" sur la partie avec la consigne « retire uniquement le passage proposé sur <sujet> »`
    : `organisé en chapitres (${Object.entries(chapitres).map(([k, v]) => `${k} : ${v}`).join(' ; ')}) et en rubriques`;
  // Actions imposées (réponse de GSS à la proposition de dimensionnement, completion.ts) : pas de plan du modèle.
  const plan = imposees ? { ...imposees } : await json(
    `Tu es l'assistant de modification d'un mémoire technique GSS (sécurité privée) déjà généré, ${organisation}. Actions possibles :
1. "modifier" : refaire, corriger, compléter, développer, raccourcir ou enrichir une rubrique existante (repérée par son id).
2. "ajouter" : ajouter une nouvelle rubrique (une ou plusieurs pages) dans un chapitre (${ouChapitres(Object.keys(chapitres))}), éventuellement juste après une rubrique donnée ("apres": id).
3. "supprimer" : retirer une rubrique, UNIQUEMENT si l'utilisateur le demande explicitement.
4. "image" : insérer une photo jointe (P1, P2…) sur une page dédiée à la suite d'une rubrique ("id"), UNIQUEMENT si l'utilisateur le demande, avec une légende courte qui décrit UNIQUEMENT ce que montre la photo (d'après sa description) ou ce que l'utilisateur en dit, sans rien affirmer d'autre ("legende").
5. Aucune action : si l'utilisateur pose une question, réponds-lui simplement.${propositions.length ? `
6. "valider" : l'utilisateur valide TELLE QUELLE une proposition de réponse de l'IA (rubrique marquée [PROPOSITION À VALIDER]) ; s'il demande en même temps un changement, c'est l'action "modifier" (puis "valider" s'il valide aussi le résultat).` : ''}${adaptations.length ? `
7. ${ACTION_ADAPTATION}` : ''}
Les documents et photos joints sont des sources valables : utilise leurs informations dans les consignes quand l'utilisateur le demande. Une photo sans rapport avec la sécurité privée ou avec la partie visée (d'après sa description) n'est PAS insérée : explique-le dans ta réponse et demande confirmation.
Identifie précisément la ou les rubriques visées. Si la demande est ambiguë, n'agis pas et demande une précision. Dans chaque action, la "consigne" reprend fidèlement et complètement ce que veut l'utilisateur (y compris les informations qu'il donne).
Renvoie {"reponse": "message court à l'utilisateur, en français, décrivant ce qui est fait", "actions": [{"type": "modifier", "id": "…", "consigne": "…"} ou {"type": "ajouter", "chapitre": "II", "titre": "…", "apres": "…", "consigne": "…"} ou {"type": "supprimer", "id": "…"} ou {"type": "image", "piece": "P1", "id": "…", "legende": "…"}${propositions.length ? ' ou {"type": "valider", "id": "…"}' : ''}${adaptations.length ? ' ou {"type": "adaptation", "n": 1, "choix": "valider"}' : ''}]}.`,
    `${etat.demande ? `Demande particulière saisie avant la génération : ${etat.demande}\n\n` : ''}Échanges précédents :\n${historique(etat) || '(aucun)'}\n\nRubriques du mémoire :\n${ids.map((id) => `- ${id} | chapitre ${chapitreRubrique(etat, id)} | ${titreRubrique(etat, id)}${enAttente(id) ? ' [PROPOSITION À VALIDER]' : ''} | ${lib.sections[id].replace(/⟦AC:\d+⟧/g, '').replace(/\s+/g, ' ').slice(0, 300)}`).join('\n')}${blocAdaptationsAssistant(adaptations)}${blocPieces(pieces, false)}\n\nDemande de l'utilisateur : ${message}`,
  );
  const actions: any[] = Array.isArray(plan.actions) ? plan.actions : [];
  const modifies: string[] = [];
  // Schéma fixé par le mémoire type (bibliothèque, spécification, organigramme, process du besoin) : il ne dépend pas
  // du texte réécrit. Format court : tous ses schémas (process de la compréhension, organigramme, schéma de la
  // bibliothèque choisi d'après le titre de la partie) sont fixés à la génération et le rendu court n'en reconstruit
  // aucun : ils ne sont jamais effacés (une partie supprimée n'est plus rendue, avec son schéma).
  const oublierSchemas = (id: string) => { if (court || schemaFixe(planMt, id)) return; for (const k of Object.keys(lib.schemas || {})) if (k.startsWith(`${id}#`)) delete lib.schemas[k]; };
  const valides: string[] = [];
  // Format court : la proposition de l'IA porte l'id de la partie entière du RC. « Supprimer » une proposition retire
  // seulement le passage proposé (traduit en « modifier ») ; une partie du RC, elle, n'est jamais supprimée.
  const propositionsRetirees = new Set<string>();
  const partiesGardees: string[] = [];
  if (court) {
    for (const a of actions) {
      if (a?.type !== 'supprimer' || !ids.includes(a.id)) continue;
      const aj = lib.ajouts.find((x) => x.id === a.id && x.proposition);
      if (aj) {
        a.type = 'modifier';
        const sujets = String(aj.sujet || '').split(' ; ').filter(Boolean);
        a.consigne = `Retire uniquement le passage proposé par l'IA (proposition de réponse à valider) que vise la demande de l'utilisateur (« ${message} ») ; ${sujets.length > 1 ? `propositions de cette partie : ${sujets.join(' ; ')}` : `proposition de cette partie : ${sujets[0] || 'question nouvelle du DCE'}`}. Garde mot pour mot tout le reste de la partie.`;
        // Plusieurs propositions dans la partie : les autres restent à valider (marque gardée).
        if (sujets.length <= 1) propositionsRetirees.add(a.id);
      } else {
        a.type = 'refus';
        partiesGardees.push(titreRubrique(etat, a.id));
      }
    }
  }

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
      // Passage proposé retiré : plus de proposition à valider dans cette partie.
      if (propositionsRetirees.has(a.id)) lib.ajouts = lib.ajouts.filter((x) => !(x.id === a.id && x.proposition));
    } else if (a?.type === 'ajouter' && !court && String(a.titre || '').trim()) {
      const cles = Object.keys(chapitres);
      const chapitre = cles.includes(a.chapitre) ? a.chapitre : cles[cles.length - 1];
      const titre = String(a.titre).trim();
      const sources = await sourcesGss(`${titre} ${a.consigne || ''}`);
      const r = await json(
        `Tu rédiges une nouvelle rubrique d'un mémoire technique GSS (sécurité privée) selon la consigne de l'utilisateur, au niveau de qualité des autres rubriques (contenu concret, méthodes et exemples GSS). Longueur : celle que demande l'utilisateur, sachant qu'une page du mémoire contient environ 150 à 200 mots (« une page » ≈ 150-200 mots, « deux pages » ≈ 300-400 mots) ; sans précision, environ 200 à 350 mots.\n${REGLES_REDACTION}\n${REGLES_FORME_LIBRE}\nRenvoie {"texte": "…"}.`,
        `Titre de la rubrique : ${titre} (chapitre ${chapitre} — ${chapitres[chapitre]})\nConsigne de l'utilisateur : ${a.consigne || titre}${etat.demande ? `\nDemande particulière du mémoire : ${etat.demande}` : ''}${blocPieces(pieces, true)}${sources}`,
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
    } else if (a?.type === 'valider' && ids.includes(a.id) && enAttente(a.id)) {
      // Proposition de réponse de l'IA validée telle quelle par GSS : le texte ne change pas (aucune recomposition).
      const aj = lib.ajouts.find((x) => x.id === a.id)!;
      aj.proposition = false;
      aj.valideLe = new Date().toISOString();
      valides.push(aj.title);
    } else if (a?.type === 'adaptation') {
      // Phrase adaptée au CCTP (D8) : seule la phrase change, à sa place ; rien d'autre n'est réécrit (schéma gardé).
      const ad = adaptations.find((x) => x.n === Number(a.n));
      if (!ad || lib.sections[ad.rubrique] === undefined) { messagesAdaptations.push(`Je n'ai pas trouvé la phrase adaptée n° ${a.n}.`); continue; }
      const r = deciderAdaptation(lib.sections[ad.rubrique], ad, String(a.choix || ''), String(a.texte || ''));
      messagesAdaptations.push(r.message);
      if (r.ok && r.change) {
        const avant = lib.sections[ad.rubrique];
        lib.sections[ad.rubrique] = r.texte;
        if (!modifies.includes(ad.rubrique)) modifies.push(ad.rubrique);
        // Emplacement « [À COMPLÉTER] » disparu avec la phrase adaptée : sa question n'est plus posée.
        const tout = Object.values(lib.sections).join('\n');
        etat.elements = etat.elements.filter((e) => !(e.statut === 'ouvert' && e.reperes?.length && e.reperes.every((n) => avant.includes(REPERE(n)) && !tout.includes(REPERE(n)))));
      }
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
  if (planMt) {
    // Réponse libre v2 : « [À COMPLÉTER] » reste visible dans le brouillon et reçoit son repère juste après lui (la
    // réponse de GSS le remplacera à cet endroit) ; ceux qui ont déjà le leur sont laissés tels quels.
    for (const id of modifies) {
      if (!lib.sections[id]) continue;
      lib.sections[id] = lib.sections[id].replace(/\[À COMPLÉTER\](?!⟦AC:)/g, () => {
        nouveaux.push({ n: ++maxRepere, id });
        return `${PLACEHOLDER}${REPERE(maxRepere)}`;
      });
    }
    // Emplacements dont tous les repères ont disparu (l'utilisateur a donné l'information dans sa demande) : retirés.
    const tout = Object.values(lib.sections).join('\n');
    etat.elements = etat.elements.filter((e) => !(e.statut === 'ouvert' && e.reperes?.length && e.reperes.every((n) => !tout.includes(REPERE(n)))));
  } else {
    for (const id of modifies) {
      if (!lib.sections[id]?.includes(PLACEHOLDER)) continue;
      lib.sections[id] = lib.sections[id].split(PLACEHOLDER).map((morceau, i) => {
        if (i === 0) return morceau;
        nouveaux.push({ n: ++maxRepere, id });
        return `${REPERE(maxRepere)}${morceau}`;
      }).join('');
    }
  }
  if (nouveaux.length) {
    const phrase = (n: number, id: string) => {
      // v2 : le « [À COMPLÉTER] » visible qui précède le repère est noté par la phrase elle-même.
      const t = planMt ? lib.sections[id].split(`${PLACEHOLDER}${REPERE(n)}`).join(REPERE(n)) : lib.sections[id];
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
  let reponse = avecAdaptations(String(plan.reponse || (modifies.length || valides.length || messagesAdaptations.length ? 'Modification effectuée.' : "Je n'ai rien modifié.")).trim(), messagesAdaptations, adaptations);
  if (partiesGardees.length) reponse += ` ${partiesGardees.length > 1 ? 'Les parties' : 'La partie'} ${partiesGardees.map((t) => `« ${t} »`).join(', ')} ${partiesGardees.length > 1 ? 'sont imposées' : 'est imposée'} par le règlement de consultation : je ne peux pas ${partiesGardees.length > 1 ? 'les' : 'la'} supprimer. Dites-moi plutôt quel passage retirer.`;
  if (valides.length && !/valid/i.test(reponse)) reponse += ` Proposition${valides.length > 1 ? 's' : ''} validée${valides.length > 1 ? 's' : ''} : ${valides.map((t) => `« ${t} »`).join(', ')}.`;
  const aValider = modifies.filter(enAttente).map((id) => titreRubrique(etat, id));
  if (aValider.length) reponse += ` ${aValider.length > 1 ? 'Ces propositions restent' : 'Cette proposition reste'} à valider (${aValider.map((t) => `« ${t} »`).join(', ')}) : dites-moi « je valide » quand ${aValider.length > 1 ? 'elles vous conviennent' : 'elle vous convient'}.`;
  return { reponse, modifies, page };
}

// ─── Point d'entrée ───────────────────────────────────────────────────────────────────────

/**
 * Actions « modifier » imposées sur des rubriques d'une réponse libre (sans plan du modèle), avec le même traitement que
 * l'assistant : réécriture, repères des « [À COMPLÉTER] », recomposition du PDF, trace dans la conversation. Sert à
 * appliquer la réponse de GSS à la proposition de dimensionnement (completion.ts).
 */
export async function modifierRubriquesLibre(dossierId: string, actions: Array<{ id: string; consigne: string }>, message: string, reponse: string): Promise<ResultatAssistant> {
  const etat = lireEtat(dossierId);
  if (!etat || etat.mode !== 'libre') throw new Error('Aucune réponse libre générée pour ce dossier.');
  const r = await assistantLibre(etat, message, [], { reponse, actions: actions.map((a) => ({ type: 'modifier', ...a })) });
  const date = new Date().toISOString();
  (etat.conversation ||= []).push({ role: 'utilisateur', texte: message, date });
  etat.conversation.push({ role: 'assistant', texte: r.reponse, date: new Date().toISOString(), modifies: r.modifies });
  ecrireEtat(etat);
  return { etat, reponse: r.reponse, modifies: r.modifies, page: r.page };
}

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
