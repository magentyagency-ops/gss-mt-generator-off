import { DateEcheance, Lot, SourceMeta, ExtractionMethod } from '../schemas/common';
import { RCDocument, PieceAFournir, CriteresNotation, Visite, ModalitesRemise, TypePiece, SousCritere } from '../schemas/rc';
import { extractDocText, loadDocxText } from '../ingestion/docConverter';

const MONTHS_FR: Record<string, number> = {
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11,
  decembre: 12,
};

const DATE_RE = /(\d{1,2})\s+([A-Za-zéûôîèà]+)\s+(\d{4})/i;
const CPV_RE = /\b(\d{8}-\d)\b/g;

// Sous-critère regex
const SOUSCRIT_RE = /^(.+?)\s*:\s*(\d+)\s*points?\s*(?:\(([^)]*)\))?[\s,.;]*$/i;

// Section regex.
// Deux formes acceptées, car les RC ne suivent pas tous le gabarit de Rouen :
//   - « 4.1 – Pièces de la candidature », « Article 7 – Présentation… » : séparateur explicite ;
//   - « 7.1 Pièces de la candidature »                                 : numéro puis titre, sans
//     séparateur. Cette 2e forme est ambiguë (« 12 mois de préavis » y ressemble), on exige donc
//     une initiale MAJUSCULE et on la marque « faible » (cf. `strong` plus bas) pour qu'un vrai
//     titre l'emporte toujours en cas de collision de numéro.
const SECTION_RE = /^\s*(?:[Aa]rticles?\s+)?(\d{1,2}(?:\.\d{1,2})?)\s*(?:[–—\-.)]\s*(.+?)|\s+([A-ZÀ-ÝŒ][^\n]{2,120}?))\s*$/;

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function parseFrDate(text: string): string | null {
  const m = DATE_RE.exec(text);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const monthStr = stripAccents(m[2]).toLowerCase();
  const year = parseInt(m[3], 10);
  const month = MONTHS_FR[monthStr];
  if (!month) return null;

  try {
    const d = new Date(Date.UTC(year, month - 1, day));
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0];
  } catch (e) {
    return null;
  }
}

class Section {
  num: string;
  title: string;
  start: number;
  end: number = -1;
  lines: string[] = [];
  /** Titre reconnu avec un séparateur explicite (« 4.1 – Titre ») : prioritaire sur « 7.1 Titre ». */
  strong: boolean;

  constructor(num: string, title: string, start: number, strong = true) {
    this.num = num;
    this.title = title;
    this.start = start;
    this.strong = strong;
  }

  get text(): string {
    return this.lines.join('\n').trim();
  }
}

function splitSections(lines: string[]): Section[] {
  const raw: Section[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = SECTION_RE.exec(line);
    if (m) {
      // m[2] = titre avec séparateur (fort), m[3] = titre sans séparateur (faible).
      raw.push(new Section(m[1], (m[2] ?? m[3]).trim(), i, m[2] !== undefined));
    }
  }

  // Set boundary ends
  for (let idx = 0; idx < raw.length; idx++) {
    const nxt = idx + 1 < raw.length ? raw[idx + 1].start : lines.length;
    raw[idx].end = nxt;
    raw[idx].lines = lines.slice(raw[idx].start + 1, nxt);
  }

  // Deduplicate table of contents: keep the longest section by num.
  // Un titre « fort » (avec séparateur) l'emporte toujours sur un titre « faible » de même
  // numéro, même plus long : « 12 Mois de préavis » ne doit pas évincer « 12 – Sous-traitance ».
  const byNum: Record<string, Section> = {};
  for (const sec of raw) {
    const prev = byNum[sec.num];
    if (!prev) { byNum[sec.num] = sec; continue; }
    if (sec.strong !== prev.strong) {
      if (sec.strong) byNum[sec.num] = sec;
    } else if (sec.text.length > prev.text.length) {
      byNum[sec.num] = sec;
    }
  }

  return Object.values(byNum);
}

function findSection(sections: Section[], num: string): Section | null {
  return sections.find(s => s.num === num) || null;
}

