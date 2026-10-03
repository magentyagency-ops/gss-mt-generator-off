// ════════════════════════════════════════════════════════════════════════════════════════
// BLOC 1 DU STYLE « MARINE & SIGNAL » VERSION 3 (planche validée, feuilles 27 et 28 de planche_marine.pdf, décision D11)
// ════════════════════════════════════════════════════════════════════════════════════════
// Pages d'explication de « Notre compréhension de votre besoin », comme la maquette validée (T1-CONS-5) :
//  · un bandeau de 3 à 4 chiffres clés du marché, en orange, chacun avec sa légende et l'article du CCTP qui le fixe ;
//  · une ligne « Source : CCTP, articles … » sous « Votre contexte et votre site » et sous « Le périmètre de la prestation » ;
//  · « Vos attentes et nos engagements » et « Les points de vigilance » en tableau à 3 colonnes (EXIGENCE / CE QUE LE CCTP
//    DEMANDE / NOTRE RÉPONSE), le renvoi au bloc écrit « → BLOC n » ;
//  · l'ouverture du bloc 1 liste ses sous-parties.
// Forme seulement : chaque chiffre, chaque phrase et chaque renvoi viennent du texte du bloc 1 ; les articles viennent du DCE
// (relevés à la génération). Rien n'est ajouté pour les autres styles.

import { normaliserExpressionsDelai, nombreFr, RX_NOMBRE_LETTRES } from './base_memoires';

const echapper = (t: string) => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const norm = (t: string) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'").toLowerCase();

/** Clé d'un chiffre, pour le retrouver dans le DCE : nombre sans séparateur de milliers, unité ramenée à sa forme courte. */
export function cleChiffre(valeur: string): string {
  const t = normaliserExpressionsDelai(norm(valeur))
    // Durée en lettres (« un an », « trois ans », « douze mois ») : en chiffres, comme les délais.
    .replace(new RegExp(`(?<![a-z-])(${RX_NOMBRE_LETTRES})(?=\\s*(?:\\(\\s*\\d+\\s*\\)\\s*)?(?:ans?|mois|annees?)(?![a-z]))`, 'gi'), (m) => { const n = nombreFr(m); return Number.isFinite(n) ? String(n) : m; })
    .replace(/(\d+)\s*\(\s*\1\s*\)/g, '$1')
    .replace(/(\d)[\s  .](?=\d{3}\b)/g, '$1')
    .replace(/m\s?(?:2|²)/g, 'm2').replace(/hectares?/g, 'ha').replace(/\bheures?\b/g, 'h').replace(/\bminutes?\b/g, 'min')
    .replace(/\s*\/\s*/g, '/').replace(/[–—-]/g, '-').replace(/(\d)\s+(?=(?:h|j)(?![a-z]))/g, '$1').replace(/\b0(\d)h/g, '$1h').replace(/\s+/g, ' ').trim();
  return t;
}

/** Chiffres porteurs d'un texte : surfaces, durée du marché, amplitude (24 h/24, 7 j/7), délais, horaires de plage. */
function jetons(texte: string): string[] {
  const t = String(texte || '');
  const out = new Set<string>();
  const NB = String.raw`(?:\d{1,3}(?:[\s  .]\d{3})+|\d+(?:[.,]\d+)?)`;
  for (const m of t.matchAll(new RegExp(String.raw`${NB}\s*(?:m\s?²|m2|hectares?|ha)(?![\p{L}])`, 'giu'))) out.add(m[0]);
  for (const m of t.matchAll(new RegExp(String.raw`(?:${NB}|${RX_NOMBRE_LETTRES})\s*(?:\(\s*\d+\s*\)\s*)?(?:ans?|mois|ann[ée]es?)(?![\p{L}])`, 'giu'))) out.add(m[0]);
  for (const m of t.matchAll(/\b(?:24\s*h\s*\/\s*24|7\s*j(?:ours)?\s*\/\s*7)\b/gi)) out.add(m[0]);
  for (const m of t.matchAll(new RegExp(String.raw`(?:${NB}|${RX_NOMBRE_LETTRES})\s*(?:\(\s*\d+\s*\)\s*)?(?:heures?|minutes?|mn|min)(?![\p{L}])`, 'giu'))) out.add(m[0]);
  for (const m of t.matchAll(/\b\d{1,2}\s*h\s*\d{0,2}\s*[–—-]\s*\d{1,2}\s*h\s*\d{0,2}\b/gi)) out.add(m[0]);
  return [...out];
}

