import OpenAI from 'openai';
import { getSettings } from '../core/config';
import { extractText } from '../ingestion/docConverter';
import { ExtractionMethod } from '../schemas/common';
import {
  RCDocument,
  TypePiece,
  PieceAFournir,
  CriteresNotation,
  Visite,
  ModalitesRemise,
} from '../schemas/rc';
import {
  CCTPDocument,
  TypePrestation,
  CategorieExigence,
  Prestation,
  ExigenceAgent,
} from '../schemas/cctp';
import { Lot, DateEcheance } from '../schemas/common';
import { parseRc } from './rcParser';
import { parseCctp } from './cctpParser';

const EXTRACTION_MODEL = process.env.EXTRACTION_MODEL || 'gpt-5.6-luna';

// Garde-fou : on borne la taille du texte envoyé au LLM (les RC/CCTP dépassent
// rarement quelques dizaines de milliers de caractères ; au-delà on tronque).
const MAX_CHARS = 120_000;

function getClient(): OpenAI | null {
  const settings = getSettings();
  if (!settings.openaiApiKey) return null;
  return new OpenAI({ apiKey: settings.openaiApiKey });
}

function basename(filePath: string): string {
  return filePath.substring(filePath.lastIndexOf('/') + 1).substring(filePath.lastIndexOf('\\') + 1);
}

async function callJson(client: OpenAI, system: string, user: string): Promise<any> {
  const completion = await client.chat.completions.create({
    model: EXTRACTION_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 1,
  });
  const content = completion.choices[0].message.content || '{}';
  return JSON.parse(content);
}

// ---------- Normalisation défensive ----------

function asString(v: any): string | null {
  if (typeof v === 'string') {
    const t = v.trim();
    return t || null;
  }
  return null;
}

function asBool(v: any): boolean {
  return v === true || v === 'true' || v === 'oui';
}

function asNumber(v: any): number | null {
  if (typeof v === 'number' && !isNaN(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(',', '.'));
    if (!isNaN(n)) return n;
  }
  return null;
}

function asArray(v: any): any[] {
  return Array.isArray(v) ? v : [];
}

function asIsoDate(v: any): string | null {
  const s = asString(v);
  if (!s) return null;
  // On accepte uniquement un YYYY-MM-DD plausible ; sinon null (le texte brut reste dispo).
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : `${m[1]}-${m[2]}-${m[3]}`;
}

function normDateEcheance(v: any, libelleDefaut: string): DateEcheance | null {
  if (!v || typeof v !== 'object') return null;
  const valeur = asIsoDate(v.valeur);
  const texte = asString(v.texte_brut) || asString(v.valeur);
  if (!valeur && !texte) return null;
  return {
    libelle: asString(v.libelle) || libelleDefaut,
    valeur,
    texte_brut: valeur ? asString(v.texte_brut) : texte,
  };
}

// ---------- RC ----------

const RC_SYSTEM = `Tu es un analyste expert en marchés publics français (commande publique).
On te fournit le texte intégral d'un Règlement de Consultation (RC), quel que soit l'acheteur
(mairie, hôpital, université, bailleur, entreprise privée, syndicat, etc.) et quelle que soit
sa numérotation ou sa mise en page.

Ta mission : EXTRAIRE les informations dans un JSON STRICT. Ne déduis jamais une numérotation de
section ; lis le contenu réel. Si une information est absente, mets null (ou liste vide). Ne fabrique
JAMAIS de valeur. Les dates DOIVENT être au format ISO AAAA-MM-JJ (sinon null, et garde le libellé
d'origine dans texte_brut).

FORMAT JSON ATTENDU :
{
  "objet": "objet précis du marché ou null",
  "acheteur": "nom complet de l'acheteur / pouvoir adjudicateur, ou null",
  "ccag": "CCAG applicable normalisé ex 'CCAG-FCS', 'CCAG-PI', ou null",
  "cpv": ["codes CPV au format 12345678-9"],
  "duree": "durée du marché en clair, ou null",
  "allotissement": [
    { "numero": 1, "intitule": "intitulé du lot", "perimetre": "périmètre géographique/fonctionnel ou null" }
  ],
  "visite": {
    "prevue": true/false,
    "obligatoire": true/false/null,
    "dates": [ { "libelle": "Visite des locaux", "valeur": "AAAA-MM-JJ ou null", "texte_brut": "texte d'origine ou null" } ],
    "lieu": "lieu de RDV ou null",
    "ref_texte": "extrait pertinent ou null"
  },
  "pieces_candidature": [
    { "nom": "intitulé de la pièce", "obligatoire": true/false, "alternative": "ex 'Remplace DC1+DC2' ou null", "ref_texte": "extrait ou null" }
  ],
  "pieces_offre": [
    { "nom": "intitulé de la pièce", "obligatoire": true/false, "alternative": null, "ref_texte": "extrait ou null" }
  ],
  "criteres": {
    "valeur_technique_pts": 60,
    "prix_pts": 40,
    "sous_criteres": [ { "libelle": "sous-critère", "points": 20, "lots": [1,2] } ]
  },
  "modalites_remise": {
    "plateforme": "nom/URL de la plateforme de dépôt ou null",
    "signature_formats": ["XAdES", "CAdES", "PAdES" ...],
    "date_limite": { "libelle": "Date limite de dépôt des offres", "valeur": "AAAA-MM-JJ ou null", "texte_brut": "texte d'origine ou null" }
  },
  "analyse_risques": [
    { "titre": "titre de l'alerte/risque (ex: Pénalités atypiques)", "detail": "description", "type": "warning | destructive | primary" }
  ]
}
Si la consultation n'est pas allotie, renvoie allotissement: []. Si pas de barème, criteres: null. S'il n'y a pas de risque majeur, analyse_risques: [].`;