/**
 * Retrouve une section par son TITRE. Indispensable : la numérotation des pièces à fournir
 * varie d'un acheteur à l'autre (« 4.1 » à Rouen, « 7.1 » ailleurs, parfois « 3.2 »), alors
 * que l'intitulé, lui, dit toujours « Pièces de la candidature » / « Pièces de l'offre ».
 */
function findSectionByTitle(sections: Section[], re: RegExp): Section | null {
  return sections.find(s => re.test(s.title)) || null;
}

const TITRE_CANDIDATURE = /pi[eè]ces?\b.{0,20}\bcandidatures?\b|dossier\s+de\s+candidature/i;
const TITRE_OFFRE = /pi[eè]ces?\b.{0,20}\boffres?\b|contenu\s+de\s+l['’\s]*offre/i;

/**
 * Motifs des pièces à fournir. `famille` évite les doublons dans la check-list : plusieurs
 * motifs décrivent la même pièce selon le vocabulaire de l'acheteur (« attestation d'assurance »
 * vs « responsabilité civile professionnelle »), on ne garde que le PREMIER de chaque famille —
 * d'où l'ordre : du libellé le plus spécifique au plus générique.
 */
type PieceSpec = { famille: string; pattern: string; label: string };

const PIECES_CANDIDATURE: PieceSpec[] = [
  { famille: 'honneur', pattern: 'd[ée]claration sur l.honneur', label: "Déclaration sur l'honneur" },
  { famille: 'lettre_candidature', pattern: '\\bDC1\\b', label: 'DC1 — Lettre de candidature' },
  { famille: 'lettre_candidature', pattern: 'lettre de candidature', label: 'Lettre de candidature' },
  { famille: 'dc2', pattern: '\\bDC2\\b', label: 'DC2 — Déclaration du candidat' },
  { famille: 'kbis', pattern: '\\bk\\s*[-]?\\s*bis\\b|extrait\\s+k', label: 'Extrait Kbis' },
  { famille: 'note_presentation', pattern: 'note de pr[ée]sentation', label: "Note de présentation de l'entreprise" },
  { famille: 'references', pattern: 'r[ée]f[ée]rences.*?(moins de\\s*)?3\\s*ans|liste.*?r[ée]f[ée]rences|r[ée]f[ée]rences de prestations', label: 'Liste de références (< 3 ans)' },
  { famille: 'fiscale', pattern: 'r[ée]gularit[ée].*fiscale|attestation.*fiscale|obligations sociales et fiscales', label: 'Attestation de régularité fiscale et sociale' },
  // Assurance : la formulation « RC professionnelle » est la plus courante hors marchés publics.
  { famille: 'assurance', pattern: 'assurance.{0,60}responsabilit[ée] civile|responsabilit[ée] civile professionnelle', label: "Attestation d'assurance RC professionnelle" },
  { famille: 'assurance', pattern: 'attestations?\\s*d.assurance', label: "Attestations d'assurance" },
  // Spécifique sécurité privée : sans agrément CNAPS l'offre est irrecevable.
  { famille: 'cnaps', pattern: '\\bCNAPS\\b|autorisation d.exercice|agr[ée]ment des dirigeants', label: "Autorisation d'exercice CNAPS / agrément des dirigeants" },
  { famille: 'cartes_pro', pattern: 'cartes?\\s+professionnelles?', label: 'Cartes professionnelles des agents' },
  { famille: 'qualifications', pattern: '\\bSSIAP\\b|\\bCQP\\s*APS\\b|\\bSST\\b', label: 'Qualifications des agents (SSIAP / CQP APS / SST)' },
  { famille: 'ca', pattern: 'chiffres?\\s+d.affaires', label: "Chiffre d'affaires des 3 derniers exercices" },
];
const PIECE_DUME: PieceSpec = { famille: 'dume', pattern: '\\bDUME\\b', label: 'DUME (alternative à DC1/DC2)' };

const PIECES_OFFRE: PieceSpec[] = [
  { famille: 'acte_engagement', pattern: 'acte d.engagement', label: "Acte d'Engagement complété, daté et signé" },
  { famille: 'bpu', pattern: '\\bBPU\\b|bordereau de prix', label: 'BPU / bordereau de prix (annexe financière)' },
  { famille: 'dpgf', pattern: '\\bDPGF\\b|d[ée]composition du prix', label: 'DPGF — Décomposition du Prix Global et Forfaitaire' },
  { famille: 'memoire', pattern: 'm[ée]moire technique', label: 'Mémoire technique valant cadre de réponse' },
  { famille: 'paraphes', pattern: '(?:CCAP|CCTP)[^\\n]{0,40}(?:paraph|accept[ée]s? sans r[ée]serve)', label: 'CCAP et CCTP paraphés et acceptés sans réserve' },
  { famille: 'sous_traitance', pattern: 'sous.?trait', label: "Demandes d'acceptation des sous-traitants (le cas échéant)" },
  { famille: 'rib', pattern: '\\bRIB\\b', label: "RIB de l'entreprise" },
];

function extractPieces(section: Section | null, specs: PieceSpec[], type: TypePiece): PieceAFournir[] {
  const pieces: PieceAFournir[] = [];
  if (!section) return pieces;
  const text = section.text;
  const vues = new Set<string>();

  for (const spec of specs) {
    if (vues.has(spec.famille)) continue;
    const re = new RegExp(spec.pattern, 'i');
    if (re.test(text)) {
      vues.add(spec.famille);
      const ref = section.lines.find(ln => re.test(ln)) || null;
      pieces.push({
        nom: spec.label,
        type,
        obligatoire: true,
        alternative: null,
        ref_texte: ref ? ref.trim() : null,
      });
    }
  }
  return pieces;
}

function extractObjet(lines: string[], sections: Section[]): string | null {
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (ln.toLowerCase().includes('ayant pour objet')) {
      const after = ln.includes(':') ? ln.split(':', 2)[1].trim() : '';
      const parts = after ? [after] : [];
      for (const nxt of lines.slice(i + 1, i + 4)) {
        const s = nxt.trim();
        if (!s || s.toLowerCase().includes('mode de passation')) {
          break;
        }
        parts.push(s);
      }
      let objet = parts.join(' ').trim();
      objet = objet.replace(/(\w)-\s+(\w)/g, '$1-$2');
      if (objet) return objet;
    }
  }
  const sec = findSection(sections, '1.1') || findSection(sections, '1');
  if (sec && sec.text) {
    return sec.text.split('\n')[0].trim();
  }
  return null;
}

