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

export interface PlageHoraire { jours: string[]; debut: string; fin: string }

export interface ProfilDimensionne {
  profil: string;
  qualification: string;
  lieux: string[];
  heuresSemaine: number;
  heuresAn: number;
  etp: number;
  titulaires: number;
}

export interface LigneCasPratique { plage: string; profil: string; enService: number; rotation: number; dureeH: number; justification: string }

export interface Dimensionnement {
  profils: ProfilDimensionne[];
  titulaires: number;
  suppleants: number;
  casPratique: LigneCasPratique[];
}

/** « 7h00 », « 07:00 », « 19 h », « 1h » → heures décimales ; NaN si illisible. */
export function heureDe(t: string): number {
  const m = /^\s*(\d{1,2})\s*(?:h|:)?\s*(\d{2})?\s*$/i.exec(String(t || ''));
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

/** Heures par semaine d'un ensemble de plages. */
export function heuresSemaine(plages: PlageHoraire[]): number {
  return Math.round(plages.reduce((s, p) => s + dureePlage(p.debut, p.fin) * joursDe(p.jours).length, 0) * 100) / 100;
}

/** Vrai si la citation vient du DCE : six mots consécutifs au moins s'y retrouvent tels quels (accents et ponctuation ignorés). */
function citationDansDce(citation: string, dceMots: string): boolean {
  const mots = normaliser(citation).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  if (mots.length < 6) return false;
  for (let i = 0; i + 6 <= mots.length; i++) if (dceMots.includes(` ${mots.slice(i, i + 6).join(' ')} `)) return true;
  return false;
}

const nombre = (x: unknown): number | null => {
  const n = Number(String(x ?? '').replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Calcul du dimensionnement à partir de la lecture du DCE par le modèle (`rep` : {postes, cas_pratique}). Renvoie
 * null si aucun poste ni cas pratique n'est exploitable.
 */
export function calculerDimensionnement(rep: any, dce: string): Dimensionnement | null {
  const dceMots = ` ${normaliser(String(dce || '')).replace(/[^a-z0-9]+/g, ' ').trim()} `;
  const profils = new Map<string, ProfilDimensionne>();
  for (const p of Array.isArray(rep?.postes) ? rep.postes : []) {
    // Intitulé en capitales (« AGENT DE SECURITE ») : écrit en minuscules, initiale en majuscule.
    const brut = String(p?.profil || '').replace(/\s+/g, ' ').trim();
    const profil = /[A-ZÀ-Ý]{5,}/.test(brut) && (brut.match(/[A-Za-zÀ-ÿ]{2,}/g) || []).length >= 2 && brut === brut.toUpperCase() ? brut.charAt(0) + brut.slice(1).toLowerCase().replace(/\b(ssiap|ads|cqp|aps)\b/g, (m) => m.toUpperCase()) : brut;
    if (!profil || !citationDansDce(String(p?.citation || ''), dceMots)) continue;
    const plages: PlageHoraire[] = (Array.isArray(p?.plages) ? p.plages : [])
      .map((x: any) => ({ jours: joursDe(x?.jours), debut: String(x?.debut || ''), fin: String(x?.fin || '') }))
      .filter((x: PlageHoraire) => x.jours.length && dureePlage(x.debut, x.fin) > 0);
    // Volume du DQE (« TOTAL HEBDOMADAIRE | 84 ») : prioritaire sur les plages (un bordereau liste toutes les plages
    // facturables, le DQE les heures réellement estimées), pris seulement si ce nombre figure dans le DCE.
    const hh = nombre(p?.heures_hebdo);
    let hs = hh && new RegExp(`(?<![\\d,.])${hh}(?![\\d,.])`).test(dce) ? hh : plages.length ? heuresSemaine(plages) : 0;
    if (!hs || hs > 24 * 7 * 6) continue;
    const ha = nombre(p?.heures_an);
    const heuresAn = ha && new RegExp(`(?<![\\d,.])${ha}(?![\\d,.])`).test(dce.replace(/(\d)[\s  ](?=\d{3}\b)/g, '$1')) ? ha : Math.round(hs * 52);
    const qualification = String(p?.qualification || profil).replace(/\s+/g, ' ').trim();
    const cle = normaliser(`${profil}|${qualification}`);
    const x = profils.get(cle) || { profil, qualification, lieux: [], heuresSemaine: 0, heuresAn: 0, etp: 0, titulaires: 0 };
    x.heuresSemaine = Math.round((x.heuresSemaine + hs) * 100) / 100;
    x.heuresAn += heuresAn;
    const lieu = String(p?.lieu || '').trim();
    if (lieu && !x.lieux.includes(lieu)) x.lieux.push(lieu);
    profils.set(cle, x);
  }
  for (const x of profils.values()) {
    x.etp = Math.round((x.heuresAn / BASE_ETP) * 100) / 100;
    x.titulaires = Math.max(1, Math.ceil(x.etp - 0.05));
  }
  const titulaires = [...profils.values()].reduce((s, x) => s + x.titulaires, 0);
  const suppleants = titulaires ? Math.max(2, Math.ceil(titulaires * PART_SUPPLEANTS)) : 0;
  // Cas pratique : effectif en service proposé par le modèle (entier de 0 à 10), rotation calculée ici.
  const casPratique: LigneCasPratique[] = [];
  const plagesCas = new Map<string, number>();
  for (const pl of Array.isArray(rep?.cas_pratique?.plages) ? rep.cas_pratique.plages : []) {
    const libelle = String(pl?.libelle || '').trim();
    const d = dureePlage(String(pl?.debut || ''), String(pl?.fin || ''));
    if (libelle && d > 0) plagesCas.set(libelle, d);
  }
  for (const l of Array.isArray(rep?.cas_pratique?.dispositif) ? rep.cas_pratique.dispositif : []) {
    const plage = String(l?.plage || '').trim();
    const profil = String(l?.profil || '').trim();
    const n = Number(l?.en_service);
    const d = plagesCas.get(plage);
    if (!plage || !profil || !d || !Number.isInteger(n) || n < 0 || n > 10) continue;
    casPratique.push({ plage, profil, enService: n, rotation: n * Math.ceil(d / VACATION_MAX_H), dureeH: d, justification: String(l?.justification || '').trim() });
  }
  if (!profils.size && !casPratique.length) return null;
  return { profils: [...profils.values()], titulaires, suppleants, casPratique };
}

/** « 2 agent de sécurité » → « 2 agents de sécurité », « 2 maître-chien » → « 2 maîtres-chiens ». */
export function effectifProfil(n: number, profil: string): string {
  const p = profil.charAt(0).toLowerCase() + profil.slice(1);
  if (n <= 1) return `${n} ${p}`;
  if (/^ma[îi]tre-chien$/i.test(p)) return `${n} maîtres-chiens`;
  return `${n} ${p.replace(/^([a-zàâçéèêëîïôûü'-]+?)(?<![sx])(?=\s|$)/i, '$1s')}`;
}

const fr = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
const pluriel = (n: number, s: string, p = `${s}s`) => `${n} ${n > 1 ? p : s}`;

/** Catégorie de personnel du tableau de l'équipe dédiée (vocabulaire du mémoire type), d'après le profil du DCE. */
export function categorieDe(profil: string): string {
  const p = normaliser(profil);
  if (/cynophil|maitre.chien/.test(p)) return 'Agent cynophile';
  if (/ssiap\s*3/.test(p)) return 'Chef de service de sécurité incendie';
  if (/ssiap\s*2/.test(p)) return 'Chef d\'équipe de sécurité incendie';
  if (/ssiap\s*1/.test(p) && !/\bads\b|cqp|agent de securite(?! incendie)/.test(p)) return 'Agent de sécurité incendie';
  if (/encadr|chef de poste|chef d.equipe/.test(p)) return profil;
  if (/\bads\b|cqp|agent de (?:securite|surveillance|surete)|agent de prevention/.test(p)) return 'Agent de sécurité';
  return profil;
}

/** Lignes du tableau « L'équipe dédiée » (catégorie, qualification, nombre, observations). */
export function lignesEquipe(d: Dimensionnement): string {
  return d.profils.map((x) => `| ${categorieDe(x.profil)} | ${x.qualification} | ${x.titulaires} | ${fr(x.heuresSemaine)} h par semaine${x.lieux.length ? ` (${x.lieux.join(', ')})` : ''}, soit ${fr(x.etp)} ETP |`).join('\n');
}

/** Phrase de synthèse du dispositif d'un cas pratique, plage par plage. */
export function syntheseCasPratique(d: Dimensionnement): string {
  const plages = [...new Set(d.casPratique.map((l) => l.plage))];
  return plages.map((p) => {
    const l = d.casPratique.filter((x) => x.plage === p && x.enService > 0);
    return `${p} : ${l.length ? l.map((x) => `${effectifProfil(x.enService, x.profil)}${x.rotation > x.enService ? ` (${x.rotation} pour la rotation)` : ''}`).join(', ') : 'aucun agent'}`;
  }).join(' ; ');
}

/** Question consolidée posée à GSS (proposition à valider). */
export function questionDimensionnement(d: Dimensionnement): string {
  const parts: string[] = [];
  if (d.profils.length) {
    parts.push(`équipe dédiée de ${pluriel(d.titulaires, 'agent titulaire', 'agents titulaires')} (${d.profils.map((x) => `${x.titulaires} ${normaliser(categorieDe(x.profil)) === normaliser(x.profil) ? categorieDe(x.profil) : `${x.profil} (${categorieDe(x.profil).toLowerCase()})`} pour ${fr(x.heuresSemaine)} h par semaine`).join(', ')}, base de 1 607 heures par an et par ETP) et équipe suppléante de ${pluriel(d.suppleants, 'agent formé', 'agents formés')} au site`);
  }
  if (d.casPratique.length) parts.push(`dispositif du cas pratique (${syntheseCasPratique(d)} ; vacations de ${VACATION_MAX_H} heures au plus)`);
  return `Proposition à valider : dimensionnement calculé à partir des postes et des horaires du DCE — ${parts.join(' ; ')}. GSS valide ces effectifs ou les modifie dans l'assistant.`;
}

/** Bloc des consignes de rédaction (cadre imposé) : les chiffres proposés, à reprendre tels quels. */
export function texteDimensionnement(d: Dimensionnement): string {
  const l: string[] = ['', '', 'DIMENSIONNEMENT PROPOSÉ PAR GSS (calculé à partir des postes et des horaires du DCE ; proposition que GSS validera — reprends ces chiffres EXACTEMENT là où l\'effectif, le nombre d\'agents, de maîtres-chiens, d\'équipes ou les rotations sont demandés, au lieu d\'écrire [À COMPLÉTER]) :'];
  for (const x of d.profils) l.push(`- ${x.profil} (${x.qualification}) : ${fr(x.heuresSemaine)} h par semaine, ${fr(x.heuresAn)} h par an, soit ${fr(x.etp)} ETP → ${pluriel(x.titulaires, 'titulaire')}${x.lieux.length ? ` (${x.lieux.join(', ')})` : ''}`);
  if (d.profils.length) l.push(`- Équipe dédiée : ${pluriel(d.titulaires, 'agent titulaire', 'agents titulaires')} ; équipe suppléante formée au site : ${pluriel(d.suppleants, 'agent', 'agents')}.`);
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

/** Pièces du DCE utiles au dimensionnement : CCTP, annexes (plannings), DQE et BPU, cadre de réponse (cas pratique). */
export function extraitDimensionnement(dce: string, cadre = '', max = 90_000): string {
  const blocs = String(dce || '').split(/\n\n--- (.+?) ---\n|\n?===== PIÈCE : (.+?) =====\n/);
  const avant: string[] = [];
  const apres: string[] = [];
  for (let i = 1; i < blocs.length; i += 3) {
    const nom = blocs[i] || blocs[i + 1] || '';
    const corps = blocs[i + 2] || '';
    const n = `${nom} ${nom.replace(/[_.\s-]+/g, '')}`;
    if (/ccap|\bRC\b|r[èe]glement|acte d.engagement|\bAE\b|d[ée]claration|attestation|candidature/i.test(n)) continue;
    // Volumes horaires et plannings d'abord (courts), puis le CCTP.
    if (/dqe|bpu|bordereau|planning|annexe|cadre|m[ée]moire/i.test(n)) avant.push(`=== ${nom} ===\n${corps}`);
    else apres.push(`=== ${nom} ===\n${corps}`);
  }
  const t = [...(cadre ? [`=== CADRE DE RÉPONSE ===\n${cadre.slice(0, 20_000)}`] : []), ...avant, ...apres].join('\n\n') || String(dce || '');
  return t.length > max ? t.slice(0, max) : t;
}

export const CONSIGNE_DIMENSIONNEMENT = `Tu lis le DCE d'un marché de sécurité privée pour GSS. Tu ne calcules aucun total : les calculs sont faits ensuite.
1. "postes" (relevé, sans rien ajouter) : chaque poste de travail permanent ou planifié que le titulaire doit tenir (une entrée par poste et par lieu) :
   - "profil" : intitulé court du poste dans les mots du DCE (ex. « SSIAP 2 », « SSIAP 1 », « Agent de sécurité ADS », « Agent de sécurité SSIAP 1 – CQP APS ») ;
   - "qualification" : qualification exigée (ex. « SSIAP 2 », « CQP APS – SSIAP 1 ») ;
   - "lieu" : bâtiment ou site, si le DCE le précise ;
   - "plages" : chaque plage horaire hebdomadaire, {"jours": ["lundi", …], "debut": "07:00", "fin": "19:00"} (une plage de nuit finit le lendemain : "debut": "19:00", "fin": "07:00") ; ignore les jours fériés ;
   - "heures_hebdo" : le volume hebdomadaire total si le DCE (DQE, BPU) le donne en heures pour ce poste, sinon null ;
   - "heures_an" : le volume annuel en heures si le DCE le donne, sinon null ;
   - "citation" : la phrase ou la ligne du DCE d'où vient le poste, recopiée mot pour mot.
   Ne relève pas les prestations ponctuelles sur bon de commande sans horaires fixés, ni les interventions sur alarme.
2. "cas_pratique" : seulement si le DCE ou le cadre de réponse pose un cas pratique ou une mise en situation qui demande le nombre d'agents par plage (sinon null). Ici, et seulement ici, tu PROPOSES le dispositif de GSS : c'est ce que l'acheteur demande au candidat.
   - "plages" : [{"libelle": "Dimanche férié, 6 h–21 h", "debut": "06:00", "fin": "21:00"}, …], libellés courts (jour et horaires) ;
   - "dispositif" (OBLIGATOIRE, jamais vide) : une entrée pour CHAQUE plage et CHAQUE profil demandé (agent de sécurité, maître-chien, agent de sécurité incendie, encadrant…), {"plage": "<libelle exact de la plage>", "profil": "<profil du DCE>", "en_service": <entier>, "justification": "<une phrase>"} : l'effectif EN SERVICE que GSS propose, argumenté par le site décrit (surface, nombre de bâtiments, accès, clôture, quartier, risques de jour et de nuit) ; 0 si le profil n'est pas utile sur cette plage (dis pourquoi). Un maître-chien travaille en binôme avec son chien ; un encadrant peut passer ponctuellement (0 en service, contrôle par passage).
Réponds UNIQUEMENT par un objet JSON : {"postes": [...], "cas_pratique": {...} ou null}`;

/** Paragraphe du premier message de l'assistant : le dimensionnement proposé, à valider ou à modifier avant la remise. */
export function messageDimensionnement(d: Dimensionnement): string {
  const l: string[] = ['J\'ai aussi proposé les effectifs, calculés à partir des postes et des horaires du cahier des charges (à relire avant la remise) :'];
  for (const x of d.profils) l.push(`- ${x.profil} : ${fr(x.heuresSemaine)} h par semaine, soit ${fr(x.etp)} ETP → ${pluriel(x.titulaires, 'titulaire')} ;`);
  if (d.profils.length) l.push(`- équipe dédiée de ${pluriel(d.titulaires, 'agent titulaire', 'agents titulaires')} et équipe suppléante de ${pluriel(d.suppleants, 'agent formé', 'agents formés')} au site ;`);
  for (const p of [...new Set(d.casPratique.map((x) => x.plage))]) l.push(`- cas pratique, ${p} : ${d.casPratique.filter((x) => x.plage === p && x.enService > 0).map((x) => `${effectifProfil(x.enService, x.profil)} (rotation ${x.rotation})`).join(', ') || 'aucun agent'} ;`);
  l.push('', 'Vous pouvez les valider (« Je valide les effectifs proposés ») ou les modifier (« Mets 7 agents SSIAP 2 dans l\'équipe dédiée »).');
  return l.join('\n');
}
