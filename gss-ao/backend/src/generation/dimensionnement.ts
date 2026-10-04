/**
 * Dimensionnement proposé à partir du DCE (consignes 2 et 4 : « les bons chiffres » ; D5 : l'IA propose, GSS valide).
 *
 * Le modèle ne fait que LIRE le DCE : postes (profil, qualification, lieu, jours et horaires, volumes horaires du
 * DQE) et, pour un cas pratique, le dispositif par plage et par profil. Tous les calculs sont faits ici, sans modèle :
 * heures par semaine, heures par an, équivalents temps plein (base de 1 607 heures par an), titulaires, équipe
 * suppléante, effectif nécessaire aux rotations (vacations de 12 heures au plus). Un poste dont la citation ne se
 * retrouve pas dans le DCE est écarté. Le résultat est une PROPOSITION à valider par GSS (consultations et premier
 * message de l'assistant).
 */
import { normaliser } from './memoire_type';

/** Heures travaillées par an pour un équivalent temps plein. */
export const BASE_ETP = 1607;
/** Durée maximale d'une vacation (réglementation de la sécurité privée). */
export const VACATION_MAX_H = 12;
/** Équipe suppléante formée au site : 30 % des titulaires, deux agents au moins. */
export const PART_SUPPLEANTS = 0.3;

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

export interface PlageHoraire {
  jours: string[]; debut: string; fin: string;
  /** Période de l'année écrite dans le DCE (« Du 1er mai au 30 septembre »), relevée par le modèle. */
  periode?: string;
  /** Jours de l'année couverts par la période (364 sans période, soit 52 semaines). */
  joursAn?: number;
}

export interface ProfilDimensionne {
  profil: string;
  qualification: string;
  lieux: string[];
  heuresSemaine: number;
  heuresAn: number;
  etp: number;
  titulaires: number;
  /**
   * Nombre d'agents présents EN MÊME TEMPS sur un poste de ce profil, cité dans le DCE (havre2 : « le déploiement de 2
   * agents de sécurité (ADS) sur une heure ») : plancher des titulaires (un seul titulaire ne tient pas un poste à deux).
   */
  simultanes?: number;
  /** Observation du tableau quand l'effectif ne vient pas d'heures hebdomadaires (cas pratique). */
  observation?: string;
}

export interface LigneCasPratique { plage: string; profil: string; enService: number; rotation: number; dureeH: number; justification: string; debut?: string; fin?: string }

/** Fonction d'un dispositif événementiel proposé (chef de site, agents au filtrage, agents de comptage…). */
export interface FonctionEvenement { fonction: string; nombre: number; justification: string }

/**
 * Mise en situation événementielle du DCE (vitry 202 : forum et concert jusqu'à 10 000 personnes) : le dispositif que GSS
 * PROPOSE (D5, proposition à valider), fonction par fonction, avec les postes d'inspection filtrage (PIF) et les
 * détecteurs de métaux quand le DCE les demande.
 */
export interface MiseEnSituation { libelle: string; capacite: number | null; fonctions: FonctionEvenement[]; total: number; pif: number | null; detecteurs: number | null; citation?: string }

export interface Dimensionnement {
  profils: ProfilDimensionne[];
  /**
   * Rondes ou passages ponctuels relevés comme des postes (cstb 551 : « 3 rondes, entre 21h30 et 06h30 », T9N-1) : une
   * fenêtre horaire n'est pas une présence continue ; jamais comptés en heures de poste, citations gardées pour la question
   * posée à GSS (durée d'une ronde, nombre d'intervenants).
   */
  rondesSansDuree?: string[];
  /** Écarts relevés sans modèle entre les postes retenus et le DCE (total hebdomadaire du DQE), posés à GSS. */
  alertes?: string[];
  titulaires: number;
  suppleants: number;
  casPratique: LigneCasPratique[];
  /** Mises en situation événementielles (dispositif proposé par GSS, à valider). */
  misesEnSituation?: MiseEnSituation[];
}

/** « 7h00 », « 07:00 », « 19 h », « 1h » → heures décimales ; NaN si illisible. */
export function heureDe(t: string): number {
  // « 8h », « 8h30 », « 08:00 », « 8 heures », « 8 heures 30 », « 19.30 » (même lecture que base_memoires.RX_HEURE).
  const m = /^\s*(\d{1,2})\s*(?:h|:|\.|heures?)?\s*(\d{2})?\s*$/i.exec(String(t || '').replace(/^\s*midi\s*$/i, '12h').replace(/^\s*minuit\s*$/i, '0h'));
  if (!m) return NaN;
  const h = Number(m[1]);
  const mn = Number(m[2] || 0);
  return h <= 24 && mn < 60 ? h + mn / 60 : NaN;
}

/** Durée d'une plage en heures (une fin au plus égale au début passe minuit : 19h → 7h = 12 h). */
export function dureePlage(debut: string, fin: string): number {
  const d = heureDe(debut);
  const f = heureDe(fin);
  if (Number.isNaN(d) || Number.isNaN(f)) return 0;
  const x = f > d ? f - d : f + 24 - d;
  return Math.round(x * 100) / 100;
}

/** Jours d'une plage, normalisés (« lun », « Lundi » → « lundi »), sans doublon. */
function joursDe(jours: unknown): string[] {
  const l = (Array.isArray(jours) ? jours : String(jours || '').split(/[,;]/)).map((j) => normaliser(String(j)).trim());
  return [...new Set(l.map((j) => JOURS.find((x) => x.startsWith(j.slice(0, 3)) && j.length >= 3)).filter((x): x is string => !!x))];
}

const MOIS_DIM = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
const JOURS_MOIS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const RX_MOIS_DIM = '(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)';
/** Jour de l'année (1 à 365) d'une borne de période (« 1er mai », « fin février », « dernier week-end de mars »). */
function jourDeLAnnee(qualif: string, mois: number, fin: boolean): number {
  const q = String(qualif || '').trim();
  let j: number;
  if (/^\d{1,2}$/.test(q)) j = Number(q);
  else if (/^(?:1er|premier)$/.test(q)) j = 1;
  else if (/debut/.test(q)) j = 1;
  else if (/^mi/.test(q)) j = 15;
  else if (/week.?end/.test(q)) j = /dernier/.test(q) ? JOURS_MOIS[mois] - 3 : 4;
  else if (/fin/.test(q)) j = JOURS_MOIS[mois];
  else j = fin ? JOURS_MOIS[mois] : 1;
  j = Math.min(Math.max(1, j), JOURS_MOIS[mois]);
  return JOURS_MOIS.slice(0, mois).reduce((a, b) => a + b, 0) + j;
}
/**
 * Nombre de jours de l'année couverts par une période écrite dans le DCE (T1F-2) : « Du 1er mai au 30 septembre » (153),
 * « Les mois d'octobre, mars et avril » (92), « Du 1er novembre à la fin février » (120), « la saison démarre le dernier
 * week-end de mars et s'achève le dernier week-end de septembre » (184). La DERNIÈRE période du texte (la plus proche des
 * horaires) ; null si aucune n'est lisible. Les jours fériés cités (« les 1er mai, 25 décembre et 1er janvier ») ne sont
 * pas une période.
 */
export function joursDePeriode(texte: string): number | null {
  const t = normaliser(String(texte || '')).replace(/\s+/g, ' ');
  const BORNE = String.raw`(?:(\d{1,2}|1er|premier|debut|mi|fin|la fin|(?:le )?(?:dernier|premier) week-?end)\s*(?:-\s*)?(?:de |d'|du mois de |du mois d')?\s*)?${RX_MOIS_DIM}`;
  const LIEN = String.raw`(?:[^.;:]{0,50}?)(?:\s(?:au|a|jusqu'au|jusqu'a|et s'acheve(?: le)?|et se termine(?: le)?)\s+|\s?[-–]\s?)(?:la |le )?`;
  const intervalles: Array<{ pos: number; jours: number }> = [];
  for (const m of t.matchAll(new RegExp(`${BORNE}${LIEN}${BORNE}`, 'g'))) {
    const m1 = MOIS_DIM.indexOf(m[2]), m2 = MOIS_DIM.indexOf(m[4]);
    if (m1 < 0 || m2 < 0) continue;
    const a = jourDeLAnnee(m[1] || '', m1, false), b = jourDeLAnnee(m[3] || '', m2, true);
    const jours = b >= a ? b - a + 1 : 365 - a + 1 + b;
    if (jours >= 7 && jours <= 366) intervalles.push({ pos: m.index || 0, jours });
  }
  // Liste de mois sans jour (« les mois d'octobre, mars et avril », « en juillet et août », « en octobre »).
  for (const m of t.matchAll(new RegExp(String.raw`(?:mois (?:de |d')|(?<![a-z])en |: |; )${RX_MOIS_DIM}((?:\s*,\s*${RX_MOIS_DIM})*(?:\s+et\s+${RX_MOIS_DIM})?)(?![a-z0-9])`, 'g'))) {
    const mois = [m[1], ...[...(m[2] || '').matchAll(new RegExp(RX_MOIS_DIM, 'g'))].map((x) => x[1])];
    intervalles.push({ pos: m.index || 0, jours: [...new Set(mois)].reduce((a, x) => a + JOURS_MOIS[MOIS_DIM.indexOf(x)], 0) });
  }
  if (!intervalles.length) return null;
  return intervalles.sort((x, y) => x.pos - y.pos)[intervalles.length - 1].jours;
}

/** Le poste semble saisonnier (mois, saison, période estivale ou hivernale) : sa période doit être lue. */
const SAISONNIER = /(?<![\p{L}])(?:saisons?|saisonni\p{L}*|estivale?s?|hivernale?s?|janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[ûu]t|septembre|octobre|novembre|d[ée]cembre)(?![\p{L}])/iu;

/**
 * Période de la saison écrite ailleurs dans le DCE (havre1 : « la saison démarre le dernier week-end de mars et s'achève
 * le dernier week-end de septembre ») : jours couverts, null si aucune phrase de saison n'est lisible.
 */
export function joursDeLaSaison(dce: string): number | null {
  for (const ph of String(dce || '').replace(/\s+/g, ' ').split(/(?<=[.;])\s+/)) {
    if (!/saison|p[ée]riode (?:estivale|d.ouverture)/i.test(ph)) continue;
    const j = joursDePeriode(ph);
    if (j) return j;
  }
  return null;
}

/** Heures par semaine d'un ensemble de plages. */
export function heuresSemaine(plages: PlageHoraire[]): number {
  return Math.round(plages.reduce((s, p) => s + dureePlage(p.debut, p.fin) * joursDe(p.jours).length, 0) * 100) / 100;
}

/**
 * Vrai si la citation vient du DCE : six mots consécutifs au moins s'y retrouvent tels quels (accents et ponctuation ignorés).
 * Ligne d'un tableau (DQE, BPU) plus courte (« Dimanche 21h00 - 06h00 (nuit) | 10 », citedia2 474, T5-COH-1 : poste du
 * dimanche écarté sans trace, 74 h au lieu de 84 h) : trois mots au moins, dont un nombre, retrouvés tous de suite dans le DCE.
 */
function citationDansDce(citation: string, dceMots: string): boolean {
  const mots = normaliser(citation).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  if (mots.length >= 3 && mots.length < 6) return mots.some((w) => /^\d+$/.test(w)) && mots.some((w) => /[a-z]/.test(w)) && dceMots.includes(` ${mots.join(' ')} `);
  if (mots.length < 6) return false;
  for (let i = 0; i + 6 <= mots.length; i++) if (dceMots.includes(` ${mots.slice(i, i + 6).join(' ')} `)) return true;
  return false;
}