function extractAcheteur(lines: string[]): string | null {
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (ln.toLowerCase().includes('pouvoir adjudicateur')) {
      for (const nxt of lines.slice(i + 1, i + 6)) {
        const s = nxt.trim();
        if (s && s[0] === s[0].toUpperCase() && stripAccents(s).toLowerCase().includes('universit')) {
          return s;
        }
      }
    }
  }
  const fullText = lines.join('\n');
  const m = /\b(UNIVERSIT[EÉ]\s+DE\s+[A-ZÉÈÀ ]{3,})/i.exec(fullText);
  return m ? m[1].trim() : null;
}

function extractCcag(lines: string[]): string | null {
  const m = /CCAG\s*[–\-]?\s*([A-Z]{2,4})/i.exec(lines.join('\n'));
  return m ? `CCAG-${m[1].toUpperCase()}` : null;
}

function extractCpv(lines: string[]): string[] {
  const fullText = lines.join('\n');
  const found: string[] = [];
  let m;
  const regex = new RegExp(CPV_RE);
  while ((m = regex.exec(fullText)) !== null) {
    found.push(m[1]);
  }
  return Array.from(new Set(found)).sort();
}

function extractAllotissement(sections: Section[]): Lot[] {
  const sec = findSection(sections, '1.4');
  if (!sec) return [];
  const lots: Lot[] = [];
  const lines = sec.lines.map(ln => ln.trim());

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (/^[1-9]$/.test(ln)) {
      const intitule = lines.slice(i + 1, i + 4).find(x => x && !/^[\d\s,.\-]+$/.test(x)) || null;
      if (intitule && !lots.some(lot => lot.numero === parseInt(ln, 10))) {
        let perimetre: string | null = null;
        const mdept = /département\s*(\d{2})/i.exec(intitule);
        if (mdept) {
          perimetre = `Département ${mdept[1]}`;
        } else if (intitule.toLowerCase().includes('télé') || stripAccents(intitule).toLowerCase().includes('tele')) {
          perimetre = 'Télésécurité';
        }
        lots.push({ numero: parseInt(ln, 10), intitule, perimetre });
      }
    }
  }
  return lots;
}

