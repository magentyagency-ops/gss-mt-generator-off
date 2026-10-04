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

import { normaliserExpressionsDelai, nombreFr, RX_NOMBRE_LETTRES, estCahierDesCharges, estPieceAdministrative } from './base_memoires';

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
    .replace(/\s*\/\s*/g, '/').replace(/[–—-]/g, '-').replace(/(\d)\s+(?=(?:h|j)(?![a-z]))/g, '$1').replace(/\b0(\d)h/g, '$1h').replace(/\s+/g, ' ').trim()
    // « 24 heures sur 24 », « 7 jours sur 7 » : même clé que « 24h/24 », « 7j/7 ».
    .replace(/\b24h sur 24\b/g, '24h/24').replace(/\b7 ?j(?:ours?)? sur 7\b/g, '7j/7');
  return t;
}

/** Chiffres porteurs d'un texte : surfaces, durée du marché, amplitude (24 h/24, 7 j/7), délais, horaires de plage. */
function jetons(texte: string): string[] {
  const t = String(texte || '');
  const out = new Set<string>();
  const NB = String.raw`(?:\d{1,3}(?:[\s  .]\d{3})+|\d+(?:[.,]\d+)?)`;
  for (const m of t.matchAll(new RegExp(String.raw`${NB}\s*(?:m\s?²|m2|hectares?|ha)(?![\p{L}])`, 'giu'))) out.add(m[0]);
  for (const m of t.matchAll(new RegExp(String.raw`(?:${NB}|${RX_NOMBRE_LETTRES})\s*(?:\(\s*\d+\s*\)\s*)?(?:ans?|mois|ann[ée]es?)(?![\p{L}])`, 'giu'))) out.add(m[0]);
  for (const m of t.matchAll(/\b(?:24\s*h(?:eures)?\s*(?:\/|sur)\s*24|7\s*j(?:ours)?\s*(?:\/|sur)\s*7)\b/gi)) out.add(m[0]);
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

/** Mots trop généraux du métier pour rattacher un chiffre du mémoire à sa phrase du DCE (T2N-5). */
const MOTS_GENERIQUES_ARTICLE = new Set(['agent', 'agents', 'prestation', 'prestations', 'poste', 'postes', 'site', 'sites', 'heure', 'heures', 'minute', 'minutes',
  'marche', 'titulaire', 'prestataire', 'surveillance', 'securite', 'service', 'services', 'present', 'presente', 'notre', 'votre', 'nous', 'vous', 'pour', 'dans',
  'avec', 'sans', 'sous', 'entre', 'leurs', 'cette', 'toute', 'toutes', 'chaque', 'doivent', 'devra', 'devront', 'egalement', 'ainsi', 'selon', 'concerne',
  'concernee', 'cadre', 'lance', 'objet', 'article', 'jours', 'annee', 'annees', 'mois', 'semaine', 'durant', 'pendant', 'apres', 'avant', 'depuis', 'compter']);

/** Racines (5 premières lettres) des mots pleins d'une phrase, sans les mots trop généraux du métier. */
function racinesPleines(t: string): Set<string> {
  return new Set(norm(t).split(/[^a-z0-9]+/).filter((w) => w.length >= 5 && !MOTS_GENERIQUES_ARTICLE.has(w)).map((w) => w.slice(0, 5)));
}

/**
 * Articles du CCTP des chiffres du bloc 1 (relevés à la génération, gardés dans l'état pour les rendus suivants) : clé du
 * chiffre → numéro d'article (« 2.3 »). Un chiffre introuvable dans le DCE n'a pas d'article (jamais inventé).
 * T2N-5 : le chiffre n'est cherché que dans le cahier des charges (pièces « --- <pièce> --- » reconnues par
 * estCahierDesCharges ; toutes les pièces non administratives si aucune ne l'est, tout le texte s'il n'est pas découpé en
 * pièces), et la ligne retenue doit partager, à quelques lignes près, un mot plein avec la phrase du mémoire qui cite le
 * chiffre : jamais l'article du règlement de la consultation, ni celui d'un autre fait qui porte le même nombre.
 */
export function articlesBloc1(texteBloc1: string, dce: string): Record<string, string> {
  const out: Record<string, string> = {};
  const brut = String(dce || '');
  // Pièces du DCE (nom, début, fin) ; zones de recherche : le cahier des charges.
  const pieces: Array<{ nom: string; debut: number; fin: number }> = [];
  const rxPiece = /(?:^|\n)(?:--- (.+?) ---|===== PIÈCE : (.+?) =====)[ \t]*(?=\n)/g;
  for (const m of brut.matchAll(rxPiece)) {
    if (pieces.length) pieces[pieces.length - 1].fin = m.index || 0;
    pieces.push({ nom: m[1] || m[2] || '', debut: (m.index || 0) + m[0].length, fin: brut.length });
  }
  let zones: Array<{ debut: number; fin: number }>;
  if (!pieces.length) zones = [{ debut: 0, fin: brut.length }];
  else {
    const cahiers = pieces.filter((p) => estCahierDesCharges(p.nom));
    zones = cahiers.length ? cahiers : pieces.filter((p) => !estPieceAdministrative(p.nom));
  }
  // Lignes du DCE (avec leur position) ramenées à la forme des clés : l'article est cherché avant la ligne trouvée.
  const lignes: Array<{ debut: number; cle: string; texte: string }> = [];
  let debut = 0;
  for (const l of brut.split('\n')) {
    if (zones.some((z) => debut >= z.debut && debut < z.fin)) lignes.push({ debut, cle: cleChiffre(l), texte: l });
    debut += l.length + 1;
  }
  // Phrases du mémoire : chaque chiffre est rattaché aux mots pleins de sa phrase.
  const phrases = String(texteBloc1 || '').replace(/\*\*/g, '').split(/\n+|(?<=[.;!?])\s+(?=[A-ZÀ-Ý«])/);
  for (const ph of phrases) {
    const mots = racinesPleines(ph);
    for (const j of jetons(ph)) {
      const k = cleChiffre(j);
      if (!k || out[k] !== undefined) continue;
      const rx = new RegExp(`(?<![\\d.,])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\d])`);
      for (let i = 0; i < lignes.length; i++) {
        if (!rx.test(lignes[i].cle)) continue;
        // Mot plein de la phrase du mémoire sur la ligne du chiffre ou sur les deux lignes qui l'entourent.
        const voisinage = lignes.slice(Math.max(0, i - 2), i + 3).map((x) => x.texte).join(' ');
        const r = racinesPleines(voisinage);
        if (mots.size && ![...mots].some((w) => r.has(w))) continue;
        const art = articleAvant(brut, lignes[i].debut + 1);
        if (art) out[k] = art;
        break;
      }
    }
  }
  return out;
}

export interface ChiffreCle { valeur: string; legende: string; source: string }

/** Partie « ## Titre » du bloc 1 (texte jusqu'à l'intertitre suivant). */
function partie(texte: string, titre: RegExp): string {
  const m = new RegExp(`^##\\s+${titre.source}[^\\n]*\\n([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, 'im').exec(texte);
  return m ? m[1] : '';
}

/** Verbe conjugué ou auxiliaire : une légende du bandeau qui en contient un n'est pas un groupe nominal (T2N-3). */
const VERBE_CONJUGUE = /(?<![\p{L}])(?:est|sont|était|sera|seront|doit|doivent|devra|devront|peut|peuvent|pourra|fait|font|mesure|mesurent|couvre|couvrent|compte|comptent|comprend|comprennent|représente|représentent|atteint|totalise|assure|assurent|fonctionne|fonctionnent|reste|restent|demeure|a|ont)(?![\p{L}])/iu;

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
  const surfaces: Array<{ v: string; n: number; legende: string; generique: boolean }> = [];
  for (const m of contexte.matchAll(/((?:\d{1,3}(?:[\s\u00a0\u202f.]\d{3})+|\d+(?:[.,]\d+)?)\s*(?:m\s?²|m2|hectares?|ha))(?![\p{L}])(\s+(?:de|d['’])\s*[\p{L}'’-]+(?:\s+[\p{L}'’-]+){0,2})?/giu)) {
    const suite = (m[2] || '').trim().replace(/[,.;].*$/, '');
    const avant = contexte.slice(Math.max(0, (m.index || 0) - 60), m.index).match(/([\p{L}'’-]+(?:\s+[\p{L}'’-]+){0,2})\s+(?:de|d['’])\s*$/u);
    let nomAvant = avant ? avant[1].trim() : '';
    for (let k = 0; k < 3; k++) nomAvant = nomAvant.replace(/^(?:les|le|la|l['’]|une|un|des|dont|et|avec|compte|comprend|couvre)(?:\s+|(?<=['’]))/i, '').trim();
    // T2N-3 : une légende est un groupe nominal, jamais un morceau de phrase avec son verbe (« sa surface utile brute est de
    // 2 820 m² » donnait « utile brute est ») : le groupe nominal qui précède le verbe (« surface utile brute »), sinon la
    // légende générique.
    if (VERBE_CONJUGUE.test(nomAvant)) {
      const g = contexte.slice(Math.max(0, (m.index || 0) - 80), m.index).match(/([\p{L}'’-]+(?:\s+[\p{L}'’-]+){0,3})\s+(?:est|sont|fait|font|mesure|mesurent|repr[ée]sente|repr[ée]sentent|atteint|totalise|s['’][ée]tend)\s+(?:de|d['’]|d['’]environ|environ)?\s*$/iu);
      let gn = g ? g[1].trim() : '';
      for (let k = 0; k < 3; k++) gn = gn.replace(/^(?:sa|son|ses|leur|leurs|les|le|la|l['’]|une|un|des|dont|et|ce|cette|cet)(?:\s+|(?<=['’]))/i, '').trim();
      nomAvant = gn && !VERBE_CONJUGUE.test(gn) && gn.split(/\s+/).length <= 3 ? gn : '';
    }
    const generique = !(suite && !/^(?:de|d['’])\s*(?:la|le|les|l['’])?\s*$/i.test(suite)) && !(nomAvant && nomAvant.split(/\s+/).length <= 3);
    const legende = !generique ? (suite && !/^(?:de|d['’])\s*(?:la|le|les|l['’])?\s*$/i.test(suite) ? suite : nomAvant)
      : /hectare|ha\b/i.test(m[1]) ? 'superficie du domaine' : 'surface du site';
    surfaces.push({ v: m[1].replace(/m2/i, 'm²'), n: Number(m[1].replace(/[^\d]/g, '')) * (/hectare|ha\b/i.test(m[1]) ? 10000 : 1), legende, generique });
  }
  // T2N-4 : la légende générique (« surface du site ») ne vaut que pour une surface sans autre surface anonyme : quand le
  // texte en cite plusieurs sans objet propre (plusieurs sites, « respectivement … »), aucune n'est mise au bandeau (jamais
  // la surface d'un seul site présentée comme celle du site).
  const anonymes = new Set(surfaces.filter((x) => x.generique).map((x) => x.n)).size;
  for (const x of surfaces.filter((x) => !x.generique || anonymes === 1).sort((a, b) => b.n - a.n).filter((x, i, l) => l.findIndex((y) => y.legende === x.legende) === i).slice(0, 2)) ajouter(x.v, x.legende);
  // Présence continue (« 24h/24 », « 7j/7 »).
  // Légende : le poste du rang de tableau qui le cite (« PC de télésurveillance »), sinon les mots qui le précèdent dans sa
  // phrase (« le parc est ouvert 24h/24 » → « parc ouvert »), sinon « présence continue ».
  const RX_24 = /\b24\s*h(?:eures)?\s*(?:\/|sur)\s*24\b/i;
  const ligne24 = t.split('\n').find((l) => RX_24.test(l));
  if (ligne24) {
    let legende = '';
    if (/^\s*\|/.test(ligne24)) legende = (ligne24.split('|')[2] || '').replace(/\([^)]*\)/g, '').trim();
    else {
      const avant = (ligne24.split(RX_24)[0].split(/[:;,.]/).pop() || '').trim().split(/\s+/)
        .filter((w) => !/^(?:le|la|les|l'|un|une|des|est|sont|reste|restent|être|et|en|de|du|d'|à|au)$/i.test(w.replace(/[’]/g, "'")));
      legende = avant.slice(-3).join(' ');
    }
    // T2N-3 : jamais un morceau de phrase avec son verbe (« la surveillance à distance doit être active 24 h/24 » donnait
    // « distance doit active ») : la légende générique.
    if (legende.length < 3 || legende.length > 40 || VERBE_CONJUGUE.test(legende)) legende = 'présence continue';
    ajouter('24 h/24', legende);
  }
  // Horaires d'ouverture du site écrits dans l'amorce ou le contexte (« Ses horaires d'ouverture sont 07h00-19h00 »).
  const ouverture = /horaires?\s+d['’]ouverture[^.\n]{0,40}?(\d{1,2}\s*h\s*\d{0,2})\s*(?:[-–—]|à)\s*(\d{1,2}\s*h\s*\d{0,2})/i.exec(t);
  if (ouverture) ajouter(`${ouverture[1].replace(/\s+/g, '')}–${ouverture[2].replace(/\s+/g, '')}`, "horaires d'ouverture");
  // Délai imposé par le CCTP, cité dans « Vos attentes » (« dans un délai maximal de deux heures »), sinon au périmètre.
  // T2N-3 : la légende est tirée de la CITATION du CCTP seulement (la puce « **« … »** : … » ou la proposition du périmètre
  // qui porte le délai), jamais de la réponse de GSS ni du titre de rubrique cité ; l'action la plus proche avant le délai
  // décide (« l'opérateur traite l'alarme en 3 minutes » : traitement ; « présent sur site dans un délai de 30 minutes » :
  // arrivée). Sans action reconnue : « délai imposé ».
  const attentes = `${partie(t, /Vos attentes/)}\n${partie(t, /Le p[ée]rim[èe]tre/)}`;
  for (const ligne of attentes.split('\n')) {
    // Puce : la citation du CCTP (première « … » avant la flèche), sinon le constat d'une puce à libellé (« **Continuité** :
    // l'acheteur exige le remplacement dans l'heure → … ») ; texte suivi : la ligne.
    const avantFleche = ligne.split('→')[0];
    const cite = /«\s*([^»]{3,300})»/.exec(avantFleche);
    const constat = /^\s*[-*•]\s+\*\*[^*«»]+\*\*[^:]{0,80}:\s*(.+)$/.exec(avantFleche);
    const source = /^\s*[-*•]\s/.test(ligne) ? (cite ? cite[1] : constat ? constat[1] : '') : ligne;
    if (!source) continue;
    const lu = normaliserExpressionsDelai(source);
    const rx = /(?:dans|sous|d[ée]lai(?:\s+maxim(?:al|um))?\s+de|au plus tard(?: dans)?)\s+(?:les\s+|un\s+d[ée]lai\s+(?:maxim(?:al|um)\s+)?de\s+)?(\d{1,3})\s*(minutes?|heures?)\b/i;
    const d = rx.exec(lu);
    if (!d) continue;
    const n = Number(d[1]);
    const valeur = `${n} ${/^m/i.test(d[2]) ? (n > 1 ? 'minutes' : 'minute') : (n > 1 ? 'heures' : 'heure')}`;
    // Proposition qui porte le délai (entre les ponctuations fortes qui l'entourent), lue jusqu'au délai.
    const debutProp = Math.max(lu.lastIndexOf(';', d.index), lu.lastIndexOf('. ', d.index));
    const prop = norm(lu.slice(debutProp + 1, d.index + d[0].length));
    const ACTIONS: Array<[RegExp, string]> = [
      [/rempla|absen|relev|pourvo/g, 'pour remplacer un absent'],
      [/trait|acquitt|prise en compte|prendre en compte|au pc\b|contre[- ]appel|qualifi/g, "pour traiter l'alarme"],
      [/sur site|sur place|arriv|present|se rendre|se rend|interven|deplac|depech|levee de doute/g, 'pour être sur site'],
    ];
    let legende = 'délai imposé';
    let pos = -1;
    for (const [rxA, leg] of ACTIONS) for (const a of prop.matchAll(rxA)) if ((a.index || 0) > pos) { pos = a.index || 0; legende = leg; }
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

/**
 * Renvoi à un ou plusieurs blocs écrit dans une réponse (T2N-2, T2-CONS-5) : « , développée au bloc 4 », « développées au
 * bloc 4 et au bloc 5 », « aux blocs 4 et 5 », « au bloc 4, et au bloc 5 », « , blocs 4 et 5 », « , bloc 4 », « (bloc 4) ».
 */
const RX_RENVOI_BLOC = /\s*,?\s*\(?\s*(?:(?:d[ée]velopp[ée]e?s?|d[ée]taill[ée]e?s?|trait[ée]e?s?|pr[ée]sent[ée]e?s?)\s+)?(?:(?:au|aux|dans\s+les?)\s+)?blocs?\s+[1-5](?![\d.,]\d)(?:\s*(?:[,;]\s*(?:et|ou)|[,;]|et|ou)\s*(?:(?:au|aux)\s+)?(?:blocs?\s+)?[1-5](?![\d.,]\d))*\s*\)?/gi;

/** La réponse porte-t-elle un renvoi à un bloc ? */
const aRenvoi = (t: string) => new RegExp(RX_RENVOI_BLOC.source, 'i').test(t);

/** Cellule « Notre réponse » : chaque renvoi au bloc retiré du texte, tous les numéros gardés en « → BLOC n ET m ». */
function celluleReponse(z: string): string {
  let x = String(z || '');
  const blocs: string[] = [];
  // Renvoi placé avant le titre de la rubrique (« ce circuit est détaillé au bloc 4, « Notre socle… » ») : « détaillé dans ».
  x = x.replace(/\b(est|sont)\s+((?:d[ée]velopp|d[ée]taill|trait|pr[ée]sent)[ée]e?s?)\s+(?:au|aux)\s+blocs?\s+([1-5])\s*,\s*(?=«)/gi, (_m, v: string, p: string, n: string) => { blocs.push(n); return `${v} ${p} dans `; });
  x = x.replace(RX_RENVOI_BLOC, (m) => { blocs.push(...(m.match(/[1-5]/g) || [])); return ''; });
  const sans = x.replace(/»\s*,\s+et\s+«/g, '» et «').replace(/\s+([.,;])/g, '$1').replace(/[.,;:\s]+$/, '').replace(/\s{2,}/g, ' ').trim();
  const uniques = [...new Set(blocs)].sort();
  return `${sans.charAt(0).toUpperCase()}${sans.slice(1)}${uniques.length ? `${sans ? ' ' : ''}<span class="gss-bloc">→ BLOC ${uniques.join(' ET ')}</span>` : ''}`;
}

/** Segments d'un texte coupés après « . », « ; » ou « : » (jamais à l'intérieur d'une citation « … »), séparateur gardé. */
function segmentsHorsCitation(t: string): string[] {
  const out: string[] = [];
  let cur = '';
  let prof = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '«') prof++;
    else if (c === '»') prof = Math.max(0, prof - 1);
    cur += c;
    const suite = t.slice(i + 1).replace(/^\s+/, '');
    if (!prof && /\s/.test(t[i + 1] || '') && ((c === '.' && /^[A-ZÀ-Ý«]/.test(suite)) || c === ';')) {
      out.push(cur.trim());
      cur = '';
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Début d'une réponse de GSS (« nous organisons… », « Cette articulation est cadrée… », « GSS met en place… »). */
const DEBUT_REPONSE = /^(?:nous|notre|nos|gss|cette|cet|ces|cela|celle-ci|celui-ci|elle|elles|ils?)\b/i;

/** Titre court de la première rubrique citée dans une réponse (« « Le remplacement d'un agent absent : absence non prévue » » →
 *  « Le remplacement d'un agent absent »), pour nommer l'exigence quand la puce n'a que la citation du CCTP. */
function titreRubriqueCitee(reponse: string): string {
  const q = /«\s*([^»]{3,200}?)\s*»/.exec(reponse);
  if (!q) return '';
  let t = q[1].replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  const [avant, apres] = t.split(/\s+:\s+/);
  t = /^notre socle/i.test(avant) && apres ? apres : avant;
  t = t.trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Liste des attentes ou des points de vigilance en tableau à 3 colonnes (EXIGENCE / CE QUE LE CCTP DEMANDE / NOTRE RÉPONSE),
 * pour toutes les formes écrites par la rédaction (T2-CONS-5, T2N-1) : « **« citation »** : besoin → notre réponse : … »,
 * « **Libellé** (« citation ») : besoin → … », « **Libellé** : constat → notre réponse : … », et sans flèche
 * « **« citation »** : nous organisons … selon « Rubrique », développé au bloc n », « **Libellé** : constat. Cette
 * articulation relève de « Rubrique », développée au bloc n », ou une puce sans réponse (colonne NOTRE RÉPONSE vide). Le
 * tableau n'est jamais abandonné pour une seule puce d'une autre forme.
 */
function tableauAttentes(liste: string): string {
  const lignes = liste.split('\n').filter((l) => l.trim());
  const rangs: string[] = [];
  const GENERIQUE = /^(?:ce que vous attendez|vos attentes|attente|exigence|point de vigilance|points de vigilance)$/i;
  const cellule = (c: string) => { const x = c.replace(/\|/g, '\\|').replace(/\s+/g, ' ').replace(/[.;:\s]+$/, '').trim(); return x.charAt(0).toUpperCase() + x.slice(1); };
  const joindre = (a: string, b: string) => `${a}${b ? `${/^[,;.]/.test(b) ? '' : ' '}${b}` : ''}`;
  for (const l of lignes) {
    const corpsPuce = l.replace(/^\s*[-*•]\s+/, '');
    // Gras de tête, citation entre parenthèses, suite avant les deux-points, corps.
    const m = /^\*\*(.+?)\*\*\s*(\(\s*«[^»]+»\s*\))?\s*([^:→]*?)\s*(?::\s+|(?=→)|$)([\s\S]*)$/.exec(corpsPuce);
    const gras = m ? m[1].trim() : '';
    const parenthese = m ? (m[2] || '').replace(/^\(\s*|\s*\)$/g, '') : '';
    const suite = m ? (m[3] || '').trim() : '';
    const corps = (m ? m[4] : corpsPuce).trim();
    // Besoin et réponse : après la flèche ; sans flèche, la réponse commence au premier segment qui porte un renvoi au bloc
    // ou qui est une phrase de GSS (« nous… », « Cette … ») ; aucune des deux : pas de réponse écrite.
    let besoin = corps;
    let reponse = '';
    const iFleche = corps.indexOf('→');
    if (iFleche >= 0) {
      besoin = corps.slice(0, iFleche).trim();
      reponse = corps.slice(iFleche + 1).replace(/^\s*notre r[ée]ponse\s*:\s*/i, '').trim();
    } else {
      const segs = segmentsHorsCitation(corps);
      const iRep = segs.findIndex((x, i) => aRenvoi(x) || (i > 0 && DEBUT_REPONSE.test(x)) || (i === 0 && /^(?:nous|notre|nos|gss)\b/i.test(x)));
      if (iRep >= 0) {
        besoin = segs.slice(0, iRep).join(' ').trim();
        reponse = segs.slice(iRep).join(' ').trim();
      }
    }
    // Besoin écrit comme une action de GSS (« **« une ouverture effective à 07h20 »** : nous organisons la ronde d'ouverture →
    // notre réponse : « La planification »… ») : il fait partie de la réponse, jamais de l'exigence.
    if (besoin && /^(?:nous|notre|nos|gss)\b/i.test(besoin) && /^[«"“]/.test(gras)) {
      reponse = reponse ? `${besoin.replace(/[.;:\s]+$/, '')} : ${reponse.charAt(0).toLowerCase() === reponse.charAt(0) ? reponse : reponse}` : besoin;
      besoin = '';
    }
    let exigence: string, demande: string;
    if (parenthese) {
      exigence = GENERIQUE.test(gras) ? besoin : gras;
      demande = GENERIQUE.test(gras) ? parenthese : (besoin ? `${parenthese} : ${besoin}` : parenthese);
    } else if (/^[«"“]/.test(gras)) {
      exigence = besoin || titreRubriqueCitee(reponse);
      demande = joindre(gras, suite);
    } else if (gras) {
      exigence = joindre(gras, suite);
      demande = besoin;
    } else {
      exigence = '';
      demande = besoin;
    }
    rangs.push(`| ${cellule(exigence)} | ${cellule(demande)} | ${celluleReponse(reponse).replace(/\|/g, '\\|')} |`);
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