/** Citation située dans le texte qui suit un intitulé « Cas pratique » du DCE (2 000 caractères au plus après lui). */
export function citationDuCasPratique(citation: string, dceMots: string): boolean {
  const mots = normaliser(citation).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  if (mots.length < 3) return false;
  const debuts: number[] = [];
  for (let i = dceMots.indexOf(' cas pratique '); i >= 0; i = dceMots.indexOf(' cas pratique ', i + 1)) debuts.push(i);
  if (!debuts.length) return false;
  for (let k = 0; k + Math.min(6, mots.length) <= mots.length; k++) {
    const extrait = ` ${mots.slice(k, k + Math.min(6, mots.length)).join(' ')} `;
    for (let p = dceMots.indexOf(extrait); p >= 0; p = dceMots.indexOf(extrait, p + 1)) {
      // Intitulé le plus proche avant la citation : « cas pratique » (et non une « mise en situation » qui suivrait).
      const cas = Math.max(-1, ...debuts.filter((d) => d <= p));
      const mise = dceMots.lastIndexOf(' mise en situation ', p);
      if (cas >= 0 && p - cas <= 2000 && mise < cas) return true;
    }
  }
  return false;
}

const NOMBRES_EN_LETTRES: Record<string, number> = { deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10 };

/**
 * Nombre d'agents présents en même temps sur le poste (`agents_simultanes` relevé par le modèle), gardé seulement s'il
 * est écrit dans la citation du DCE devant un intitulé de personnel (« 2 agents de sécurité », « deux ADS », « 3 SSIAP
 * 1 ») ; 1 sinon.
 */
export function agentsSimultanes(valeur: unknown, citation: string): number {
  const n = Number(valeur);
  if (!Number.isInteger(n) || n < 2 || n > 50) return 1;
  const c = normaliser(String(citation || '')).replace(/[^a-z0-9]+/g, ' ');
  const lettres = Object.keys(NOMBRES_EN_LETTRES).find((k) => NOMBRES_EN_LETTRES[k] === n);
  const nb = lettres ? `(?:${n}|${lettres})` : String(n);
  const personnel = String.raw`(?:agents?|ads|ssiap|personnes?|maitres? chiens?|chefs?|operateurs?|hotes(?:ses)?|rondiers?|vigiles?|gardiens?|surveillants?|intervenants?)`;
  return new RegExp(String.raw`(?:^|\s)${nb}\s+(?:[a-z]+\s+){0,2}?${personnel}(?:\s|$)`).test(` ${c} `) ? n : 1;
}

/**
 * Nombre d'agents écrit devant l'horaire d'une plage dans la citation (« Prévoir deux agents en poste à l'instant T de 9h20
 * à 17h40 » → 2 ; « prévoir un agent habilité de 9h20 à 18h10 » → 1) ; null si l'horaire n'y figure pas, sans nombre
 * devant lui, ou avec des nombres différents d'une proposition à l'autre.
 */
export function agentsDeLaPlage(plage: PlageHoraire, citation: string): number | null {
  const heure = (h: string): string | null => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(h || '').trim());
    if (!m) return null;
    const hh = String(Number(m[1]));
    return m[2] === '00' ? `0?${hh}\\s*(?:h|:)(?:\\s*00)?` : `0?${hh}\\s*(?:h|:)\\s*${m[2]}`;
  };
  const d = heure(plage.debut);
  const f = heure(plage.fin);
  if (!d || !f) return null;
  const rx = new RegExp(`(?<!\\d)${d}\\s*(?:à|a|-|–|—|au|jusqu.à)\\s*${f}(?!\\d)`, 'i');
  const personnel = String.raw`(?:agents?|ads|ssiap|personnes?|maitres? chiens?|chefs?|operateurs?|hotes(?:ses)?|rondiers?|vigiles?|gardiens?|surveillants?|intervenants?)`;
  const comptes = new Set<number>();
  for (const prop of String(citation || '').split(/\s:\s|;|\.\s|\n/)) {
    const m = rx.exec(prop);
    if (!m) continue;
    const avant = ` ${normaliser(prop.slice(0, m.index)).replace(/[^a-z0-9]+/g, ' ').trim()} `;
    const tous = [...avant.matchAll(new RegExp(String.raw`(?<=\s)(\d{1,2}|une?|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s+(?:[a-z]+\s+){0,2}?${personnel}(?=\s)`, 'g'))];
    if (!tous.length) return null;
    const v = tous[tous.length - 1][1];
    comptes.add(/^\d+$/.test(v) ? Number(v) : NOMBRES_EN_LETTRES[v] ?? 1);
  }
  return comptes.size === 1 ? [...comptes][0] : null;
}