function normPieces(raw: any, type: TypePiece): PieceAFournir[] {
  return asArray(raw)
    .map((p): PieceAFournir | null => {
      const nom = asString(p?.nom);
      if (!nom) return null;
      return {
        nom,
        type,
        obligatoire: p?.obligatoire === undefined ? true : asBool(p.obligatoire),
        alternative: asString(p?.alternative),
        ref_texte: asString(p?.ref_texte),
      };
    })
    .filter((p): p is PieceAFournir => p !== null);
}

function normCriteres(raw: any): CriteresNotation | null {
  if (!raw || typeof raw !== 'object') return null;
  const vt = asNumber(raw.valeur_technique_pts);
  const prix = asNumber(raw.prix_pts);
  const sous = asArray(raw.sous_criteres)
    .map((s) => {
      const libelle = asString(s?.libelle);
      const points = asNumber(s?.points);
      if (!libelle || points === null) return null;
      return {
        libelle,
        points,
        lots: asArray(s?.lots).map((n) => asNumber(n)).filter((n): n is number => n !== null),
      };
    })
    .filter((s): s is { libelle: string; points: number; lots: number[] } => s !== null);
  if (vt === null && prix === null && sous.length === 0) return null;
  return { valeur_technique_pts: vt || 0, prix_pts: prix || 0, sous_criteres: sous };
}

function normVisite(raw: any): Visite {
  if (!raw || typeof raw !== 'object') {
    return { prevue: false, obligatoire: null, dates: [], lieu: null, ref_texte: null };
  }
  const dates = asArray(raw.dates)
    .map((d) => normDateEcheance(d, 'Visite des locaux'))
    .filter((d): d is DateEcheance => d !== null);
  return {
    prevue: asBool(raw.prevue),
    obligatoire: raw.obligatoire === null || raw.obligatoire === undefined ? null : asBool(raw.obligatoire),
    dates,
    lieu: asString(raw.lieu),
    ref_texte: asString(raw.ref_texte),
  };
}

function normModalites(raw: any): ModalitesRemise {
  if (!raw || typeof raw !== 'object') {
    return { plateforme: null, signature_formats: [], date_limite: null };
  }
  return {
    plateforme: asString(raw.plateforme),
    signature_formats: asArray(raw.signature_formats).map(asString).filter((s): s is string => s !== null),
    date_limite: normDateEcheance(raw.date_limite, 'Date limite de dépôt des offres'),
  };
}

function normAllotissement(raw: any): Lot[] {
  return asArray(raw)
    .map((l): Lot | null => {
      const numero = asNumber(l?.numero);
      const intitule = asString(l?.intitule);
      if (numero === null || !intitule) return null;
      return { numero, intitule, perimetre: asString(l?.perimetre) };
    })
    .filter((l): l is Lot => l !== null);
}

export async function extractRcWithLLM(filePath: string): Promise<RCDocument> {
  const client = getClient();
  if (!client) return parseRc(filePath);

  const warnings: string[] = [];
  let text: string;
  try {
    text = await extractText(filePath);
  } catch (e: any) {
    // Pas de texte exploitable → on tente le parser legacy (gère .doc/.docx).
    return parseRc(filePath);
  }
  if (text.length > MAX_CHARS) {
    warnings.push(`Texte tronqué à ${MAX_CHARS} caractères pour l'extraction LLM.`);
    text = text.slice(0, MAX_CHARS);
  }

  try {
    const data = await callJson(client, RC_SYSTEM, `TEXTE DU RÈGLEMENT DE CONSULTATION :\n\n${text}`);
    const piecesCand = normPieces(data.pieces_candidature, TypePiece.CANDIDATURE);
    const piecesOffre = normPieces(data.pieces_offre, TypePiece.OFFRE);
    const criteres = normCriteres(data.criteres);

    if (!criteres) warnings.push('Barème de notation non détecté.');
    if (piecesCand.length === 0) warnings.push('Aucune pièce de candidature détectée.');
    if (piecesOffre.length === 0) warnings.push("Aucune pièce d'offre détectée.");

    return {
      objet: asString(data.objet),
      acheteur: asString(data.acheteur),
      ccag: asString(data.ccag),
      cpv: asArray(data.cpv).map(asString).filter((s): s is string => s !== null),
      duree: asString(data.duree),
      allotissement: normAllotissement(data.allotissement),
      visite: normVisite(data.visite),
      pieces_candidature: piecesCand,
      pieces_offre: piecesOffre,
      criteres,
      modalites_remise: normModalites(data.modalites_remise),
      analyse_risques: asArray(data.analyse_risques),
      source: {
        fichier: basename(filePath),
        methode_extraction: ExtractionMethod.DOCX_NATIVE,
        warnings,
      },
    };
  } catch (e: any) {
    console.warn('[llmExtractor] Échec extraction LLM RC, repli sur parser regex:', e?.message);
    return parseRc(filePath);
  }
}

