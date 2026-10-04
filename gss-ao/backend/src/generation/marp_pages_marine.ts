// ════════════════════════════════════════════════════════════════════════════════════════
// PAGES DU STYLE « MARINE & SIGNAL » VERSION 3 (planche validée par le patron de GSS, décision D11)
// ════════════════════════════════════════════════════════════════════════════════════════
// Gabarits de pages de la planche v3 (outils/pages_marine.py et construire_planche_marine.py de l'agent design) traduits
// en Markdown Marp : couverture, sommaire (avec la légende des schémas, une seule fois), ouverture de bloc (grand numéro
// orange, parcours du mémoire), en-tête de page (numéro et titre du bloc en cours), parcours des blocs sous l'en-tête,
// surtitre et titre des pages de texte, intertitres en colonne de titrage, page de texte court avec « l'essentiel ».
// La mise en forme est dans marp/gss-theme-pages-marine.css. Forme seulement : les textes affichés sont ceux du mémoire
// (titres des blocs et des rubriques, texte des rubriques, page de garde) ; « l'essentiel » cite mot pour mot la première
// phrase du texte de la rubrique.

/** Limites d'une page de texte du style v3 : colonne de lecture de 136 mm (corps 10,5 pt, interligne 1,5 : environ 82
 *  caractères, 75 comptés ; intervalle entre paragraphes de 2,4 mm, compté 0,7 ligne), 46 lignes réelles par page ; la
 *  première page d'une rubrique réserve 6 lignes au surtitre et au titre (24 pt) ; intertitres dans la colonne de titrage.
 *  Tableaux en pleine largeur (180 mm). Calées sur les pages rendues par Chromium (aucun débordement). */
export const LIMITES_MARINE_V3 = { mots: 600, lignes: 47, caracteres: 75, ligneTableau: 1.8, reserve: 6, titresEnMarge: true };
/** Texte d'une rubrique sous ce nombre de signes, sur une seule page et suivi de son schéma : gabarit « texte court ». */
export const SEUIL_TEXTE_COURT = 1300;