const nombre = (x: unknown): number | null => {
  const n = Number(String(x ?? '').replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Citation qui décrit un nombre de rondes ou de passages dans une fenêtre horaire (« 3 rondes, entre 21h30 et 06h30 »,
 * « 1 ronde, de 19h30 à 20h30 », cstb 551, T9N-1) et non un poste tenu en continu (« poste », « présence »,
 * « vacation », « permanence », « 24h/24 ») : la fenêtre n'est pas une durée de présence.
 */
const RONDES_PONCTUELLES = /(?<![\p{L}\d])(?:\d{1,2}|une?|deux|trois|quatre|cinq|six)\s+(?:rondes?|passages?)(?![\p{L}])/iu;
const PRESENCE_CONTINUE = /\bpostes?\b|pr[ée]sence|vacations?|permanence|en continu|24\s*h\s*\/\s*24|\bH24\b/i;
export function citationDeRondes(citation: string): boolean {
  const c = String(citation || '');
  return RONDES_PONCTUELLES.test(c) && !PRESENCE_CONTINUE.test(c);
}

/** Question exacte posée à GSS pour des rondes ponctuelles sans durée (T9N-1). '' sans rondes. */
export function questionRondes(d: Dimensionnement | null | undefined): string {
  const r = d?.rondesSansDuree || [];
  if (!r.length) return '';
  const cites = r.slice(0, 3).map((c) => `« ${c.replace(/\s+/g, ' ').trim().slice(0, 90)} »`).join(', ');
  return `Le cahier des charges prévoit des rondes ponctuelles sans durée de présence (${cites}) : elles ne sont pas comptées en heures de poste. Combien de temps dure une ronde sur le site, et combien d'intervenants rondiers dédiez-vous au marché ?`;
}

/** Poste qui n'est pas permanent : option, tranche optionnelle, agent supplémentaire, prestation à la demande ou ponctuelle. */
const POSTE_OPTIONNEL = /(?<![\p{L}])(?:options?|optionnel(?:le)?s?|agents? suppl[ée]mentaires?|[àa] la demande|bons? de commande|ponctuel(?:le)?s?|renforts? ponctuels?)(?![\p{L}])/iu;

/**
 * Le poste lui-même est-il optionnel (T1-GEN-7) ? Le test porte sur la proposition qui décrit le poste (celle qui porte les
 * horaires), jamais sur un complément de la citation (« ; ce dispositif pourra être complété par des agents supplémentaires
 * sur bon de commande », « (le candidat pourra proposer en option un maître-chien) », « , avec un renfort ponctuel lors des
 * événements ») : sinon un poste permanent disparaissait en silence.
 */
export function posteOptionnel(citation: string, profil: string): boolean {
  if (POSTE_OPTIONNEL.test(profil)) return true;
  const c = String(citation || '').replace(/\s+/g, ' ');
  const propositions = c.split(/\s*;\s*|\s*\([^()]*\)\s*|,\s+(?=avec\s)|(?<=[.!?])\s+|\s+(?=(?:ce|le) dispositif pourra|il pourra [êe]tre compl[ée]t[ée])/i).filter((x) => x.trim());
  const HORAIRE = /\d{1,2}\s*(?:h|:)\s*\d{0,2}|24\s*h|7\s*j|jours?|nuits?|semaine|permanent|en continu|vacations?/i;
  const principale = propositions.find((x) => HORAIRE.test(x)) || propositions[0] || c;
  return POSTE_OPTIONNEL.test(principale);
}

/**
 * Profil d'agent de sécurité (ADS, agent de sécurité, de surveillance ou de sûreté, qualification CQP APS ou carte
 * professionnelle), sans qualification incendie ni cynophile ni d'encadrement : renvoie la qualification à afficher
 * (celle du DCE, ou « CQP APS » si elle se réduit à l'intitulé du poste), '' sinon.
 */
export function profilAgentSecurite(profil: string, qualification: string): string {
  const p = normaliser(`${profil} ${qualification}`);
  if (/ssiap|incendie|cynophil|maitre.chien|chef|encadr|responsable|superviseur|controleur|rondier|accueil|hotesse|standard|operateur|pc\b/.test(p)) return '';
  if (!/\bads\b|agent de (?:securite|surveillance|surete)|\bcqp\b|\baps\b|carte professionnelle/.test(p)) return '';
  const q = String(qualification || '').trim();
  // Qualification réduite à l'intitulé du poste (« ADS », « Agent de sécurité », « Agent de sécurité (ADS) », T1F-13) ou à
  // un équivalent du CQP APS (« C.Q.P.A.D.S. », « CQP ADS », « TFP APS ») : « CQP APS » ; sinon celle du DCE.
  // Complément entre parenthèses qui n'est que le sigle du poste (« (ADS) ») ; un grade (« ADS (niveau 2, échelon 2) ») reste.
  const intitule = q.replace(/\s*\(\s*(?:ads|agents? de s[ée]curit[ée])\s*\)\s*/gi, ' ').trim();
  return !q || /^(?:ads|agents? de (?:s[ée]curit[ée]|surveillance|s[ûu]ret[ée]))$/i.test(intitule)
    || /^(?:C\.?\s?Q\.?\s?P\.?\s?-?\s?A\.?\s?[PD]\.?\s?S\.?|TFP\s*-?\s*APS)$/i.test(q) ? 'CQP APS' : q;
}

/**
 * Qualification d'un poste dont le DCE (ou sa lecture) ne donne que l'intitulé : le niveau SSIAP porté par l'intitulé
 * (« Chef d'équipe SSIAP 2 » → « SSIAP 2 »), le CQP APS pour un agent de sécurité (obligatoire) et pour un autre poste de
 * sécurité (chef d'équipe, chef de poste, rondier) quand le DCE exige le CQP APS ou la carte professionnelle, « [À COMPLÉTER] »
 * sinon (rien d'inventé).
 */
export function qualificationParDefaut(profil: string, dceMots: string): string {
  const p = normaliser(profil);
  const ssiap = /ssiap\s*([123])/.exec(p);
  if (ssiap) return `SSIAP ${ssiap[1]}`;
  if (categorieDe(profil) === 'Agent cynophile') return 'CQP APS – qualification cynophile';
  // Agent de sécurité (« ADS », « Agent de sécurité ») : le CQP APS, obligatoire pour ce poste (T1F-13).
  if (profilAgentSecurite(profil, '')) return 'CQP APS';
  const securite = !/incendie|accueil|hotesse|standard|operateur|technicien|nettoy|menage/.test(p)
    && /\bads\b|\bcqp\b|\baps\b|agent|chef|encadr|rondier|superviseur|surveillan|securite|surete|garde|vigile|vigipirate/.test(p);
  if (securite && /(?:^| )(?:cqp|carte professionnelle|tfp aps|c q p)(?= |$)/.test(dceMots)) return 'CQP APS';
  return '[À COMPLÉTER]';
}

/**
 * Intitulé de poste relevé par le modèle, sans le nombre d'agents recopié du DCE (« 2 agents » → « Agent de sécurité »,
 * « 1 agente » → « Agent de sécurité », « 1 ADS » → « ADS », « 1 SSIAP 1 » → « SSIAP 1 », « SSIAP1 » → « SSIAP 1 »).
 * Un « agent » sans autre précision, dans un relevé de gardiennage, est un agent de sécurité (CQP APS).
 */
export function profilSansNombre(profil: string): string {
  let t = String(profil || '').replace(/\s+/g, ' ').trim().replace(/^\d+\s+(?=\S)/, '').replace(/\bSSIAP\s*([123])\b/gi, 'SSIAP $1');
  if (/^agent(?:e)?s?$/i.test(t)) t = 'Agent de sécurité';
  return t;
}

/**
 * Calcul du dimensionnement à partir de la lecture du DCE par le modèle (`rep` : {postes, cas_pratique}). Renvoie
 * null si aucun poste ni cas pratique n'est exploitable.
 */
export function calculerDimensionnement(rep: any, dce: string): Dimensionnement | null {
  const dceMots = ` ${normaliser(String(dce || '')).replace(/[^a-z0-9]+/g, ' ').trim()} `;
  const profils = new Map<string, ProfilDimensionne>();
  /** Profil dont toutes les heures viennent des volumes hebdomadaires du DQE. */
  const dqeParProfil = new Map<string, boolean>();
  const rondes: string[] = [];
  /** Postes écartés comme optionnels (signalés à GSS, T1-GEN-7). */
  const optionnels: string[] = [];
  /** Postes saisonniers dont la période n'a pas pu être lue (T1F-2) : comptés sur l'année, question posée à GSS. */
  const sansPeriode: string[] = [];
  const saisonDuDce = joursDeLaSaison(dce);
  const occupations = new Map<string, Array<{ periode: string; plages: PlageHoraire[]; simultanes: number }>>();
  for (const p of Array.isArray(rep?.postes) ? rep.postes : []) {
    // Intitulé en capitales (« AGENT DE SECURITE ») : écrit en minuscules, initiale en majuscule.
    // Nombre recopié dans l'intitulé (ca_normandie 241 : « 2 agents », « 1 agente », « 1 ADS », « 1 SSIAP 1 », « SSIAP1 ») :
    // retiré ; « agent(s) » seul, relevé sous « Gardiennage de surveillance », est un agent de sécurité.
    const brut = profilSansNombre(String(p?.profil || ''));
    // Sigles remis en capitales sur tout l'intitulé, premier mot compris (citedia 701 : « SSIAP 1 CQP APS » devenait « Ssiap 1 CQP APS »).
    const profil = /[A-ZÀ-Ý]{5,}/.test(brut) && (brut.match(/[A-Za-zÀ-ÿ]{2,}/g) || []).length >= 2 && brut === brut.toUpperCase() ? (brut.charAt(0) + brut.slice(1).toLowerCase()).replace(/\b(ssiap|ads|cqp|aps|sst|pse|pcs?|erp|igh|tfp)\b/gi, (m) => m.toUpperCase()) : brut;
    if (!profil || !citationDansDce(String(p?.citation || ''), dceMots)) continue;
    // Poste optionnel ou ponctuel (« l'option 1 : 1 SSIAP 1 7j/7 24h/24… », génération réelle imm 16 : trois options
    // comptées comme postes permanents, 36 titulaires au lieu de 18) : jamais dans l'équipe dédiée.
    if (posteOptionnel(String(p?.citation || ''), brut)) {
      optionnels.push(String(p?.citation || '').replace(/\s+/g, ' ').trim());
      continue;
    }
    // Rondes ponctuelles (« 3 rondes, entre 21h30 et 06h30 ») : jamais des heures de poste (T9N-1) ; posées à GSS.
    // (un volume horaire du DQE pour ce poste reste, lui, un volume de poste)
    if (citationDeRondes(String(p?.citation || '')) && !nombre(p?.heures_hebdo) && !nombre(p?.heures_an)) {
      rondes.push(String(p?.citation || '').replace(/\s+/g, ' ').trim());
      continue;
    }
    const plages: PlageHoraire[] = (Array.isArray(p?.plages) ? p.plages : [])
      .map((x: any) => ({ jours: joursDe(x?.jours), debut: String(x?.debut || ''), fin: String(x?.fin || ''), periode: String(x?.periode || p?.periode || '') }))
      .filter((x: PlageHoraire) => x.jours.length && dureePlage(x.debut, x.fin) > 0);
    // Période de l'année de chaque plage (T1F-2 : Fontainebleau, un poste par saison ; Le Havre lot 1, service de la seule
    // saison estivale) : celle relevée par le modèle si elle est écrite dans le DCE, sinon celle de la citation, sinon la
    // saison décrite ailleurs dans le DCE pour un poste saisonnier ; jamais deux périodes additionnées comme si elles se
    // cumulaient. Lisible nulle part pour un poste qui semble saisonnier : compté sur l'année et question posée à GSS.
    const citation = String(p?.citation || '');
    const motsDe = (x: string) => normaliser(x).replace(/[^a-z0-9]+/g, ' ').trim();
    const periodeDce = (x: string) => motsDe(x).length >= 6 && dceMots.includes(` ${motsDe(x)} `);
    let periodeIllisible = false;
    for (const x of plages) {
      const jours = (periodeDce(x.periode || '') ? joursDePeriode(x.periode || '') : null) ?? joursDePeriode(citation)
        ?? (/(?<![\p{L}])(?:saisons?|saisonni\p{L}*|estivale?s?|hivernale?s?)(?![\p{L}])/iu.test(citation) ? saisonDuDce : null);
      if (jours) x.joursAn = jours;
      else if (SAISONNIER.test(`${citation} ${x.periode || ''}`)) periodeIllisible = true;
    }
    if (periodeIllisible) sansPeriode.push(citation.replace(/\s+/g, ' ').trim());
    // Volume du DQE (« TOTAL HEBDOMADAIRE | 84 ») : prioritaire sur les plages (un bordereau liste toutes les plages
    // facturables, le DQE les heures réellement estimées), pris seulement si ce nombre figure dans le DCE.
    const hh = nombre(p?.heures_hebdo);
    const hebdoDuDce = !!hh && new RegExp(`(?<![\\d,.])${hh}(?![\\d,.])`).test(dce);
    // Agents présents en même temps (« 2 agents de sécurité (ADS) sur une heure ») : les plages sont celles du poste,
    // les heures à couvrir sont multipliées par ce nombre ; le volume du DQE est déjà le total du poste.
    const simultanes = agentsSimultanes(p?.agents_simultanes, String(p?.citation || ''));
    // Heures de l'année : chaque plage sur les jours réellement couverts par sa période (52 semaines sans période) ; les
    // heures par semaine affichées sont la moyenne sur l'année.
    // Plages d'un même poste tenues chacune par une partie des agents (génération réelle fontainebleau 902, circuit de visite :
    // « Quatre agents … prévoir deux agents de 9h20 à 17h40 ; prévoir deux agents de 9h20 à 18h10 », relevé avec 4 agents
    // simultanés sur chacune des deux plages, heures comptées deux fois) : chaque plage compte les agents écrits devant son
    // horaire, quand ces nombres, sur chaque période, font le total d'agents simultanés relevé.
    const parPlage = plages.map((x) => agentsDeLaPlage(x, citation));
    const totalParPeriode = new Map<string, number>();
    plages.forEach((x, i) => totalParPeriode.set(`${x.periode || ''}|${x.joursAn ?? 'an'}`, (totalParPeriode.get(`${x.periode || ''}|${x.joursAn ?? 'an'}`) || 0) + (parPlage[i] || 0)));
    const agentsParPlage = simultanes > 1 && parPlage.every((n) => !!n) && parPlage.some((n) => n !== simultanes) && [...totalParPeriode.values()].every((t) => t === simultanes);
    const heuresPlagesAn = plages.reduce((a, x, i) => a + dureePlage(x.debut, x.fin) * joursDe(x.jours).length * ((x.joursAn ?? 364) / 7) * (agentsParPlage ? parPlage[i]! : simultanes), 0);
    let hs = hebdoDuDce ? hh : plages.length ? Math.round((heuresPlagesAn / 52) * 100) / 100 : 0;
    if (!hs || hs > 24 * 7 * 6) continue;
    const ha = nombre(p?.heures_an);
    const anDuDce = !!ha && new RegExp(`(?<![\\d,.])${ha}(?![\\d,.])`).test(dce.replace(/(\d)[\s  ](?=\d{3}\b)/g, '$1'));
    const heuresAn = anDuDce ? ha : hebdoDuDce || !plages.length ? Math.round(hs * 52) : Math.round(heuresPlagesAn);
    // Volume annuel du DCE : les heures par semaine affichées en découlent (ifits 171 : « 84 h par semaine » tirées des
    // plages alors que le DCE prévoit 1 751 h par an, environ 34 h par semaine) ; jamais deux chiffres contradictoires.
    // Le volume hebdomadaire du DQE (saison de 47 semaines, Citédia) reste celui du DCE.
    if (anDuDce && !hebdoDuDce && hs > 1.5 * (ha / 52)) {
      console.log(`[Dimensionnement] ${profil} : ${hs} h/sem d'après les plages, ${ha} h/an dans le DCE → ${Math.round((ha / 52) * 100) / 100} h/sem retenues.`);
      hs = Math.round((ha / 52) * 100) / 100;
    }
    // Sigle du CNAPS mal écrit par le DCE (cstb 551 : « Agrément préfectoral CNPAS ») : le tableau est à la voix de GSS (T6N-7).
    let qualification = String(p?.qualification || '').replace(/\s+/g, ' ').trim().replace(/(?<![A-Za-z])CNPAS(?![A-Za-z])/g, 'CNAPS');
    // Qualification non relevée, ou réduite à l'intitulé du poste (génération réelle fontainebleau 901 : « Chef d'équipe »
    // imprimé dans la colonne « Qualification ») : celle que le poste porte (« SSIAP 2 »), sinon le CQP APS exigé par le DCE
    // pour un poste de sécurité, sinon à compléter par GSS ; jamais l'intitulé du poste.
    if (!qualification || normaliser(qualification) === normaliser(profil)) qualification = qualificationParDefaut(profil, dceMots);
    // Profils équivalents (« ADS », « Agent de sécurité », « agent de sûreté » : le même agent de sécurité CQP APS) :
    // une seule catégorie, heures additionnées (ca_normandie 221 : « Agent de sécurité » 22 et « ADS » 20 sur deux lignes).
    // Qualification réduite à l'intitulé d'un poste cynophile (ifits 701 : « Agent conducteur de chien » imprimé dans la colonne
    // « Qualification », diplômes de l'équipe dédiée laissés « [À COMPLÉTER] ») : celle du catalogue de GSS.
    if (categorieDe(profil) === 'Agent cynophile' && !/cqp|aps|cynophil|carte|ssiap|dipl|certific/i.test(normaliser(qualification))) qualification = 'CQP APS – qualification cynophile';
    const equivalentAds = profilAgentSecurite(profil, qualification);
    if (equivalentAds) qualification = equivalentAds;
    // Postes d'agent de sécurité distincts (T1F-3 : « contrôle d'accès et Vigipirate », « accueil … circuit de visite »,
    // « cours et jardins ») : jamais fusionnés ; « ADS » et « Agent de sécurité » au même lieu restent un seul poste.
    const posteDistinct = normaliser(profil).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !/^(?:agents?|securite|ads|surveillance|surete|des|les|aux|pour)$/.test(w)).join(' ');
    const cle = equivalentAds ? `agent de securite|ads|${posteDistinct}` : normaliser(`${profil}|${qualification}`);
    const x = profils.get(cle) || { profil, qualification, lieux: [], heuresSemaine: 0, heuresAn: 0, etp: 0, titulaires: 0 };
    if (hebdoDuDce) dqeParProfil.set(cle, (dqeParProfil.get(cle) ?? true) && true); else dqeParProfil.set(cle, false);
    x.heuresSemaine = Math.round((x.heuresSemaine + hs) * 100) / 100;
    x.heuresAn += heuresAn;
    const lieu = String(p?.lieu || '').trim();
    if (lieu && !x.lieux.includes(lieu)) x.lieux.push(lieu);
    // Agents présents en même temps (T1F-3) : sur une même période, les plages qui se chevauchent s'additionnent
    // (Fontainebleau, circuit de visite : « deux agents de 9h20 à 17h40 » et « deux agents de 9h20 à 18h10 » = 4 agents à
    // l'instant T) ; d'une période à l'autre, le plus grand nombre.
    // Même lieu seulement : deux sites ne forment jamais un poste à plusieurs agents.
    const periodeCle = `${plages[0]?.joursAn ?? 'an'}|${normaliser(String(p?.lieu || ''))}`;
    const deja = occupations.get(cle) || [];
    const chevauche = (a: PlageHoraire, b: PlageHoraire) => a.jours.some((j) => b.jours.includes(j)) && Math.max(heureDe(a.debut), heureDe(b.debut)) < Math.min(heureDe(a.fin) <= heureDe(a.debut) ? heureDe(a.fin) + 24 : heureDe(a.fin), heureDe(b.fin) <= heureDe(b.debut) ? heureDe(b.fin) + 24 : heureDe(b.fin));
    const ensemble = simultanes + deja.filter((o) => o.periode === periodeCle && o.plages.some((a) => plages.some((b) => chevauche(a, b)))).reduce((a, o) => a + o.simultanes, 0);
    deja.push({ periode: periodeCle, plages, simultanes });
    occupations.set(cle, deja);
    if (ensemble > 1) x.simultanes = Math.max(x.simultanes || 1, ensemble);
    profils.set(cle, x);
  }
  // Total du DQE (« TOTAL HEBDOMADAIRE | 84 », « ESTIMATION ANNUELLE (… 47 semaines) | 3948 ») : la somme des postes retenus
  // doit l'égaler, sinon l'écart est posé à GSS ; égale, l'estimation annuelle du DQE donne les heures par an (citedia2 :
  // 84 h, 3 948 h, 2,46 ETP).
  const alertes: string[] = [];
  {
    const t = String(dce || '');
    const total = nombre((/TOTAL\s+HEBDOMADAIRE\s*\|\s*(\d+(?:[.,]\d+)?)/i.exec(t) || [])[1]);
    const annuel = nombre(((/ESTIMATION\s+ANNUELLE[^|\n]*\|\s*(\d[\d\s\u00a0\u202f]*(?:[.,]\d+)?)/i.exec(t) || [])[1] || '').replace(/[\s\u00a0\u202f]/g, ''));
    const duDqe = [...profils.entries()].filter(([k]) => dqeParProfil.get(k));
    const somme = Math.round(duDqe.reduce((a, [, x]) => a + x.heuresSemaine, 0) * 100) / 100;
    if (total && duDqe.length) {
      if (Math.abs(somme - total) > 0.01) {
        alertes.push(`les postes relevés dans le DQE totalisent ${fr(somme)} h par semaine alors que le DQE indique un total hebdomadaire de ${fr(total)} h : quels postes et quels volumes faut-il retenir ?`);
        console.warn(`[Dimensionnement] Somme des postes du DQE (${somme} h) différente du total hebdomadaire du DQE (${total} h) : question posée à GSS.`);
      } else if (annuel && duDqe.length === profils.size) {
        for (const [, x] of duDqe) x.heuresAn = Math.round((annuel * x.heuresSemaine) / total);
      }
    }
  }
  for (const x of profils.values()) {
    if (x.observation !== undefined) continue;
    x.etp = Math.round((x.heuresAn / BASE_ETP) * 100) / 100;
    // Plancher : le nombre d'agents présents en même temps sur un poste de ce profil (havre2 : 0,68 ETP mais 2 ADS
    // ensemble à la fermeture des jardins → 2 titulaires).
    x.titulaires = Math.max(x.simultanes || 1, Math.ceil(x.etp - 0.05));
  }
  const titulaires = [...profils.values()].reduce((s, x) => s + x.titulaires, 0);
  const suppleants = titulaires ? Math.max(2, Math.ceil(titulaires * PART_SUPPLEANTS)) : 0;
  // Cas pratique : effectif en service proposé par le modèle (entier de 0 à 10), rotation calculée ici.
  const casPratique: LigneCasPratique[] = [];
  const plagesCas = new Map<string, number>();
  const bornesCas = new Map<string, { debut: string; fin: string }>();
  for (const pl of Array.isArray(rep?.cas_pratique?.plages) ? rep.cas_pratique.plages : []) {
    const libelle = String(pl?.libelle || '').trim();
    const d = dureePlage(String(pl?.debut || ''), String(pl?.fin || ''));
    if (libelle && d > 0) { plagesCas.set(libelle, d); bornesCas.set(libelle, { debut: String(pl?.debut || ''), fin: String(pl?.fin || '') }); }
  }
  for (const l of Array.isArray(rep?.cas_pratique?.dispositif) ? rep.cas_pratique.dispositif : []) {
    const plage = String(l?.plage || '').trim();
    const profil = String(l?.profil || '').trim();
    const n = Number(l?.en_service);
    const d = plagesCas.get(plage);
    if (!plage || !profil || !d || !Number.isInteger(n) || n < 0 || n > 10) continue;
    casPratique.push({ plage, profil, enService: n, rotation: n * Math.ceil(d / VACATION_MAX_H), dureeH: d, justification: String(l?.justification || '').trim(), ...bornesCas.get(plage) });
  }
  // Encadrement (T9N-5, etampes2 553 : 12 agents en service le dimanche férié, « Encadrant | 0 ») : règle de GSS écrite
  // dans le mémoire type (« Sur les grands dispositifs, nous prévoyons 1 responsable pour 10 agents », réponse Région
  // Normandie 2024) ; quand le DCE demande un encadrant, une plage à 10 agents ou plus en service en compte 1 par tranche
  // de 10.
  {
    const ENCADRANT = /encadr|chef d.[ée]quipe|chef de (?:poste|site|s[ée]curit[ée])|responsable|superviseur|coordinat/i;
    for (const plage of [...new Set(casPratique.map((l) => l.plage))]) {
      const lignes = casPratique.filter((l) => l.plage === plage);
      const enc = lignes.filter((l) => ENCADRANT.test(l.profil));
      const agents = lignes.filter((l) => !ENCADRANT.test(l.profil)).reduce((a, l) => a + l.enService, 0);
      const besoin = Math.floor(agents / 10);
      const actuel = enc.reduce((a, l) => a + l.enService, 0);
      if (!enc.length || !besoin || actuel >= besoin) continue;
      const l = enc[0];
      l.enService += besoin - actuel;
      l.rotation = l.enService * Math.ceil(l.dureeH / VACATION_MAX_H);
      l.justification = `GSS prévoit 1 responsable pour 10 agents sur les grands dispositifs : ${agents} agents en service sur cette plage.`;
      console.log(`[Dimensionnement] Cas pratique, ${plage} : ${agents} agents en service, ${l.enService} ${l.profil} (1 responsable pour 10 agents).`);
    }
  }
  // Le scénario du cas pratique n'est jamais aussi une mise en situation (T7N-1, etampes2 553 : « fête communale sur la place
  // Saint Gilles, 48 heures » relevée deux fois, avec deux dispositifs contradictoires) : le cas pratique, demandé par le DQE,
  // fait foi ; une mise en situation dont la citation est le texte qui suit l'intitulé « Cas pratique » du DCE est écartée.
  const misesEnSituation = lireMisesEnSituation(rep?.mises_en_situation, dce, dceMots)
    .filter((m) => !casPratique.length || !citationDuCasPratique(m.citation || '', dceMots));
  // Accord-cadre sans poste permanent, avec un cas pratique : l'équipe proposée est celle du cas pratique (pour chaque
  // profil, l'effectif nécessaire à la rotation sur la plage la plus exigeante).
  if (!profils.size && casPratique.length) {
    for (const l of casPratique) {
      if (l.rotation <= 0) continue;
      const cle = normaliser(l.profil);
      const x = profils.get(cle) || { profil: l.profil, qualification: categorieDe(l.profil) === 'Agent cynophile' ? 'CQP APS – qualification cynophile' : /incendie/i.test(l.profil) ? 'SSIAP 1' : /encadr/i.test(l.profil) ? 'Encadrement' : 'CQP APS', lieux: [], heuresSemaine: 0, heuresAn: 0, etp: 0, titulaires: 0, observation: '' };
      if (l.rotation > x.titulaires) { x.titulaires = l.rotation; x.observation = `cas pratique : ${l.enService} en service, ${l.rotation} pour la rotation (${l.plage})`; }
      profils.set(cle, x);
    }
    const t = [...profils.values()].reduce((s2, x) => s2 + x.titulaires, 0);
    return { profils: [...profils.values()], titulaires: t, suppleants: t ? Math.max(2, Math.ceil(t * PART_SUPPLEANTS)) : 0, casPratique, ...(misesEnSituation.length ? { misesEnSituation } : {}) };
  }
  // Postes optionnels écartés et postes saisonniers sans période lisible : signalés à GSS, jamais en silence.
  if (optionnels.length) alertes.push(`${optionnels.length > 1 ? `${optionnels.length} postes ont été écartés` : 'un poste a été écarté'} de l'équipe dédiée comme optionnels ou ponctuels (${optionnels.slice(0, 3).map((c) => `« ${c.slice(0, 120)} »`).join(', ')}) : ${optionnels.length > 1 ? 'sont-ils' : 'est-il'} bien hors de l'équipe permanente ?`);
  if (sansPeriode.length) alertes.push(`la période de l'année de ${sansPeriode.length > 1 ? 'ces postes saisonniers' : 'ce poste saisonnier'} n'a pas pu être lue (${sansPeriode.slice(0, 3).map((c) => `« ${c.slice(0, 120)} »`).join(', ')}) : ${sansPeriode.length > 1 ? 'ils sont comptés' : 'il est compté'} sur toute l'année ; sur combien de semaines par an faut-il ${sansPeriode.length > 1 ? 'les' : 'le'} compter ?`);
  // Rondes ponctuelles écartées : posées à GSS (durée d'une ronde, nombre d'intervenants), jamais converties en heures.
  if (rondes.length) {
    const q = questionRondes({ profils: [], titulaires: 0, suppleants: 0, casPratique: [], rondesSansDuree: rondes });
    console.warn(`[Dimensionnement] ${rondes.length} ronde(s) ponctuelle(s) sans durée de présence : non comptée(s) en heures de poste, question posée à GSS.`);
    if (profils.size) alertes.push(q.charAt(0).toLowerCase() + q.slice(1));
  }
  if (!profils.size && !casPratique.length && !misesEnSituation.length) {
    return rondes.length ? { profils: [], titulaires: 0, suppleants: 0, casPratique: [], rondesSansDuree: rondes } : null;
  }
  return { profils: [...profils.values()], titulaires, suppleants, casPratique, ...(misesEnSituation.length ? { misesEnSituation } : {}), ...(alertes.length ? { alertes } : {}), ...(rondes.length ? { rondesSansDuree: rondes } : {}) };
}

/**
 * Mises en situation événementielles relevées par le modèle (`mises_en_situation`) : gardées seulement si leur citation
 * vient du DCE (six mots consécutifs), si la capacité d'accueil annoncée figure dans le DCE, et si chaque nombre est un
 * entier plausible (fonction : 0 à 300 agents ; PIF et détecteurs : 0 à 100). Le total est calculé ici.
 */
export function lireMisesEnSituation(brut: unknown, dce: string, dceMots = ` ${normaliser(String(dce || '')).replace(/[^a-z0-9]+/g, ' ').trim()} `): MiseEnSituation[] {
  const entier = (x: unknown, max: number): number | null => { const n = Number(x); return Number.isInteger(n) && n >= 0 && n <= max ? n : null; };
  const chiffresDce = String(dce || '').replace(/(\d)[\s\u00a0\u202f](?=\d{3}\b)/g, '$1');
  const out: MiseEnSituation[] = [];
  for (const m of Array.isArray(brut) ? brut : []) {
    const libelle = String(m?.libelle || '').replace(/\s+/g, ' ').trim();
    if (!libelle || !citationDansDce(String(m?.citation || ''), dceMots)) continue;
    const cap = entier(m?.capacite, 1_000_000);
    const capacite = cap && new RegExp(`(?<![\\d])${cap}(?![\\d])`).test(chiffresDce) ? cap : null;
    const fonctions: FonctionEvenement[] = [];
    for (const f of Array.isArray(m?.dispositif) ? m.dispositif : []) {
      const fonction = String(f?.fonction || '').replace(/\s+/g, ' ').trim();
      const nombre = entier(f?.nombre, 300);
      if (!fonction || nombre === null || nombre === 0) continue;
      fonctions.push({ fonction, nombre, justification: String(f?.justification || '').replace(/\s+/g, ' ').trim() });
    }
    const total = fonctions.reduce((a, f) => a + f.nombre, 0);
    if (!total) continue;
    // 0 PIF ou 0 détecteur de métaux (etampes2 552 : « ; 0 détecteur de métaux » imprimé alors que le DCE n'en parle pas) :
    // valeur non demandée (null), sauf si le DCE cite ce moyen ; dans ce cas, « aucun » est écrit en toutes lettres.
    const pif = entier(m?.pif, 100);
    const detecteurs = entier(m?.detecteurs, 100);
    out.push({
      libelle, capacite, fonctions, total,
      pif: pif === 0 && !PIF_DANS_DCE.test(dce) ? null : pif,
      detecteurs: detecteurs === 0 && !DETECTEURS_DANS_DCE.test(dce) ? null : detecteurs,
      citation: String(m?.citation || '').replace(/\s+/g, ' ').trim(),
    });
  }
  return out;
}

/** Le DCE cite des postes d'inspection filtrage, ou des détecteurs de métaux (sinon « 0 » n'est jamais écrit). */
const PIF_DANS_DCE = /(?<![\p{L}])PIF(?![\p{L}])|inspection[- ]filtrage/iu;
const DETECTEURS_DANS_DCE = /d[ée]tecteurs? de m[ée]taux|magn[ée]tom[èe]tres?|portiques? de d[ée]tection/i;

/** « 24 agents, dont 2 chefs de site et 14 agents au filtrage ; 6 PIF ; 6 détecteurs de métaux » (dispositif d'une mise en situation). */
export function dispositifMiseEnSituation(m: MiseEnSituation): string {
  const fonctions = m.fonctions.map((f) => effectifProfil(f.nombre, f.fonction));
  // Valeur non demandée (null, ou 0 enregistré par une génération antérieure) : rien n'est écrit ; 0 demandé : « aucun ».
  const moyen = (n: number | null | undefined, s: string, p: string) => (n === null || n === undefined ? '' : ` ; ${n === 0 ? `aucun ${s}` : pluriel(n, s, p)}`);
  return `${pluriel(m.total, 'agent')} en service (${fonctions.join(', ')})${moyen(m.pif, 'poste d\'inspection filtrage (PIF)', 'postes d\'inspection filtrage (PIF)')}${moyen(m.detecteurs, 'détecteur de métaux', 'détecteurs de métaux')}`;
}

/**
 * La mise en situation `m` est-elle celle que décrit ce champ du cadre (sa question et son contexte proche, sans le critère
 * parent) ? Deux mots porteurs au moins de son libellé ou de sa citation s'y retrouvent (vitry 202 : « forum des
 * associations »). Génération réelle etampes2 552 : le dispositif de la fête communale (cas pratique, présenté au champ 8)
 * était ajouté au champ « Mise en situation appliquée : absence de 2 agents et d'1 chien… », qui porte sur un autre sujet.
 */
export function miseEnSituationDuChamp(texteChamp: string, m: MiseEnSituation): boolean {
  const VIDES = new Set(['mise', 'mises', 'situation', 'situations', 'securite', 'securisation', 'assurer', 'agents', 'agent', 'heures', 'pendant', 'journee', 'public', 'publique', 'personnes', 'dont', 'voici', 'caracteristiques', 'principales', 'candidat', 'solution', 'descriptif', 'appliquee', 'perimetre', 'defini']);
  const OUTILS = new Set(['pour', 'dans', 'avec', 'sans', 'sous', 'vers', 'chez', 'leur', 'leurs', 'cette', 'tout', 'tous', 'toute', 'toutes', 'type', 'cours', 'lors', 'ainsi', 'sein', 'plus', 'moins', 'selon', 'entre', 'aux', 'des', 'les', 'une']);
  const mots = (t: string) => new Set(normaliser(t).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length >= 4 && !VIDES.has(w) && !OUTILS.has(w)).map((w) => w.replace(/s$/, '')));
  const champ = mots(texteChamp);
  const propres = [...mots(`${m.libelle} ${m.citation || ''}`)];
  return propres.filter((w) => champ.has(w)).length >= 2;
}