// ---------- CCTP ----------

const CCTP_SYSTEM = `Tu es un analyste expert en marchés publics français de prestations de sécurité privée
(gardiennage, surveillance, télésécurité). On te fournit le texte intégral d'un CCTP (cahier des
charges techniques), quel que soit l'acheteur et quelle que soit sa mise en page.

Ta mission : EXTRAIRE un JSON STRICT décrivant les prestations attendues et les exigences sur les
agents. Lis le contenu réel, n'invente rien, mets null/[] si absent.

FORMAT JSON ATTENDU :
{
  "objet": "objet du marché ou null",
  "prestations": [
    { "type": "base | supplementaire | telesecurite", "lot": 1 ou null, "campus": "site/zone concerné ou null", "description": "description de la prestation" }
  ],
  "exigences_agents": [
    { "categorie": "qualification | equipement | tenue | comportement | vehicule | autre", "libelle": "intitulé de l'exigence", "valeur": "détail ou null" }
  ],
  "contraintes_site": ["contrainte d'accès/zone (ZRR, filtrage, badge, etc.)"],
  "reprise_personnel": true/false/null,
  "synthese_projet": [
    { "titre": "Titre du point fort", "description": "Résumé descriptif (ex: objet, volume, horaires)" }
  ]
}
Pour 'type' : 'base' = prestation principale permanente, 'supplementaire' = à la demande/optionnelle,
'telesecurite' = télésurveillance/levée de doute à distance.`;

const PRESTATION_TYPES = new Set(Object.values(TypePrestation) as string[]);
const EXIGENCE_CATS = new Set(Object.values(CategorieExigence) as string[]);

function normPrestations(raw: any): Prestation[] {
  return asArray(raw)
    .map((p): Prestation | null => {
      const description = asString(p?.description);
      if (!description) return null;
      const t = asString(p?.type);
      const type = t && PRESTATION_TYPES.has(t) ? (t as TypePrestation) : TypePrestation.BASE;
      return {
        type,
        lot: asNumber(p?.lot),
        campus: asString(p?.campus),
        description,
        ref_section: asString(p?.ref_section) || description,
      };
    })
    .filter((p): p is Prestation => p !== null);
}

function normExigences(raw: any): ExigenceAgent[] {
  return asArray(raw)
    .map((e): ExigenceAgent | null => {
      const libelle = asString(e?.libelle);
      if (!libelle) return null;
      const c = asString(e?.categorie);
      const categorie = c && EXIGENCE_CATS.has(c) ? (c as CategorieExigence) : CategorieExigence.AUTRE;
      return {
        categorie,
        libelle,
        valeur: asString(e?.valeur),
        ref_section: asString(e?.ref_section),
      };
    })
    .filter((e): e is ExigenceAgent => e !== null);
}

export async function extractCctpWithLLM(filePath: string): Promise<CCTPDocument> {
  const client = getClient();
  if (!client) return parseCctp(filePath);

  const warnings: string[] = [];
  let text: string;
  try {
    text = await extractText(filePath);
  } catch (e: any) {
    return parseCctp(filePath);
  }
  if (text.length > MAX_CHARS) {
    warnings.push(`Texte tronqué à ${MAX_CHARS} caractères pour l'extraction LLM.`);
    text = text.slice(0, MAX_CHARS);
  }

  try {
    const data = await callJson(client, CCTP_SYSTEM, `TEXTE DU CCTP :\n\n${text}`);
    const prestations = normPrestations(data.prestations);
    const exigences = normExigences(data.exigences_agents);

    if (prestations.length === 0) warnings.push('Aucune prestation détectée.');
    if (exigences.length === 0) warnings.push('Aucune exigence agent détectée.');

    return {
      objet: asString(data.objet),
      arborescence: [],
      prestations,
      exigences_agents: exigences,
      contraintes_site: asArray(data.contraintes_site).map(asString).filter((s): s is string => s !== null),
      reprise_personnel:
        data.reprise_personnel === null || data.reprise_personnel === undefined
          ? null
          : asBool(data.reprise_personnel),
      synthese_projet: asArray(data.synthese_projet),
      source: {
        fichier: basename(filePath),
        methode_extraction: ExtractionMethod.DOCX_NATIVE,
        warnings,
      },
    };
  } catch (e: any) {
    console.warn('[llmExtractor] Échec extraction LLM CCTP, repli sur parser regex:', e?.message);
    return parseCctp(filePath);
  }
}