/** Numéro d'article du CCTP qui précède une position du DCE (« ARTICLE 3 », « Article 2.3 », titre « 3.2 Délais »). */
function articleAvant(dce: string, pos: number): string {
  const avant = dce.slice(Math.max(0, pos - 12000), pos);
  let dernier = '';
  for (const m of avant.matchAll(/(?:^|\n)[ \t]*(?:ARTICLE|Article|ART\.?|Art\.?)[ \t]*(\d{1,2}(?:[.-]\d{1,2}){0,3})\b|(?:^|\n)[ \t]*(\d{1,2}(?:\.\d{1,2}){1,3})\.?[ \t]+[A-ZÉÈÀÂÎÔÛ][^\n]{2,90}(?=\n)/g)) {
    dernier = (m[1] || m[2] || '').replace(/-/g, '.');
  }
  return dernier;
}

/**
 * Articles du CCTP des chiffres du bloc 1 (relevés à la génération, gardés dans l'état pour les rendus suivants) : clé du
 * chiffre → numéro d'article (« 2.3 »). Un chiffre introuvable dans le DCE n'a pas d'article (jamais inventé).
 */
export function articlesBloc1(texteBloc1: string, dce: string): Record<string, string> {
  const out: Record<string, string> = {};
  const brut = String(dce || '');
  // Lignes du DCE (avec leur position) ramenées à la forme des clés : l'article est cherché avant la ligne trouvée.
  const lignes: Array<{ debut: number; cle: string }> = [];
  let debut = 0;
  for (const l of brut.split('\n')) {
    lignes.push({ debut, cle: cleChiffre(l) });
    debut += l.length + 1;
  }
  for (const j of jetons(texteBloc1)) {
    const k = cleChiffre(j);
    if (!k || out[k] !== undefined) continue;
    const rx = new RegExp(`(?<![\\d.,])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\d])`);
    const l = lignes.find((x) => rx.test(x.cle));
    if (!l) continue;
    const art = articleAvant(brut, l.debut + 1);
    if (art) out[k] = art;
  }
  return out;
}

export interface ChiffreCle { valeur: string; legende: string; source: string }