const echapper = (t: string) => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const apostrophes = (t: string) => t.replace(/(?<=\w)'(?=\w)/g, '’');
const norm = (t: string) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();

/** Typographie de rendu des pages du style v3 (comme la planche) : apostrophe typographique entre deux lettres et
 *  ordinaux en exposant (« 1er » → 1<sup>er</sup>) ; aucun mot n'est changé. Les balises HTML ne sont pas touchées. */
export function typoV3(texte: string): string {
  return texte.split(/(<[^>]+>)/).map((morceau) => (morceau.startsWith('<') ? morceau : morceau
    .replace(/(?<=[A-Za-zÀ-ÖØ-öø-ÿŒœ])'(?=[A-Za-zÀ-ÖØ-öø-ÿŒœ])/g, '’')
    .replace(/(?<![\w.,])(\d{1,3})(er|re|e|ème)(?=[\s\u00a0.,;:!?)]|$)/g, '$1<sup>$2</sup>')
    // Espace avant « ; : ! ? » insécable (ifits 701 : « … zones industrielles) » puis « ; » seul en début de ligne suivante).
    .replace(/(?<=[^\s|])[ \t]([;:!?])(?=\s|$)/g, '\u202f$1'))).join('');
}

/** Intertitres de la colonne de titrage : une ligne entièrement en gras (« **Les transports** ») devient un intertitre
 *  (« ### Les transports »), suivi d'une ligne vide. Aucun mot n'est changé. */
export function intertitresV3(texte: string): string {
  return texte
    .replace(/^[ \t]*\*\*([^*\n]+?)\*\*[ \t]*$/gm, '### $1')
    .replace(/^(#{2,4} [^\n]+)\n(?=[^\n])/gm, '$1\n\n')
    // Intertitre collé à la fin du paragraphe qui le précède (fin d'un tableau, T1-CONS-6 : « Vos attentes et nos
    // engagements » compté avec le tableau du périmètre et resté seul en bas de page) : paragraphe à part.
    .replace(/([^\n])\n(#{2,4} [^\n]+)/g, '$1\n\n$2');
}

/** Surtitre et titre d'une page de texte : « Notre engagement écologique : des déplacements… » → surtitre « Notre
 *  engagement écologique », titre « Des déplacements… » ; sinon surtitre = titre du bloc, titre = titre de la rubrique. */
export function surEtTitre(titreRubrique: string, titreBloc: string): [string, string] {
  const t = String(titreRubrique || '').trim();
  const i = t.indexOf(' : ');
  if (i > 0) {
    const h = t.slice(i + 3).trim();
    return [t.slice(0, i).trim(), h.charAt(0).toUpperCase() + h.slice(1)];
  }
  return [String(titreBloc || '').trim(), t];
}

/** Vrai si deux libellés sont identiques (casse, accents et apostrophes ignorés) : un surtitre qui répète le titre est masqué. */
export const memesTitres = (a: string, b: string): boolean => norm(a) === norm(b);

/** Repère de la rubrique d'une page (commentaire HTML, sans effet sur le rendu) : l'en-tête du style v3 porte le bloc,
 *  le repère permet aux contrôles de retrouver la rubrique de chaque page. */
export const repereRubrique = (t: string): string => `<!-- rubrique: "${String(t || '').replace(/["\r\n]+/g, ' ').trim().toUpperCase()}" -->`;

/** Surtitre (HTML). */
export const surtitre = (t: string): string => `<div class="gss-sur">${echapper(apostrophes(t))}</div>`;

/** En-tête de page : numéro du bloc en orange, titre du bloc (directive Marp « header », Markdown en ligne). */
export function enteteBloc(numero: number, titreBloc: string): string {
  const t = String(titreBloc || '').replace(/["\\]/g, '').replace(/[\r\n]+/g, ' ').trim();
  return `<!-- header: "**${String(numero).padStart(2, '0')}** ${t}" -->`;
}

/** Feuille de style du parcours des blocs sous l'en-tête, pour n blocs : segments séparés de 0,5 mm, bloc en cours en
 *  orange (classes bloc-1 … bloc-n de chaque page). */
export function styleParcours(n: number, structure2: string, accent: string): string {
  const segments = (ici: number) => {
    const stops: string[] = [];
    for (let i = 0; i < n; i++) {
      const c = i + 1 === ici ? accent : structure2;
      const a = `calc(${(100 * i) / n}% + ${i ? 0.25 : 0}mm)`;
      const b = `calc(${(100 * (i + 1)) / n}% - ${i < n - 1 ? 0.25 : 0}mm)`;
      stops.push(`${c} ${a}`, `${c} ${b}`);
      if (i < n - 1) stops.push(`#FFFFFF ${b}`, `#FFFFFF calc(${(100 * (i + 1)) / n}% + 0.25mm)`);
    }
    return `linear-gradient(to right, ${stops.join(', ')})`;
  };
  const regles = [`section { --gss-parcours: ${segments(0)}; }`];
  for (let k = 1; k <= n; k++) regles.push(`section.bloc-${k} { --gss-parcours: ${segments(k)}; }`);
  return `<style>\n${regles.join('\n')}\n</style>`;
}

/** Arc de veille (repris du logo GSS : l'arc et le point), dessiné en grand et discret (couverture, ouverture de bloc). */
function arcLogo(w: number, h: number, cx: number, cy: number, r: number, couleur: string, ep: number, a0: number, a1: number,
  point: [number, number, number], opacite: number): string {
  const p = (a: number) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  const large = ((a1 - a0) % 360) > 180 ? 1 : 0;
  return `<svg class="arc" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">`
    + `<path d="M${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(1)}" fill="none" stroke="${couleur}" `
    + `stroke-width="${ep}" stroke-linecap="round" opacity="${opacite}"/>`
    + `<circle cx="${point[0]}" cy="${point[1]}" r="${point[2]}" fill="${couleur}" opacity="${opacite}"/></svg>`;
}

/** Libellé d'une station du parcours : le titre du bloc, en capitales, sur 3 lignes au plus (environ 15 signes). */
function lignesStation(titre: string, max = 15): string[] {
  const mots = String(titre || '').toUpperCase().split(/\s+/).filter(Boolean);
  const lignes: string[] = [];
  let cour = '';
  for (const m of mots) {
    if (cour && (cour + ' ' + m).length > max) { lignes.push(cour); cour = m; } else cour = cour ? `${cour} ${m}` : m;
  }
  if (cour) lignes.push(cour);
  // Quatre lignes au plus (titres de partie du RC, ifits 701 : « Pièce 2-3 Moyens techniques et matériels » coupé à
  // « MATÉRI » quand la troisième ligne recevait toute la fin du titre).
  return lignes.length <= 4 ? lignes : [...lignes.slice(0, 3), lignes.slice(3).join(' ')];
}

/** Parcours du mémoire en pied d'ouverture de bloc : une station par bloc sur le fil, la station du bloc en cours en
 *  orange (seul usage de l'orange sur la page, avec le grand numéro). */
function routeBlocs(ici: number, titres: string[], c: { marine: string; accent: string; clair: string }): string {
  const w = 180, h = 30, y = 7;
  const n = titres.length;
  const xs = titres.map((_t, i) => (n === 1 ? w / 2 : 16 + (i * (w - 32)) / (n - 1)));
  const o = [`<svg class="route" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">`,
    `<line x1="${xs[0]}" y1="${y}" x2="${xs[n - 1]}" y2="${y}" stroke="#3B5B86" stroke-width="0.9"/>`];
  titres.forEach((t, k) => {
    const i = k + 1;
    const x = xs[k];
    const num = String(i).padStart(2, '0');
    if (i === ici) {
      o.push(`<circle cx="${x}" cy="${y}" r="4.6" fill="${c.accent}"/><text x="${x}" y="${y + 1.25}" text-anchor="middle" `
        + `font-family="IBM Plex Mono" font-weight="600" font-size="3.6" fill="${c.marine}">${num}</text>`);
    } else {
      o.push(`<circle cx="${x}" cy="${y}" r="3.2" fill="${c.marine}" stroke="#7F98BA" stroke-width="0.6"/><text x="${x}" `
        + `y="${y + 0.95}" text-anchor="middle" font-family="IBM Plex Mono" font-weight="600" font-size="2.6" fill="${c.clair}">${num}</text>`);
    }
    // Ligne plus longue que la place de la station (mot de plus de 15 signes, « ORGANISATIONNELS », ifits 701 : libellés de
    // deux stations voisines collés) : taille réduite pour cette station seulement.
    const maxSignes = n > 5 ? 11 : 15;
    const lignes = lignesStation(t, maxSignes);
    const plusLongue = Math.max(...lignes.map((l) => l.length));
    const taille = plusLongue > maxSignes ? (2.9 * maxSignes) / plusLongue : 2.9;
    lignes.forEach((l, j) => {
      o.push(`<text x="${x}" y="${(y + 10.6 + j * 3.6).toFixed(1)}" text-anchor="middle" font-family="IBM Plex Sans" `
        + `font-weight="${i === ici ? 600 : 500}" font-size="${+taille.toFixed(2)}" letter-spacing="${+(0.22 * taille / 2.9).toFixed(3)}" fill="${i === ici ? '#FFFFFF' : '#B5C4D8'}">${echapper(l)}</text>`);
    });
  });
  o.push('</svg>');
  return o.join('');
}

export interface CouleursV3 { marine: string; accent: string; clair: string; structure2: string }

/**
 * Taille (pt) de l'objet du marché sur la couverture : 36 pt (planche validée) tant qu'il tient entre « MÉMOIRE TECHNIQUE »
 * (100 mm) et le nom de l'acheteur (bas du bandeau marine, 23 mm) ; sinon la plus grande taille qui tient (génération réelle
 * citedia 701 : objet de 170 signes en 36 pt, débordant sur l'acheteur et coupé par le bas du bandeau). Mesure de la
 * planche : 31 signes par ligne de 167 mm en 36 pt (IBM Plex Sans Condensed gras), interligne 1,02.
 */
export function taillePoliceObjet(objet: string, client = ''): number {
  const n = String(objet || '').trim().length;
  // Jusqu'à 95 signes, 3 lignes en 36 pt (couvertures des générations réelles relues) : taille de la planche.
  const lignesClient = Math.max(1, Math.ceil(String(client || '').trim().length / 60));
  if (n <= 95 && lignesClient === 1) return 36;
  const place = 184 - 23 - lignesClient * 7.2 - 100 - 3;
  for (const pt of [36, 32, 28, 25, 22, 20, 18]) {
    // 12 % de marge pour les coupures de ligne entre les mots.
    const lignes = Math.ceil((n * 1.12) / (1113 / pt));
    if (lignes * 1.02 * pt * 0.3528 <= place) return pt;
  }
  return 16;
}

/** Couverture : haut marine (arc, logo blanc, « mémoire technique », objet, acheteur, référence), fiche de la
 *  consultation (faits de la page de garde et identité de GSS), marque. */
export function couvertureV3(cover: { client?: string; title?: string; ref?: string; objet?: string }, c: CouleursV3, date: Date = new Date()): string {
  const objet = String(cover.objet || cover.title || '').trim();
  const client = String(cover.client || '').trim();
  const ref = String(cover.ref || '').trim();
  const mois = date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const taille = (t: string) => { const pt = taillePoliceObjet(t, client); return pt < 36 ? ` style="font-size:${pt}pt"` : ''; };
  const infos: Array<[string, string]> = [];
  if (client) infos.push(['Acheteur', echapper(client)]);
  if (objet) infos.push(['Objet du marché', echapper(objet)]);
  if (ref) infos.push(['Référence', echapper(ref)]);
  infos.push(['Candidat', 'Global Security Services (GSS)<br>15 place de la Verrerie, 76100 Rouen']);
  infos.push(['Date', echapper(mois.charAt(0).toUpperCase() + mois.slice(1))]);
  return [
    '<div class="gss-couv"><div class="haut">',
    arcLogo(210, 184, 168, 120, 92, '#FFFFFF', 0.9, 198, 342, [168, 72, 5.2], 0.14),
    '<span class="logo"></span><div class="lab">MÉMOIRE TECHNIQUE</div>',
    objet ? `<div class="obj"${taille(objet)}>${echapper(apostrophes(objet))}</div>` : '',
    client ? `<div class="cli">${echapper(apostrophes(client))}</div>` : '',
    ref ? `<div class="ref">${echapper(ref)}</div>` : '',
    '</div>',
    `<dl class="infos">${infos.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl>`,
    '<div class="bas"><b>GLOBAL SECURITY SERVICES</b><span>15 place de la Verrerie, 76100 Rouen</span></div>',
    '</div>',
  ].join('');
}

/** Légende des schémas (une seule fois, sur le sommaire) : couleurs de rôle en touches, fil numéroté, filet gris. */
export function legendeRoles(roles: Record<string, string>, pictos: Record<string, string>, c: CouleursV3, filet: string): string {
  const ic = (contenu: string) => `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">${contenu}</svg>`;
  const plaque = (role: string, picto: string) => ic(`<rect x="4" y="4" width="32" height="32" rx="3" fill="${roles[role]}"/>`
    + `<g transform="translate(9,9) scale(0.0859)" fill="#FFFFFF">${pictos[picto] || ''}</g>`);
  const items: Array<[string, string]> = [
    [plaque('vert', 'check'), '<b>Vert</b> : l’issue, le point d’arrivée'],
    [plaque('rouge', 'alerte'), '<b>Rouge</b> : le déclencheur, l’alerte'],
    [plaque('bleu', 'loupe'), '<b>Bleu acier</b> : le contrôle'],
    [plaque('orange', 'main'), '<b>Brique</b> : l’action'],
    [ic(`<line x1="20" y1="2" x2="20" y2="38" stroke="${c.marine}" stroke-width="3"/><circle cx="20" cy="20" r="10" fill="${c.marine}"/>`
      + '<text x="20" y="24" text-anchor="middle" font-family="IBM Plex Mono" font-weight="600" font-size="11" fill="#fff">01</text>'),
    '<b>Fil marine numéroté</b> : des étapes, dans l’ordre'],
    [ic(`<circle cx="20" cy="20" r="9" fill="${c.marine}"/><line x1="27" y1="13" x2="37" y2="3" stroke="${filet}" stroke-width="3"/>`
      + `<line x1="13" y1="27" x2="3" y2="37" stroke="${filet}" stroke-width="3"/>`), '<b>Filet gris</b> : un ensemble, sans ordre'],
  ];
  return '<div class="legende-roles"><div class="lt">Lire les schémas de ce mémoire</div><div class="lg">'
    + items.map(([a, b]) => `<div class="li">${a}<span>${b}</span></div>`).join('') + '</div></div>';
}

/** Sommaire : une entrée par bloc (numéro, titre, rubriques sur deux colonnes), réparti sur autant de pages que nécessaire
 *  (hauteur estimée), la légende des schémas sur la dernière page. Renvoie le Markdown des pages (sans séparateur initial). */
export function sommaireV3(blocs: Array<{ numero: number; titre: string; rubriques: string[]; page?: number }>, client: string, legende: string): string[] {
  // Hauteur d'une entrée (mm) : marges et titre (15,5 mm), puis les rubriques sur deux colonnes de 68 mm (colonne de la page
  // du bloc à droite ; 8,8 pt : environ 35 signes par ligne, 4,35 mm par ligne et 1,1 mm entre rubriques).
  const h = (b: { rubriques: string[] }) => {
    const lignes = b.rubriques.map((r) => Math.max(1, Math.ceil(r.length / 35)) * 4.35 + 1.1);
    const total = lignes.reduce((a, x) => a + x, 0);
    return 15.5 + Math.max(total / 2 + 4.4, Math.max(0, ...lignes));
  };
  const place = 255 - 24;            // hauteur utile sous le surtitre et le titre (mm)
  const pages: Array<typeof blocs> = [[]];
  let cumul = 0;
  for (const b of blocs) {
    if (pages[pages.length - 1].length && cumul + h(b) > place) { pages.push([]); cumul = 0; }
    pages[pages.length - 1].push(b);
    cumul += h(b);
  }
  if (cumul + 36 > place) pages.push([]);
  return pages.map((p, i) => {
    const compact = p.reduce((n, b) => n + h(b), 0) > place * 0.92;
    // Page de l'ouverture du bloc à droite de l'entrée, comme la planche (T2-CONS-12).
    const entrees = p.map((b) => `<div class="entree"><div class="n">${String(b.numero).padStart(2, '0')}</div><div><div class="t">`
      + `${echapper(apostrophes(b.titre))}</div><ul>${b.rubriques.map((r) => `<li>${echapper(apostrophes(r))}</li>`).join('')}</ul></div>`
      + `<div class="p">${b.page ? b.page : ''}</div></div>`).join('');
    return [`<!-- _class: sommaire${compact ? ' compact' : ''} -->`, '<!-- _header: "Mémoire technique" -->', '',
      surtitre(`Mémoire technique${client ? ` · ${client}` : ''}`), '', `# Sommaire${i ? ' (suite)' : ''}`, '',
      entrees + (i === pages.length - 1 ? legende : ''), ''].join('\n');
  });
}

/** Ouverture de bloc : arc, logo blanc, « mémoire technique · acheteur », grand numéro orange, titre du bloc, rubriques du
 *  bloc, parcours du mémoire (une station par bloc). */
export function ouvertureV3(numero: number, titre: string, rubriques: string[], titresBlocs: string[], client: string, c: CouleursV3): string {
  const compacte = rubriques.length > 8;
  return [
    '<div class="gss-ouv">',
    arcLogo(210, 297, 172, 64, 40, '#FFFFFF', 0.9, 200, 340, [172, 44, 3.2], 0.16),
    '<span class="logo"></span>',
    `<div class="lab">Mémoire technique${client ? ` · ${echapper(apostrophes(client))}` : ''}</div>`,
    `<div class="num">${String(numero).padStart(2, '0')}</div>`,
    `<div class="titre">${echapper(apostrophes(titre))}</div>`,
    `<ul${compacte ? ' class="compacte"' : ''}>${rubriques.map((r) => `<li>${echapper(apostrophes(r))}</li>`).join('')}</ul>`,
    routeBlocs(numero, titresBlocs, c),
    '</div>',
  ].join('');
}

/** « L'essentiel » d'une page de texte court : la première phrase du texte de la rubrique, citée mot pour mot (40 à 240
 *  signes), hors intertitres, listes et tableaux ; null s'il n'y en a pas. */
export function essentielV3(texte: string): string | null {
  const brut = (t: string) => t.replace(/\\([\\()[\]{}])/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\s+/g, ' ').trim();
  for (const para of texte.split(/\n{2,}/)) {
    // Lignes du paragraphe avant une éventuelle liste (« … une procédure précise :\n1. … ») : la phrase citée n'emprunte
    // jamais le début d'une liste.
    const lignes: string[] = [];
    for (const l of para.trim().split('\n')) {
      if (/^\s*([-*] |\d+[.)] |\||<)/.test(l)) break;
      lignes.push(l);
    }
    const p = lignes.join(' ').trim();
    if (!p || /^(#|[-*] |\d+\. |\||<)/.test(para.trim())) continue;
    const t = brut(p);
    const m = /^(.{40,240}?[.!?])(?=\s|$)/.exec(t);
    if (!m) return null;
    return `<div class="gss-essentiel"><div class="lab">L’essentiel</div><blockquote>${echapper(apostrophes(m[1]))}</blockquote></div>`;
  }
  return null;
}

/** Nombre de signes du texte affiché (Markdown retiré) : gabarit « texte court » sous SEUIL_TEXTE_COURT. */
export const signes = (texte: string): number => texte.replace(/\\([\\()[\]{}])/g, '$1').replace(/[#*_|`>]/g, '').replace(/\s+/g, ' ').trim().length;