function extractDuree(sections: Section[]): string | null {
  const sec = findSection(sections, '1.9');
  return sec && sec.text ? sec.text.split(/\s+/).join(' ').trim() : null;
}

function extractVisite(sections: Section[]): Visite {
  const sec = findSection(sections, '2.6');
  if (!sec) return { prevue: false, obligatoire: null, dates: [], lieu: null, ref_texte: null };
  const text = sec.text;
  const low = text.toLowerCase();
  if (!text || low.includes('sans objet')) {
    return { prevue: false, obligatoire: null, dates: [], lieu: null, ref_texte: text || null };
  }
  const obligatoire = low.includes('obligatoire');
  const dates: DateEcheance[] = [];

  for (const ln of sec.lines) {
    const lnLow = ln.toLowerCase();
    if (/pr[ée]vue|aura lieu|organis/i.test(ln) || DATE_RE.test(ln)) {
      const d = parseFrDate(ln);
      if (d || lnLow.includes('visite')) {
        dates.push({
          libelle: 'Visite des locaux',
          valeur: d,
          texte_brut: d === null ? ln.trim() : null,
        });
      }
    }
  }

  let lieu: string | null = null;
  for (let i = 0; i < sec.lines.length; i++) {
    if (sec.lines[i].toLowerCase().includes('lieu de rendez-vous')) {
      lieu = sec.lines.slice(i + 1, i + 4).map(x => x.trim()).filter(Boolean).join(' ') || null;
      break;
    }
  }

  return {
    prevue: true,
    obligatoire,
    dates: dates.some(d => d.valeur !== null) ? dates.filter(d => d.valeur !== null) : dates,
    lieu,
    ref_texte: text.substring(0, 500),
  };
}

function scopeToLots(scope: string | null): number[] {
  if (!scope) return [];
  const low = scope.toLowerCase();
  if (low.includes('tous')) return [];
  const lots: number[] = [];
  const m = low.match(/\d+/g);
  if (m) {
    for (const n of m) {
      lots.push(parseInt(n, 10));
    }
  }
  return lots;
}

function extractCriteres(sections: Section[]): CriteresNotation | null {
  const sec = findSection(sections, '6');
  if (!sec) return null;
  let vt: number | null = null;
  let prix: number | null = null;
  const sous: SousCritere[] = [];

  for (const ln of sec.lines) {
    const s = ln.trim();
    if (!s) continue;
    const m = SOUSCRIT_RE.exec(s);
    if (!m) continue;
    const lib = m[1].trim().replace(/^«|»$/g, '').trim();
    const pts = parseFloat(m[2]);
    const low = stripAccents(lib).toLowerCase();
    if (low.startsWith('valeur technique')) {
      vt = pts;
    } else if (low.startsWith('prix')) {
      prix = pts;
    } else {
      sous.push({
        libelle: lib,
        points: pts,
        lots: scopeToLots(m[3] || null),
      });
    }
  }
  if (vt === null && prix === null && sous.length === 0) return null;
  return {
    valeur_technique_pts: vt || 0,
    prix_pts: prix || 0,
    sous_criteres: sous,
  };
}