/** Partie « ## Titre » du bloc 1 (texte jusqu'à l'intertitre suivant). */
function partie(texte: string, titre: RegExp): string {
  const m = new RegExp(`^##\\s+${titre.source}[^\\n]*\\n([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, 'im').exec(texte);
  return m ? m[1] : '';
}

/**
 * Chiffres clés du marché lus dans le texte du bloc 1 (3 à 4) : durée, surfaces, amplitude continue, délai imposé, avec une
 * légende courte tirée de leur phrase et l'article du CCTP quand il est connu. [] s'il y en a moins de 2.
 */
export function chiffresCles(texte: string, articles: Record<string, string> = {}): ChiffreCle[] {
  const t = String(texte || '').replace(/\*\*/g, '');
  const out: ChiffreCle[] = [];
  const source = (v: string) => { const a = articles[cleChiffre(v)]; return a ? `art. ${a}` : ''; };
  const ajouter = (valeur: string, legende: string) => {
    const v = valeur.replace(/\s+/g, ' ').trim();
    if (!v || out.some((c) => cleChiffre(c.valeur) === cleChiffre(v)) || out.length >= 4) return;
    out.push({ valeur: v, legende: legende.replace(/\s+/g, ' ').trim(), source: source(valeur) });
  };
  // Durée du marché (amorce : « … d'une durée de 3 ans »).
  const duree = /dur[ée]e\s+(?:initiale\s+|ferme\s+)?(?:de\s+|d['’])\s*((?:\d+|une?|deux|trois|quatre|cinq)\s+(?:ans?|mois|ann[ée]es?))/i.exec(t);
  if (duree) ajouter(duree[1].replace(/^(une?|deux|trois|quatre|cinq)\b/i, (w) => String(nombreFr(w))), 'durée du marché');
  // Surfaces du site (« 40 000 m² de bâtiments », « le bâtiment principal de 5 634 m² », « 130 hectares ») : les deux plus
  // grandes, chacune avec son objet (mots qui la suivent « de … », sinon le nom qui la précède).
  const contexte = partie(t, /Votre contexte/) || t;
  const surfaces: Array<{ v: string; n: number; legende: string }> = [];
  for (const m of contexte.matchAll(/((?:\d{1,3}(?:[\s\u00a0\u202f.]\d{3})+|\d+(?:[.,]\d+)?)\s*(?:m\s?²|m2|hectares?|ha))(?![\p{L}])(\s+(?:de|d['’])\s*[\p{L}'’-]+(?:\s+[\p{L}'’-]+){0,2})?/giu)) {
    const suite = (m[2] || '').trim().replace(/[,.;].*$/, '');
    const avant = contexte.slice(Math.max(0, (m.index || 0) - 60), m.index).match(/([\p{L}'’-]+(?:\s+[\p{L}'’-]+){0,2})\s+(?:de|d['’])\s*$/u);
    let nomAvant = avant ? avant[1].trim() : '';
    for (let k = 0; k < 3; k++) nomAvant = nomAvant.replace(/^(?:les|le|la|l['’]|une|un|des|dont|et|avec|compte|comprend|couvre)(?:\s+|(?<=['’]))/i, '').trim();
    const legende = suite && !/^(?:de|d['’])\s*(?:la|le|les|l['’])?\s*$/i.test(suite) ? suite
      : nomAvant && nomAvant.split(/\s+/).length <= 3 ? nomAvant : /hectare|ha\b/i.test(m[1]) ? 'superficie du domaine' : 'surface du site';
    surfaces.push({ v: m[1].replace(/m2/i, 'm²'), n: Number(m[1].replace(/[^\d]/g, '')) * (/hectare|ha\b/i.test(m[1]) ? 10000 : 1), legende });
  }
  for (const x of surfaces.sort((a, b) => b.n - a.n).filter((x, i, l) => l.findIndex((y) => y.legende === x.legende) === i).slice(0, 2)) ajouter(x.v, x.legende);
  // Présence continue (« 24h/24 », « 7j/7 »).
  // Légende : le poste du rang de tableau qui le cite (« PC de télésurveillance »), sinon les mots qui le précèdent dans sa
  // phrase (« le parc est ouvert 24h/24 » → « parc ouvert »), sinon « présence continue ».
  const ligne24 = t.split('\n').find((l) => /\b24\s*h\s*\/\s*24\b/i.test(l));
  if (ligne24) {
    let legende = '';
    if (/^\s*\|/.test(ligne24)) legende = (ligne24.split('|')[2] || '').replace(/\([^)]*\)/g, '').trim();
    else {
      const avant = (ligne24.split(/\b24\s*h\s*\/\s*24\b/i)[0].split(/[:;,.]/).pop() || '').trim().split(/\s+/)
        .filter((w) => !/^(?:le|la|les|l'|un|une|des|est|sont|reste|restent|être|et|en|de|du|d'|à|au)$/i.test(w.replace(/[’]/g, "'")));
      legende = avant.slice(-3).join(' ');
    }
    if (legende.length < 3 || legende.length > 40) legende = 'présence continue';
    ajouter('24 h/24', legende);
  }
  // Horaires d'ouverture du site écrits dans l'amorce ou le contexte (« Ses horaires d'ouverture sont 07h00-19h00 »).
  const ouverture = /horaires?\s+d['’]ouverture[^.\n]{0,40}?(\d{1,2}\s*h\s*\d{0,2})\s*(?:[-–—]|à)\s*(\d{1,2}\s*h\s*\d{0,2})/i.exec(t);
  if (ouverture) ajouter(`${ouverture[1].replace(/\s+/g, '')}–${ouverture[2].replace(/\s+/g, '')}`, "horaires d'ouverture");
  // Délai imposé par le CCTP, cité dans « Vos attentes » (« dans un délai maximal de deux heures »), sinon au périmètre.
  const attentes = `${partie(t, /Vos attentes/)}\n${partie(t, /Le p[ée]rim[èe]tre/)}`;
  for (const ligne of attentes.split('\n')) {
    const lu = normaliserExpressionsDelai(ligne);
    const d = /(?:dans|sous|d[ée]lai(?:\s+maxim(?:al|um))?\s+de|au plus tard(?: dans)?)\s+(?:les\s+|un\s+d[ée]lai\s+(?:maxim(?:al|um)\s+)?de\s+)?(\d{1,3})\s*(minutes?|heures?)\b/i.exec(lu);
    if (!d) continue;
    const n = Number(d[1]);
    const valeur = `${n} ${/^m/i.test(d[2]) ? (n > 1 ? 'minutes' : 'minute') : (n > 1 ? 'heures' : 'heure')}`;
    const legende = /rempla|absen/i.test(ligne) ? 'pour remplacer un absent'
      : /au PC|traitement|consignes|contre[- ]appel/i.test(ligne) ? "pour traiter l'alarme au PC"
        : /sur site|sur place|arriv|se rendre|interven/i.test(ligne) ? 'pour être sur site' : 'délai imposé';
    ajouter(valeur, legende);
    break;
  }
  return out.length >= 2 ? out : [];
}

/** Bandeau des chiffres clés (HTML), comme la maquette : valeur en orange, légende, article. */
export function bandeauChiffres(chiffres: ChiffreCle[]): string {
  if (chiffres.length < 2) return '';
  return `<div class="gss-chiffres">${chiffres.map((c) => `<div><b>${echapper(c.valeur)}</b><span>${echapper(c.legende)}</span>${c.source ? `<i>${echapper(c.source)}</i>` : ''}</div>`).join('')}</div>`;
}

/** Ligne « Source : CCTP, articles a et b » (articles des chiffres d'une partie) ; '' si aucun article connu. */
function ligneSource(texte: string, articles: Record<string, string>): string {
  const arts = [...new Set(jetons(texte).map((j) => articles[cleChiffre(j)]).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
  if (!arts.length) return '';
  const liste = arts.length > 1 ? `${arts.slice(0, -1).join(', ')} et ${arts[arts.length - 1]}` : arts[0];
  return `<p class="gss-source">Source : CCTP, ${arts.length > 1 ? 'articles' : 'article'} ${echapper(liste)}</p>`;
}

/** Cellule « Notre réponse » : renvoi « développée au bloc n » écrit « → BLOC n ». */
function celluleReponse(z: string): string {
  const blocs = [...new Set([...z.matchAll(/d[ée]velopp[ée]e?s?\s+(?:au|aux)\s+blocs?\s+(\d)(?:\s+et\s+(\d))?/gi)].flatMap((m) => [m[1], m[2]]).filter(Boolean))];
  const sans = z.replace(/,?\s*d[ée]velopp[ée]e?s?\s+(?:au|aux)\s+blocs?\s+\d(?:\s+et\s+\d)?/gi, '')
    .replace(/»\s*,\s+et\s+«/g, '» et «').replace(/\s+([.,;])/g, '$1').replace(/[.,;\s]+$/, '').trim();
  return `${sans.charAt(0).toUpperCase()}${sans.slice(1)}${blocs.length ? ` <span class="gss-bloc">→ BLOC ${blocs.join(' ET ')}</span>` : ''}`;
}

/**
 * Liste des attentes ou des points de vigilance en tableau à 3 colonnes (EXIGENCE / CE QUE LE CCTP DEMANDE / NOTRE RÉPONSE),
 * pour les formes écrites par la rédaction : « **« citation »** : besoin → notre réponse : … », « **Libellé** (« citation »)
 * : besoin → notre réponse : … », « **Point de vigilance** : constat → notre réponse : … ». Une seule puce d'une autre forme :
 * la liste reste telle quelle.
 */
function tableauAttentes(liste: string): string {
  const lignes = liste.split('\n').filter((l) => l.trim());
  const rangs: string[] = [];
  const GENERIQUE = /^(?:ce que vous attendez|vos attentes|attente|exigence|point de vigilance|points de vigilance)$/i;
  const cellule = (c: string) => { const x = c.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim(); return x.charAt(0).toUpperCase() + x.slice(1); };
  for (const l of lignes) {
    const m = /^\s*[-*•]\s+\*\*(.+?)\*\*\s*(\(\s*«[^»]+»\s*\))?\s*([^:→]*?)\s*:\s+(.+?)\s*→\s*(?:notre r[ée]ponse\s*:\s*)?(.+)$/i.exec(l);
    if (!m) return liste;
    const gras = m[1].trim();
    const parenthese = (m[2] || '').replace(/^\(\s*|\s*\)$/g, '');
    const suite = (m[3] || '').trim();
    const besoin = m[4].trim();
    let exigence: string, demande: string;
    if (parenthese) {
      exigence = GENERIQUE.test(gras) ? besoin : gras;
      demande = GENERIQUE.test(gras) ? parenthese : `${parenthese} : ${besoin}`;
    } else if (/^[«"“]/.test(gras)) {
      exigence = besoin;
      demande = `${gras}${suite ? `${/^[,;.]/.test(suite) ? '' : ' '}${suite}` : ''}`;
    } else {
      exigence = `${gras}${suite ? `${/^[,;.]/.test(suite) ? '' : ' '}${suite}` : ''}`;
      demande = besoin;
    }
    rangs.push(`| ${cellule(exigence)} | ${cellule(demande)} | ${celluleReponse(m[5]).replace(/\|/g, '\\|')} |`);
  }
  return rangs.length ? ['| Exigence | Ce que le CCTP demande | Notre réponse |', '|---|---|---|', ...rangs].join('\n') : liste;
}

/**
 * Texte du bloc 1 mis en page comme la maquette validée (style « marine » v3 seulement) : bandeau des chiffres clés après
 * l'amorce, lignes de source, attentes et points de vigilance en tableaux. Le texte n'est pas changé : seule sa forme.
 */
export function pageBloc1Marine(texte: string, articles: Record<string, string> = {}, o: { sources?: boolean; bandeau?: boolean } = {}): string {
  let t = String(texte || '');
  const bandeau = o.bandeau === false ? '' : bandeauChiffres(chiffresCles(t, articles));
  // Listes des attentes et des points de vigilance : en tableaux.
  t = t.replace(/(^##\s+(?:Vos attentes|Les points de vigilance)[^\n]*\n+)((?:[ \t]*[-*•]\s[^\n]*(?:\n|$))+)/gim, (_m, titre: string, liste: string) => `${titre}${tableauAttentes(liste.trimEnd())}\n`);
  // Lignes de source sous le contexte et sous le périmètre.
  t = t.replace(/(^##\s+(?:Votre contexte|Le p[ée]rim[èe]tre)[^\n]*\n)([\s\S]*?)(?=^##\s|(?![\s\S]))/gim, (_m, titre: string, corps: string) => {
    const s = o.sources === false ? '' : ligneSource(corps, articles);
    return s ? `${titre}${corps.trimEnd()}\n\n${s}\n\n` : `${titre}${corps}`;
  });
  if (!bandeau) return t;
  // Bandeau après l'amorce (premier paragraphe avant le premier intertitre), sinon en tête.
  const i = t.search(/^##\s/m);
  if (i > 0) return `${t.slice(0, i).trimEnd()}\n\n${bandeau}\n\n${t.slice(i)}`;
  return `${bandeau}\n\n${t}`;
}

/** Sous-parties du bloc 1 listées sur son ouverture (maquette : contexte, périmètre, attentes, vigilance, process). */
export function sousPartiesBloc1(texte: string, avecSchema: boolean): string[] {
  const titres = [...String(texte || '').matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].replace(/\*\*/g, '').trim()).filter(Boolean);
  return [...titres, ...(avecSchema ? ['Notre réponse en un process'] : [])];
}