/** Question exacte posée à GSS pour chaque mise en situation (proposition à valider, D5). */
export function questionsMisesEnSituation(d: Dimensionnement | null | undefined): string[] {
  return (d?.misesEnSituation || []).map((m) => `Proposition à valider : ${m.libelle}${m.capacite ? ` (jusqu'à ${String(m.capacite).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} personnes)` : ''} : validez-vous ${dispositifMiseEnSituation(m)} ?`);
}

/**
 * Réponse à une mise en situation qui ne donne pas le nombre demandé (vitry 202 : « Le nombre d'agents… est établi à
 * partir du plan… », sans aucun nombre) : le dispositif proposé de chaque mise en situation est ajouté, en lignes
 * entières, après le texte. Rien n'est ajouté si chaque total figure déjà dans la réponse.
 */
export function completerMisesEnSituation(texte: string, d: Dimensionnement | null | undefined, champ?: string): { texte: string; n: number } {
  // Champ du cadre donné : seulement les mises en situation qu'il décrit (miseEnSituationDuChamp).
  const ms = (d?.misesEnSituation || []).filter((m) => champ === undefined || miseEnSituationDuChamp(champ, m));
  const manque = ms.filter((m) => !new RegExp(`(?<![\\d])${m.total}\\s+agents?\\b`).test(texte));
  if (!manque.length) return { texte, n: 0 };
  return { texte: `${String(texte || '').trimEnd()}\n\nDispositif proposé :\n${manque.map((m) => `• ${m.libelle} : ${dispositifMiseEnSituation(m)}.`).join('\n')}`, n: manque.length };
}

/** « 2 agent de sécurité » → « 2 agents de sécurité », « 2 maître-chien » → « 2 maîtres-chiens ». */
export function effectifProfil(n: number, profil: string): string {
  const p = profil.charAt(0).toLowerCase() + profil.slice(1);
  if (n <= 1) return `${n} ${p}`;
  if (/^ma[îi]tre-chien$/i.test(p)) return `${n} maîtres-chiens`;
  return `${n} ${p.replace(/^([a-zàâçéèêëîïôûü'-]+?)(?<![sx])(?=\s|$)/i, '$1s')}`;
}

const fr = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
/** « ; 2 agents en même temps sur le poste » : le plancher qui fixe le nombre de titulaires au-delà du calcul en ETP. */
const simultanesTexte = (x: ProfilDimensionne) => (x.simultanes && x.simultanes > 1 ? ` ; ${x.simultanes} agents en même temps sur le poste` : '');
const pluriel = (n: number, s: string, p = `${s}s`) => `${n} ${n > 1 ? p : s}`;

/** Catégorie de personnel du tableau de l'équipe dédiée (vocabulaire du mémoire type), d'après le profil du DCE. */
export function categorieDe(profil: string): string {
  const p = normaliser(profil);
  // « Agent conducteur de chien » (ifits 701) : un agent cynophile.
  if (/cynophil|maitre.chien|conducteurs? (?:de )?chiens?/.test(p)) return 'Agent cynophile';
  if (/ssiap\s*3/.test(p)) return 'Chef de service de sécurité incendie';
  if (/ssiap\s*2/.test(p)) return 'Chef d\'équipe de sécurité incendie';
  if (/ssiap\s*1/.test(p) && !/\bads\b|cqp|agent de securite(?! incendie)/.test(p)) return 'Agent de sécurité incendie';
  if (/encadr|chef de poste|chef d.equipe/.test(p)) return profil;
  // T7N-7 : le libellé du DQE « Agent de sécurité incendie » (sans « SSIAP 1 ») n'est pas un agent de sécurité générique.
  if (/(?:agent|securite) (?:de )?(?:securite )?incendie/.test(p) && !/\bads\b|cqp/.test(p)) return 'Agent de sécurité incendie';
  if (/\bads\b|cqp|agent de (?:securite|surveillance|surete)|agent de prevention/.test(p)) return 'Agent de sécurité';
  return profil;
}

/**
 * Lignes du tableau « L'équipe dédiée », une par catégorie et qualification (génération réelle imm 16 : « Agent de sécurité |
 * SSIAP 1, SST, carte CNAPS » deux fois, pour les postes N2 et N3) : effectifs, heures et ETP additionnés. La même
 * regroupement sert à la question posée à GSS et au premier message de l'assistant (T1F-3 : jamais un chiffre montré à GSS
 * différent du tableau imprimé). Plusieurs postes distincts réunis dans une ligne : aucun « N agents en même temps sur le
 * poste » (ce nombre vaut pour un poste, pas pour la ligne).
 */
export function lignesEquipeGroupees(d: Dimensionnement): Array<ProfilDimensionne & { categorie: string; postes: number }> {
  const lignes = new Map<string, ProfilDimensionne & { categorie: string; postes: number }>();
  for (const x of d.profils) {
    const categorie = categorieDe(x.profil);
    const cle = x.observation ? `${normaliser(x.profil)}|obs` : `${normaliser(categorie)}|${normaliser(x.qualification)}`;
    const y = lignes.get(cle);
    if (!y) { lignes.set(cle, { ...x, lieux: [...x.lieux], categorie, postes: 1 }); continue; }
    y.postes += 1;
    y.titulaires += x.titulaires;
    y.simultanes = undefined;
    y.heuresSemaine = Math.round((y.heuresSemaine + x.heuresSemaine) * 100) / 100;
    y.heuresAn += x.heuresAn;
    y.etp = Math.round((y.etp + x.etp) * 100) / 100;
    for (const l of x.lieux) if (!y.lieux.includes(l)) y.lieux.push(l);
  }
  return [...lignes.values()];
}

/** Lignes du tableau « L'équipe dédiée » (catégorie, qualification, nombre, observations). */
export function lignesEquipe(d: Dimensionnement): string {
  return lignesEquipeGroupees(d).map((x) => `| ${x.categorie} | ${x.qualification} | ${x.titulaires} | ${x.observation || `${fr(x.heuresSemaine)} h par semaine${x.lieux.length ? ` (${x.lieux.join(', ')})` : ''}, soit ${fr(x.etp)} ETP${simultanesTexte(x)}`} |`).join('\n');
}

/**
 * Exigence qui ne fait que définir un poste et ses horaires, poste déjà repris par le dimensionnement (même poste, même
 * site) : ce n'est pas une question nouvelle (ifsem 335 : « présence permanente d'un ADS à Ivry, 7 j/7 et 24 h/24, en
 * vacations de 7 h à 19 h et de 19 h à 7 h » proposée à part avec un engagement « [À COMPLÉTER] », alors que le tableau
 * de l'équipe dédiée compte déjà les ADS du site d'Ivry-sur-Seine).
 */
export function exigenceDePosteDimensionne(exigence: string, d: Dimensionnement | null | undefined): boolean {
  if (!d?.profils?.length) return false;
  const net = (t: string) => ` ${normaliser(t).replace(/[^a-z0-9]+/g, ' ').trim()} `;
  const e = net(exigence);
  if (!/ 24 ?h ?24 | 7 ?j(?:ours)? ?(?:sur )?7 | \d{1,2} ?h(?: ?\d{2})? (?:a|au|jusqu a) \d{1,2} ?h|vacations?|permanen|en continu|jour et nuit/.test(e)) return false;
  const GENERIQUES = new Set(['site', 'sites', 'campus', 'batiment', 'batiments', 'centre', 'sur', 'seine', 'saint', 'sainte', 'principal', 'annexe']);
  return d.profils.some((p) => {
    const prof = net(p.profil);
    const q = net(p.qualification).trim();
    const poste = (/ agents? de (?:securite|surveillance|surete) | ads /.test(prof) && / ads | agents? de (?:securite|surveillance|surete) /.test(e))
      || (!!q && q.length >= 4 && e.includes(` ${q} `));
    if (!poste) return false;
    return p.lieux.some((l) => net(l).trim().split(' ').filter((w) => w.length >= 4 && !GENERIQUES.has(w)).some((w) => e.includes(` ${w} `)));
  });
}

/**
 * Mises en situation déjà proposées à GSS pour le même DCE (même empreinte de l'extrait, mêmes mises en situation) :
 * reprises telles quelles, pour que la proposition ne change pas d'une génération à l'autre (vitry 241 puis 351 : forum
 * à 22 puis 45 agents, concert à 40 puis 78). Sinon, les nouvelles.
 */
export function reprendreMisesEnSituation(nouvelles: MiseEnSituation[], precedent: { empreinte: string; misesEnSituation: any[] } | undefined, empreinte: string): { misesEnSituation: MiseEnSituation[]; reprises: boolean } {
  const anciennes = Array.isArray(precedent?.misesEnSituation) ? precedent!.misesEnSituation as MiseEnSituation[] : [];
  const cle = (m: MiseEnSituation) => `${normaliser(String(m?.libelle || '')).replace(/[^a-z0-9]+/g, ' ').trim()}|${m?.capacite ?? ''}`;
  const memes = !!precedent && precedent.empreinte === empreinte && anciennes.length === nouvelles.length && anciennes.length > 0
    && anciennes.every((a) => Array.isArray(a?.fonctions) && a.fonctions.length > 0 && nouvelles.some((n) => cle(n) === cle(a)));
  // Proposition reprise telle quelle, sauf un « 0 » PIF ou détecteur enregistré avant le tour 5 que la lecture du DCE tient
  // désormais pour non demandé (null) : il n'est jamais imprimé (T5CP-3).
  const reprise = (n: MiseEnSituation): MiseEnSituation => {
    const a = anciennes.find((x) => cle(x) === cle(n))!;
    return { ...a, pif: a.pif === 0 && n.pif === null ? null : a.pif, detecteurs: a.detecteurs === 0 && n.detecteurs === null ? null : a.detecteurs, citation: a.citation || n.citation };
  };
  return memes ? { misesEnSituation: nouvelles.map(reprise), reprises: true } : { misesEnSituation: nouvelles, reprises: false };
}

/** Phrase de synthèse du dispositif d'un cas pratique, plage par plage. */
export function syntheseCasPratique(d: Dimensionnement): string {
  const plages = [...new Set(d.casPratique.map((l) => l.plage))];
  return plages.map((p) => {
    const l = d.casPratique.filter((x) => x.plage === p && x.enService > 0);
    return `${p} : ${l.length ? l.map((x) => `${effectifProfil(x.enService, x.profil)}${x.rotation > x.enService ? ` (${x.rotation} pour la rotation)` : ''}`).join(', ') : 'aucun agent'}`;
  }).join(' ; ');
}

/** « 6 h », « 22 h 30 » (heures décimales → écriture du mémoire). */
const ecrireHeure = (h: number) => { const x = ((h % 24) + 24) % 24; const hh = Math.floor(x + 1e-9); const mn = Math.round((x - hh) * 60); return `${hh} h${mn ? ` ${String(mn).padStart(2, '0')}` : ''}`; };

/**
 * Couverture horaire du cas pratique, contrôlée sans modèle contre le DCE (consignes 1 et 4, D7) : durée demandée (« pour
 * 48 heures ») et heures d'ouverture au public (« de 8h à 22h30 ») comparées aux plages du dispositif proposé. Génération
 * réelle etampes2 552 : plages du DQE dimanche 6 h–21 h, nuit 21 h–6 h et lundi 6 h–21 h (39 h sur 48), public présent
 * jusqu'à 22 h 30 avec le seul effectif de nuit. Renvoie les écarts (phrases), [] si la couverture est complète ou si le
 * DCE ne donne ni durée ni heures d'ouverture.
 */
export function ecartsCouvertureCasPratique(d: Dimensionnement | null | undefined, dce: string): string[] {
  const lignes = d?.casPratique || [];
  if (!lignes.length) return [];
  const plages = new Map<string, { debut: number; fin: number; duree: number }>();
  for (const l of lignes) {
    if (plages.has(l.plage)) continue;
    const debut = heureDe(String(l.debut || '').replace(':', 'h')), fin = heureDe(String(l.fin || '').replace(':', 'h'));
    plages.set(l.plage, { debut, fin, duree: l.dureeH });
  }
  const t = String(dce || '').replace(/\s+/g, ' ');
  const ecarts: string[] = [];
  // Durée demandée par le cas pratique (dans le passage « cas pratique » du DCE).
  let duree = 0;
  for (const m of t.matchAll(/cas pratique/gi)) {
    const x = /\bpour\s+(\d{1,3})\s*heures\b/i.exec(t.slice(m.index || 0, (m.index || 0) + 300));
    if (x) { duree = Number(x[1]); break; }
  }
  const couvert = Math.round([...plages.values()].reduce((a, p) => a + p.duree, 0) * 100) / 100;
  const liste = [...plages.keys()].map((x) => `« ${x} »`).join(', ');
  if (duree && couvert + 0.01 < duree) ecarts.push(`les plages du dispositif (${liste}) couvrent ${String(couvert).replace('.', ',')} h sur les ${duree} heures du cas pratique`);
  // Heures d'ouverture au public : chaque plage de jour qui finit avant la fermeture (ou commence après l'ouverture).
  const o = /heures?\s+d.ouverture[^:]{0,80}:\s*de\s*(\d{1,2})\s*h\s*(\d{2})?\s*(?:à|a|-)\s*(\d{1,2})\s*h\s*(\d{2})?/i.exec(t);
  if (o) {
    const ouverture = Number(o[1]) + Number(o[2] || 0) / 60, fermeture = Number(o[3]) + Number(o[4] || 0) / 60;
    const jour = [...plages.entries()].filter(([, p]) => !Number.isNaN(p.debut) && !Number.isNaN(p.fin) && p.fin > p.debut);
    const finJour = jour.filter(([, p]) => p.fin < fermeture - 0.01 && p.fin > ouverture);
    if (finJour.length) {
      const fin = Math.max(...finJour.map(([, p]) => p.fin));
      ecarts.push(`le public reste présent jusqu'à ${ecrireHeure(fermeture)} alors que ${finJour.length > 1 ? 'les plages de jour finissent' : 'la plage de jour finit'} à ${ecrireHeure(fin)} (${finJour.map(([n]) => `« ${n} »`).join(', ')}) : de ${ecrireHeure(fin)} à ${ecrireHeure(fermeture)}, l'effectif de jour n'est plus en service`);
    }
    const debutJour = jour.filter(([, p]) => p.debut > ouverture + 0.01 && p.debut < fermeture);
    if (debutJour.length) ecarts.push(`le public est accueilli dès ${ecrireHeure(ouverture)} alors que ${debutJour.map(([n]) => `« ${n} »`).join(', ')} commence${debutJour.length > 1 ? 'nt' : ''} à ${ecrireHeure(Math.min(...debutJour.map(([, p]) => p.debut)))}`);
  }
  return ecarts;
}

/** Question exacte posée à GSS sur la couverture horaire du cas pratique (proposition à valider, D5). '' sans écart. */
export function questionCouvertureCasPratique(d: Dimensionnement | null | undefined, dce: string): string {
  const e = ecartsCouvertureCasPratique(d, dce);
  if (!e.length) return '';
  return `Proposition à valider : couverture horaire du cas pratique — ${e.join(' ; ')}. Faut-il renforcer le dispositif sur ces heures (avec quel effectif, sur quelles heures), ou le dispositif proposé convient-il tel quel ?`;
}

/** Question consolidée posée à GSS (proposition à valider). */
export function questionDimensionnement(d: Dimensionnement): string {
  const parts: string[] = [];
  if (d.profils.length && !d.profils.some((x) => x.observation)) {
    // Lignes du tableau imprimé (T1F-3) : la question dit exactement ce que le mémoire imprime.
    parts.push(`équipe dédiée de ${pluriel(d.titulaires, 'agent titulaire', 'agents titulaires')} (${lignesEquipeGroupees(d).map((x, _i, t) => `${x.categorie}${t.filter((y) => y.categorie === x.categorie).length > 1 ? ` (${x.qualification})` : ''} : ${pluriel(x.titulaires, 'titulaire')} pour ${fr(x.heuresSemaine)} h par semaine${x.postes > 1 ? ` (${x.postes} postes)` : ''}${simultanesTexte(x)}`).join(' ; ')}, base de 1 607 heures par an et par ETP) et équipe suppléante de ${pluriel(d.suppleants, 'agent formé', 'agents formés')} au site`);
  }
  if (d.casPratique.length) parts.push(`dispositif du cas pratique (${syntheseCasPratique(d)} ; vacations de ${VACATION_MAX_H} heures au plus)${d.titulaires ? `, d'où une équipe de ${pluriel(d.titulaires, 'agent titulaire', 'agents titulaires')} (${d.profils.map((x) => effectifProfil(x.titulaires, x.profil)).join(', ')}) et une équipe suppléante de ${pluriel(d.suppleants, 'agent', 'agents')}` : ''}`);
  return `Proposition à valider : dimensionnement calculé à partir des postes et des horaires du DCE — ${parts.join(' ; ')}. GSS valide ces effectifs ou les modifie dans l'assistant.${(d.alertes || []).length ? ` Attention : ${d.alertes!.join(' ; ')}` : ''}`;
}

/** Bloc des consignes de rédaction (cadre imposé) : les chiffres proposés, à reprendre tels quels. */
export function texteDimensionnement(d: Dimensionnement): string {
  // Rien à reprendre (seulement des rondes ponctuelles sans durée, T9N-1) : aucune consigne de chiffres.
  if (!d.profils.length && !d.casPratique.length && !(d.misesEnSituation || []).length) return '';
  const l: string[] = ['', '', 'DIMENSIONNEMENT PROPOSÉ PAR GSS (calculé à partir des postes et des horaires du DCE ; proposition que GSS validera en interne : n\'écris jamais dans le texte que ces chiffres sont proposés, à valider ou à confirmer — reprends ces chiffres EXACTEMENT là où l\'effectif, le nombre d\'agents, de maîtres-chiens, d\'équipes ou les rotations sont demandés, au lieu d\'écrire [À COMPLÉTER]) :'];
  for (const x of d.profils) l.push(x.observation ? `- ${x.profil} (${x.qualification}) : ${pluriel(x.titulaires, 'titulaire')} (${x.observation})` : `- ${x.profil} (${x.qualification}) : ${fr(x.heuresSemaine)} h par semaine, ${fr(x.heuresAn)} h par an, soit ${fr(x.etp)} ETP → ${pluriel(x.titulaires, 'titulaire')}${x.lieux.length ? ` (${x.lieux.join(', ')})` : ''}${simultanesTexte(x)}`);
  if (d.profils.length) l.push(`- Équipe dédiée : ${pluriel(d.titulaires, 'agent titulaire', 'agents titulaires')} ; équipe suppléante formée au site : ${pluriel(d.suppleants, 'agent', 'agents')}.`);
  // Cadre de l'université de Rouen (génération réelle rouen_univ 15) : « Nombre total d'agents … dédiés en ETP » laissé à
  // « [À COMPLÉTER] » et cellules par site au format variable (« 8 titulaires + 6 agents formés » pour un site, postes du
  // CCTP pour les autres, toute l'équipe suppléante du marché dans la cellule d'un seul site).
  const etp = d.profils.filter((x) => !x.observation).reduce((a, x) => a + x.etp, 0);
  if (etp > 0) l.push(`- Total des postes : ${fr(etp)} ETP (à reprendre là où un nombre d'agents en ETP est demandé).`);
  if (d.profils.length) l.push(`- Tableau des moyens humains par site : une cellule par site, au même format pour toutes (postes et horaires du CCTP pour ce site), sans répartir l'équipe suppléante entre les sites (elle se cite une seule fois, pour tout le marché).`);
  for (const m of d.misesEnSituation || []) l.push(`- ${m.libelle} (dispositif de GSS) : ${dispositifMiseEnSituation(m)}. Reprends ces nombres EXACTEMENT dans la réponse à cette mise en situation (nombre d'agents, catégories de personnel, PIF, détecteurs de métaux). N'écris jamais dans la réponse que ce dispositif est « proposé », « à valider » ou à confirmer : cette validation est interne à GSS.`);
  if (d.casPratique.length) {
    l.push(`- Cas pratique (effectif en service et effectif nécessaire pour la rotation, vacations de ${VACATION_MAX_H} heures au plus) :`);
    for (const x of d.casPratique) l.push(`  • ${x.plage} | ${x.profil} | en service : ${x.enService} | rotation : ${x.rotation}${x.justification ? ` — ${x.justification}` : ''}`);
  }
  return l.join('\n');
}

/**
 * Cases d'un cas pratique laissées « [À COMPLÉTER] » (« Dimanche férié, 6 h–21 h | Agent de sécurité | en service :
 * [À COMPLÉTER] | rotation : [À COMPLÉTER] ») et phrase « Dimensionnement proposé … : [À COMPLÉTER] » : remplies
 * avec le dispositif proposé quand la plage et le profil sont reconnus.
 */
export function remplirCasPratique(texte: string, d: Dimensionnement): { texte: string; n: number } {
  if (!d.casPratique.length) return { texte, n: 0 };
  let n = 0;
  const heures = (t: string) => (normaliser(t).match(/\d{1,2}(?=\s*h)/g) || []).map(Number).join('-');
  const jour = (t: string) => (/(dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi|nuit)/.exec(normaliser(t)) || [''])[0];
  const profilNorm = (t: string) => normaliser(t).replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/s\b/g, '');
  const trouver = (plage: string, profil: string) => {
    const cands = d.casPratique.filter((x) => jour(x.plage) === jour(plage) && heures(x.plage) === heures(plage));
    const p = profilNorm(profil);
    return cands.find((x) => profilNorm(x.profil) === p) || cands.filter((x) => p.includes(profilNorm(x.profil)) || profilNorm(x.profil).includes(p))
      .sort((a, b) => Math.abs(profilNorm(a.profil).length - p.length) - Math.abs(profilNorm(b.profil).length - p.length))[0];
  };
  const lignes = texte.split('\n').map((ligne) => {
    const c = ligne.split('|').map((x) => x.trim());
    // Ligne « plage | profil | en service | rotation » déjà chiffrée par la rédaction mais différente du dispositif
    // proposé (T9N-5, etampes2 553 : « Dimanche férié, 6 h–21 h | Encadrant | 0 | 0 » alors que la proposition compte 1
    // encadrant en service, 2 pour la rotation) : les chiffres de la proposition, que GSS valide, sont repris.
    if (c.length === 4 && /^\d+$/.test(c[2]) && /^\d+$/.test(c[3])) {
      const x = trouver(c[0], c[1]);
      if (x && (Number(c[2]) !== x.enService || Number(c[3]) !== x.rotation)) {
        n++;
        const cellules = ligne.split('|');
        cellules[2] = cellules[2].replace(/\d+/, String(x.enService));
        cellules[3] = cellules[3].replace(/\d+/, String(x.rotation));
        return cellules.join('|');
      }
      return ligne;
    }
    if (c.length >= 4 && /\[À COMPLÉTER\]/.test(ligne)) {
      const x = trouver(c[0], c[1]);
      if (!x) return ligne;
      n++;
      return ligne.replace(/(en service\s*:\s*)\[À COMPLÉTER\]/i, `$1${x.enService}`).replace(/(rotation\s*:\s*)\[À COMPLÉTER\]/i, `$1${x.rotation}`);
    }
    if (/dimensionnement propos[ée]/i.test(ligne) && /\[À COMPLÉTER\]/.test(ligne)) {
      n++;
      return ligne.replace(/\[À COMPLÉTER\]/, syntheseCasPratique(d));
    }
    return ligne;
  });
  return { texte: lignes.join('\n'), n };
}

/**
 * Le dispositif du cas pratique est-il repris dans le texte (« plage | profil | en service | rotation » aux chiffres de la
 * proposition, ou « en service : N ») ? Sert à poser la proposition à valider à GSS dans le cadre (T9N-5).
 */
export function casPratiqueRepris(texte: string, d: Dimensionnement | null | undefined): boolean {
  if (!d?.casPratique.length) return false;
  const t = String(texte || '');
  if (d.casPratique.some((x) => t.includes(`en service : ${x.enService}`))) return true;
  const lignes = t.split('\n').filter((l) => { const c = l.split('|').map((x) => x.trim()); return c.length === 4 && /^\d+$/.test(c[2]) && /^\d+$/.test(c[3]); });
  return lignes.length > 0 && remplirCasPratique(lignes.join('\n'), d).n === 0 && lignes.some((l) => d.casPratique.some((x) => l.split('|')[1].trim().toLowerCase() === x.profil.toLowerCase()));
}

/** Pièces du DCE utiles au dimensionnement : CCTP, annexes (plannings), DQE et BPU, cadre de réponse (cas pratique). */
export function extraitDimensionnement(dce: string, cadre = '', max = 90_000): string {
  const blocs = String(dce || '').split(/\n\n--- (.+?) ---\n|\n?===== PIÈCE : (.+?) =====\n/);
  const avant: string[] = [];
  const apres: string[] = [];
  for (let i = 1; i < blocs.length; i += 3) {
    const nom = blocs[i] || blocs[i + 1] || '';
    const corps = blocs[i + 2] || '';
    const n = `${nom} ${nom.replace(/[_.\s-]+/g, '')}`;
    if (/ccap|\bRC\b|r[èe]glement|acte d.engagement|\bAE\b|d[ée]claration|attestation|candidature/i.test(n)) {
      // Règlement de consultation : seulement les passages d'une mise en situation ou d'un cas pratique (vitry 202 : le
      // forum et le concert, capacité de 10 000 personnes, ne sont décrits que dans le tableau des critères du RC).
      if (/\bRC\b|r[èe]glement/i.test(n)) {
        const passages: string[] = [];
        for (const m of corps.matchAll(/mises? en situation|cas pratiques?/gi)) {
          const debut = Math.max(0, (m.index || 0) - 200);
          if (passages.length && debut < Number(passages[passages.length - 1].split('|')[0]) + 1800) continue;
          passages.push(`${debut}|${corps.slice(debut, debut + 2200)}`);
        }
        if (passages.length) avant.push(`=== ${nom} (passages : mises en situation) ===\n${passages.map((x) => x.split('|').slice(1).join('|')).join('\n[…]\n')}`);
      }
      continue;
    }
    // Volumes horaires et plannings d'abord (courts), puis le CCTP.
    if (/dqe|bpu|bordereau|planning|annexe|cadre|m[ée]moire/i.test(n)) avant.push(`=== ${nom} ===\n${corps}`);
    else apres.push(`=== ${nom} ===\n${corps}`);
  }
  const t = [...(cadre ? [`=== CADRE DE RÉPONSE ===\n${cadre.slice(0, 20_000)}`] : []), ...avant, ...apres].join('\n\n') || String(dce || '');
  return t.length > max ? t.slice(0, max) : t;
}

export const CONSIGNE_DIMENSIONNEMENT = `Tu lis le DCE d'un marché de sécurité privée pour GSS. Tu ne calcules aucun total : les calculs sont faits ensuite.
1. "postes" (relevé, sans rien ajouter) : chaque poste de travail permanent ou planifié que le titulaire doit tenir (une entrée par poste et par lieu) :
   - "profil" : intitulé court du poste dans les mots du DCE (ex. « SSIAP 2 », « SSIAP 1 », « Agent de sécurité ADS », « Agent de sécurité SSIAP 1 – CQP APS »), sans le nombre d'agents (« 2 agents » sous « Gardiennage de surveillance » : « Agent de sécurité ») ;
   - "qualification" : qualification exigée (ex. « SSIAP 2 », « CQP APS – SSIAP 1 ») ;
   - "lieu" : bâtiment ou site, si le DCE le précise ;
   - "agents_simultanes" : le nombre d'agents présents EN MÊME TEMPS sur ce poste, tel qu'il est écrit dans la citation (« le déploiement de 2 agents de sécurité (ADS) sur une heure » → 2 ; « 1 SSIAP 1 » → 1) ; 1 si le DCE ne le précise pas ;
   - "plages" : chaque plage horaire hebdomadaire DU POSTE, {"jours": ["lundi", …], "debut": "07:00", "fin": "19:00", "periode": "…"} (une plage de nuit finit le lendemain : "debut": "19:00", "fin": "07:00") ; ignore les jours fériés ; ne répète pas une plage pour chaque agent (leur nombre est dans "agents_simultanes") ; "periode" : la période de l'année où la plage s'applique, recopiée mot pour mot du DCE (« Du 1er mai au 30 septembre », « Les mois d'octobre, mars et avril », « la saison démarre le dernier week-end de mars et s'achève le dernier week-end de septembre »), "" si la plage vaut toute l'année ; une plage par période, jamais deux périodes dans la même plage ;
   - "heures_hebdo" : le volume hebdomadaire total si le DCE (DQE, BPU) le donne en heures pour ce poste, sinon null ;
   - "heures_an" : le volume annuel en heures si le DCE le donne, sinon null ;
   - "citation" : la phrase ou la ligne du DCE d'où vient le poste, recopiée mot pour mot.
   Ne relève pas les prestations ponctuelles sur bon de commande sans horaires fixés, ni les interventions sur alarme, ni les options (« option », « agent supplémentaire » que l'acheteur se réserve d'ajouter).
   Des rondes ou passages ponctuels (« 3 rondes entre 21h30 et 06h30 ») ne sont pas des plages de poste : relève leur nombre et leur fenêtre dans la citation, sans "plages" (liste vide) ni heures.
2. "cas_pratique" : seulement si le DCE ou le cadre de réponse pose un cas pratique ou une mise en situation qui demande le nombre d'agents par plage (sinon null). Ici, et seulement ici, tu PROPOSES le dispositif de GSS : c'est ce que l'acheteur demande au candidat.
   - "plages" : [{"libelle": "Dimanche férié, 6 h–21 h", "debut": "06:00", "fin": "21:00"}, …], libellés courts (jour et horaires) ;
   - "dispositif" (OBLIGATOIRE, jamais vide) : une entrée pour CHAQUE plage et CHAQUE profil demandé (agent de sécurité, maître-chien, agent de sécurité incendie, encadrant…), {"plage": "<libelle exact de la plage>", "profil": "<profil du DCE>", "en_service": <entier>, "justification": "<une phrase>"} : l'effectif EN SERVICE que GSS propose, argumenté par le site décrit (surface, nombre de bâtiments, accès, clôture, quartier, risques de jour et de nuit) ; 0 si le profil n'est pas utile sur cette plage (dis pourquoi). Un maître-chien travaille en binôme avec son chien ; sous 10 agents en service sur la plage, un encadrant peut passer ponctuellement (0 en service, contrôle par passage) ; à partir de 10 agents en service, GSS prévoit 1 responsable pour 10 agents (règle de GSS sur les grands dispositifs).
3. "mises_en_situation" : seulement si le DCE (règlement de consultation ou cadre de réponse) décrit une mise en situation ou un cas pratique ÉVÉNEMENTIEL (forum, concert, salon, manifestation : capacité d'accueil, plein air, nocturne…) et demande le nombre d'agents et les catégories de personnel (sinon []). Ici aussi tu PROPOSES le dispositif de GSS, une entrée par mise en situation :
   - "libelle" : nom court, ex. « Mise en situation 1 : forum des associations (journée, plein air, enceinte fermée) » ;
   - "citation" : la phrase du DCE qui la décrit, recopiée mot pour mot ;
   - "capacite" : la capacité maximale d'accueil du public écrite dans le DCE (entier), sinon null ;
   - "dispositif" : [{"fonction": "Chef de site", "nombre": <entier>, "justification": "<une phrase>"}, {"fonction": "Agent de sécurité au filtrage des accès", …}, {"fonction": "Agent de sécurité en surveillance et rondes", …}, …] : l'effectif EN SERVICE par fonction, argumenté par la capacité, les accès et issues, le plein air, la nuit, les risques (feu d'artifice, foule) ; uniquement des fonctions de sécurité privée ;
   - "pif" : le nombre de postes d'inspection filtrage proposés (entier), null si le DCE ne les demande pas ; "detecteurs" : le nombre de détecteurs de métaux (entier), null si le DCE ne les demande pas.
Réponds UNIQUEMENT par un objet JSON : {"postes": [...], "cas_pratique": {...} ou null, "mises_en_situation": [...]}`;

/** Paragraphe du premier message de l'assistant : le dimensionnement proposé, à valider ou à modifier avant la remise. */
export function messageDimensionnement(d: Dimensionnement, dce?: string): string {
  const l: string[] = ['J\'ai aussi proposé les effectifs, calculés à partir des postes et des horaires du cahier des charges (à relire avant la remise) :'];
  // Lignes du tableau imprimé (T1F-3).
  for (const x of lignesEquipeGroupees(d)) l.push(x.observation ? `- ${x.profil} : ${pluriel(x.titulaires, 'titulaire')} (${x.observation}) ;` : `- ${x.categorie} : ${fr(x.heuresSemaine)} h par semaine${x.postes > 1 ? ` sur ${x.postes} postes` : ''}, soit ${fr(x.etp)} ETP → ${pluriel(x.titulaires, 'titulaire')}${simultanesTexte(x)} ;`);
  if (d.profils.length) l.push(`- équipe dédiée de ${pluriel(d.titulaires, 'agent titulaire', 'agents titulaires')} et équipe suppléante de ${pluriel(d.suppleants, 'agent formé', 'agents formés')} au site ;`);
  for (const m of d.misesEnSituation || []) l.push(`- ${m.libelle.charAt(0).toLowerCase()}${m.libelle.slice(1)} : ${dispositifMiseEnSituation(m)} ;`);
  for (const p of [...new Set(d.casPratique.map((x) => x.plage))]) l.push(`- cas pratique, ${p} : ${d.casPratique.filter((x) => x.plage === p && x.enService > 0).map((x) => `${effectifProfil(x.enService, x.profil)} (rotation ${x.rotation})`).join(', ') || 'aucun agent'} ;`);
  for (const a of d.alertes || []) l.push(`- attention : ${a}`);
  // Couverture horaire incomplète du cas pratique : signalée à GSS (T5CP-5).
  const ecarts = dce === undefined ? [] : ecartsCouvertureCasPratique(d, dce);
  if (ecarts.length) l.push(`- attention, couverture du cas pratique : ${ecarts.join(' ; ')} ;`);
  l.push('', `Vous pouvez les valider (« Je valide les effectifs proposés ») ou les modifier (« ${exempleModification(d)} »).`);
  return l.join('\n');
}

/**
 * Exemple de modification donné à GSS dans le premier message (T10N-1) : un profil du dispositif proposé pour ce marché,
 * écrit comme l'assistant le lit (« Mets 6 agents de sécurité dans l'équipe dédiée », « Mets 3 maîtres-chiens en service sur la
 * plage « Samedi, 21 h–6 h » »), jamais un profil absent du marché (etampes2 : aucun SSIAP 2).
 */
export function exempleModification(d: Dimensionnement): string {
  const forme = (profil: string, qualification = ''): string => {
    const t = `${profil} ${qualification}`;
    const ssiap = /SSIAP\s*([123])/i.exec(t);
    if (/chef d['’][ée]quipe/i.test(profil)) return "chefs d'équipe";
    if (ssiap) return `agents SSIAP ${ssiap[1]}`;
    if (/cynophile|ma[îi]tres?[- ]chiens?/i.test(t)) return 'maîtres-chiens';
    if (/rondier/i.test(t)) return 'rondiers';
    if (/encadr/i.test(t)) return 'encadrants';
    return 'agents de sécurité';
  };
  const x = d.profils[0];
  if (x) return `Mets ${x.titulaires + 1} ${forme(x.profil, x.qualification)} dans l'équipe dédiée`;
  const c = d.casPratique.find((y) => y.enService > 0);
  if (c) return `Mets ${c.enService + 1} ${forme(c.profil)} en service sur la plage « ${c.plage} »`;
  const m = (d.misesEnSituation || []).find((y) => y.fonctions?.length);
  if (m) return `Passe la fonction « ${m.fonctions[0].fonction} » à ${m.fonctions[0].nombre + 1} agents pour la ${m.libelle.split(/\s*:\s*/)[0].replace(/^./, (ch) => ch.toLowerCase())}`;
  return "Mets 7 agents SSIAP 2 dans l'équipe dédiée";
}

/** Espace insécable entre un nombre et son unité (« 6 h », « 21 h », « 2 agents ») : le moteur de schémas ne coupe jamais
 *  la ligne entre les deux (génération réelle etampes2 552 : titre « Dimanche et lundi, 6 / h–21 h »). */
export function insecablesNombres(t: string): string {
  return String(t || '').replace(/(\d)[ \t]+(?=(?:h|min|minutes?|heures?|jours?|km|%|€|agents?|ma[îi]tres?-chiens?|encadrants?|PIF)(?![\p{L}]))/gu, '$1\u00a0');
}

/** Textes possibles d'une carte du schéma du cas pratique (86 caractères au plus, jamais coupés) : le dispositif en service
 *  de la plage, du plus complet au plus court. */
function formesDispositifPlage(l: LigneCasPratique[]): string[] {
  if (!l.length) return ['Aucun agent en service', 'Aucun agent en service', 'Aucun agent en service'];
  const profils = l.map((x) => effectifProfil(x.enService, x.profil));
  const liste = profils.length > 1 ? `${profils.slice(0, -1).join(', ')} et ${profils[profils.length - 1]}` : profils[0];
  return [`${profils.join(' + ')} en service ; rotation : ${l.map((x) => x.rotation).join(' + ')}`, `${liste} en service`, liste];
}

/**
 * Étapes du schéma demandé par l'intitulé d'un champ (« Schéma opérationnel (comprenant la répartition des effectifs) ») :
 * la répartition du cas pratique plage par plage, puis l'étape de résultat ; sans cas pratique, les sous-titres de la
 * réponse en phases successives. Mots et chiffres repris de la réponse (contrôle du moteur de schémas). null si moins de
 * trois étapes, ou si le dispositif d'une plage ne tient pas entier dans sa carte.
 * L'étape de résultat vient du texte réel (`resultat` : une phrase de la réponse), sinon du fait établi par construction
 * (chaque plage du cas pratique a son dispositif) ; jamais une phrase fixe « en continu » (etampes2 552 : « Site sécurisé
 * en continu » alors que le dispositif couvre 39 h sur les 48 heures du cas pratique).
 */
export function etapesSchemaDemande(texte: string, d?: Dimensionnement | null, resultat = ''): Array<{ titre: string; texte?: string; role?: string }> | null {
  if (d?.casPratique.length) {
    const plages = [...new Set(d.casPratique.map((x) => x.plage))];
    const enService = (p: string) => d.casPratique.filter((x) => x.plage === p && x.enService > 0);
    const cle = (p: string) => enService(p).map((x) => `${x.profil}|${x.enService}|${x.rotation}`).join(';');
    // Plages au même dispositif (dimanche et lundi fériés de 6 h à 21 h) : une seule étape (« Dimanche et lundi, 6 h–21 h »).
    const groupes: Array<{ plages: string[]; cle: string }> = [];
    for (const p of plages) {
      const c = cle(p);
      const g = groupes.find((x) => x.cle === c && x.plages[0].split(',').slice(1).join(',').trim() === p.split(',').slice(1).join(',').trim());
      if (g) g.plages.push(p); else groupes.push({ plages: [p], cle: c });
    }
    const titre = (l: string[]) => {
      if (l.length === 1) return l[0];
      const jours = l.map((p) => p.split(/[\s,]/)[0]);
      return `${jours.map((j, i) => (i ? j.toLowerCase() : j)).join(' et ')}, ${l[0].split(',').slice(1).join(',').trim()}`;
    };
    // Même forme pour toutes les cartes : la plus complète qui tient entière dans chaque carte.
    const formes = groupes.slice(0, 4).map((g) => formesDispositifPlage(enService(g.plages[0])));
    const k = [0, 1, 2].find((i) => formes.every((f) => f[i].length <= 86));
    if (k === undefined) return null;
    const etapes = groupes.slice(0, 4).map((g, i) => ({ titre: titre(g.plages), texte: formes[i][k] }));
    const res = String(resultat || '').trim() || 'Effectifs répartis sur chaque plage du cas pratique';
    return [...etapes, { titre: 'Votre résultat', texte: res, role: 'vert' }];
  }
  // Sous-titres : lignes courtes sans ponctuation finale, suivies d'un paragraphe.
  const lignes = String(texte || '').split('\n').map((l) => l.trim());
  const etapes: Array<{ titre: string; texte?: string }> = [];
  lignes.forEach((l, i) => {
    const mots = l.split(/\s+/).length;
    if (!l || /[.:;!?]$/.test(l) || /^[•\-*\d]/.test(l) || mots < 2 || mots > 9 || /\|/.test(l)) return;
    const suite = lignes.slice(i + 1).find((x) => x);
    if (!suite || suite.split(/\s+/).length < 8) return;
    etapes.push({ titre: l, texte: (suite.split(/(?<=[.!?])\s/)[0] || '').replace(/^[•\-*]\s*/, '') });
  });
  return etapes.length >= 3 ? etapes.slice(0, 5) : null;
}