function extractModalites(lines: string[]): ModalitesRemise {
  const joined = lines.join('\n');
  let plateforme: string | null = null;
  const mplat = /(achatpublic\.com|[\w.-]+\.nukema\.com|[\w.-]+marches[\w.-]*)/i.exec(joined);
  if (mplat) {
    plateforme = mplat[1];
  }

  const signature_formats: string[] = [];
  for (const fmt of ['XAdES', 'CAdES', 'PAdES']) {
    const re = new RegExp(fmt, 'i');
    if (re.test(joined)) {
      signature_formats.push(fmt);
    }
  }
  if (signature_formats.length === 0 && /signature\s+électronique|\bRGS\b/i.test(joined)) {
    signature_formats.push('Signature électronique (RGS)');
  }

  let date_limite: DateEcheance | null = null;
  for (const ln of lines) {
    if (ln.toLowerCase().includes('date limite') && ln.toLowerCase().includes('offre')) {
      date_limite = {
        libelle: 'Date limite de dépôt des offres',
        valeur: parseFrDate(ln),
        texte_brut: ln.trim(),
      };
      break;
    }
  }

  return {
    plateforme,
    signature_formats,
    date_limite,
  };
}

export function parseRc(filePath: string): RCDocument {
  const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();

  let text = '';
  let method: ExtractionMethod;

  if (ext === '.doc') {
    const res = extractDocText(filePath);
    text = res.text;
    method = res.method;
  } else if (ext === '.docx') {
    text = loadDocxText(filePath);
    method = ExtractionMethod.DOCX_NATIVE;
  } else {
    throw new Error(`parseRc attend un .doc ou .docx (reçu ${ext}).`);
  }

  return parseRcText(text, method, filePath);
}

/**
 * Cœur du parseur, séparé de la lecture du fichier : permet de le tester sur des extraits
 * de RC réels (cf. tests/rcParser.pieces.test.ts) sans fabriquer un .docx.
 */
export function parseRcText(text: string, method: ExtractionMethod, filePath: string): RCDocument {
  const warnings: string[] = [];
  const lines = text.split(/\r?\n/).map(ln => ln.trimEnd());
  const sections = splitSections(lines);
  if (sections.length === 0) {
    warnings.push('Aucune section numérotée détectée — structure inattendue.');
  }

  // Le TITRE prime sur le numéro : « 4.1 » n'est le bon numéro que dans le gabarit de Rouen.
  const secCand = findSectionByTitle(sections, TITRE_CANDIDATURE) || findSection(sections, '4.1');
  const piecesCand = extractPieces(secCand, PIECES_CANDIDATURE, TypePiece.CANDIDATURE);
  const dume = extractPieces(secCand, [PIECE_DUME], TypePiece.CANDIDATURE);
  for (const p of dume) {
    p.obligatoire = false;
    p.alternative = 'Remplace DC1+DC2';
  }
  piecesCand.push(...dume);

  const secOffre = findSectionByTitle(sections, TITRE_OFFRE) || findSection(sections, '4.2');
  const piecesOffre = extractPieces(secOffre, PIECES_OFFRE, TypePiece.OFFRE);

  const criteres = extractCriteres(sections);
  if (!criteres) {
    warnings.push('Barème de notation non détecté (section 6).');
  }
  if (piecesCand.length === 0) {
    warnings.push(
      secCand
        ? `Aucune pièce de candidature reconnue dans « ${secCand.title} » — vocabulaire inconnu.`
        : 'Aucune section « pièces de la candidature » trouvée dans le RC.',
    );
  }
  if (piecesOffre.length === 0) {
    warnings.push(
      secOffre
        ? `Aucune pièce d'offre reconnue dans « ${secOffre.title} » — vocabulaire inconnu.`
        : "Aucune section « pièces de l'offre » trouvée dans le RC.",
    );
  }

  return {
    objet: extractObjet(lines, sections),
    acheteur: extractAcheteur(lines),
    ccag: extractCcag(lines),
    cpv: extractCpv(lines),
    duree: extractDuree(sections),
    allotissement: extractAllotissement(sections),
    visite: extractVisite(sections),
    pieces_candidature: piecesCand,
    pieces_offre: piecesOffre,
    criteres,
    modalites_remise: extractModalites(lines),
    source: {
      fichier: filePath.substring(filePath.lastIndexOf('/') + 1).substring(filePath.lastIndexOf('\\') + 1),
      methode_extraction: method,
      warnings,
    },
  };
}
