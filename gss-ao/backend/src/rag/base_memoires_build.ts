/**
 * Construction HORS LIGNE de la base de mémoires GSS (à relancer quand GSS ajoute un mémoire) :
 *   1. index sémantique des passages (python/base_memoires/base_memoires.json → base_memoires.emb) ;
 *   2. REGISTRE DES INFORMATIONS VARIABLES (effectifs, responsables, coordonnées, véhicules,
 *      certifications, outils, délais…) : chaque valeur est extraite AVEC sa citation exacte, vérifiée
 *      dans le texte du mémoire (une valeur non retrouvée est écartée), puis consolidée par date.
 *
 * Usage : npx ts-node src/rag/base_memoires_build.ts <base_memoires_textes.json> [--sans-index] [--sans-registre]
 *         npx ts-node src/rag/base_memoires_build.ts --sans-index --consolider   (reconsolide le registre, sans appel IA)
 * Nécessite OPENAI_API_KEY (lu dans ../.env). N'écrit RIEN en base de données.
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const DIR = path.resolve(__dirname, '../../python/base_memoires');
const EMBED_MODEL = 'text-embedding-3-small';   // identique aux requêtes du générateur
const MODELE = process.env.MEMOIRE_MODEL || 'gpt-5.6-luna';

/** Informations d'ENTREPRISE susceptibles d'évoluer dans le temps. */
export const CATALOGUE: Array<{ cle: string; libelle: string; categorie: string }> = [
  { cle: 'raison_sociale', libelle: 'Raison sociale', categorie: 'identite' },
  { cle: 'siret', libelle: 'Numéro SIRET', categorie: 'identite' },
  { cle: 'adresse_siege', libelle: 'Adresse du siège', categorie: 'identite' },
  { cle: 'autorisation_cnaps', libelle: "Numéro d'autorisation d'exercer CNAPS", categorie: 'identite' },
  { cle: 'date_autorisation_cnaps', libelle: "Date d'obtention de l'autorisation CNAPS", categorie: 'identite' },
  { cle: 'agrement_dirigeant', libelle: 'Agrément dirigeant CNAPS', categorie: 'identite' },
  { cle: 'dirigeant', libelle: "Dirigeant de l'entreprise", categorie: 'organisation' },
  { cle: 'interlocuteur_unique', libelle: 'Interlocuteur unique désigné', categorie: 'organisation' },
  { cle: 'telephone_contact', libelle: 'Numéro de téléphone de contact', categorie: 'coordonnees' },
  { cle: 'email_contact', libelle: 'Adresse e-mail de contact', categorie: 'coordonnees' },
  { cle: 'responsable_rh', libelle: 'Responsable RH', categorie: 'organisation' },
  { cle: 'responsable_exploitation', libelle: "Responsable(s) d'exploitation", categorie: 'organisation' },
  { cle: 'responsable_qualite', libelle: 'Responsable qualité', categorie: 'organisation' },
  { cle: 'responsable_commercial', libelle: 'Responsable commercial(e)', categorie: 'organisation' },
  { cle: 'responsable_unite_mobile', libelle: 'Responsable unité mobile', categorie: 'organisation' },
  { cle: 'responsable_cynophile', libelle: 'Responsable cynophile', categorie: 'organisation' },
  { cle: 'responsable_incendie', libelle: 'Responsable incendie', categorie: 'organisation' },
  { cle: 'effectif_total', libelle: "Effectif total de l'entreprise", categorie: 'effectifs' },
  { cle: 'effectif_departement_76', libelle: 'Effectif dans le département 76', categorie: 'effectifs' },
  { cle: 'effectif_departement_27', libelle: 'Effectif dans le département 27', categorie: 'effectifs' },
  { cle: 'effectif_agents_securite', libelle: 'Nombre d\'agents de sécurité', categorie: 'effectifs' },
  { cle: 'effectif_ssiap1', libelle: "Nombre d'agents SSIAP 1", categorie: 'effectifs' },
  { cle: 'effectif_ssiap2', libelle: "Nombre d'agents SSIAP 2", categorie: 'effectifs' },
  { cle: 'effectif_ssiap3', libelle: "Nombre d'agents SSIAP 3", categorie: 'effectifs' },
  { cle: 'effectif_cynophiles', libelle: "Nombre d'agents cynophiles", categorie: 'effectifs' },
  { cle: 'effectif_controleurs', libelle: 'Nombre de contrôleurs', categorie: 'effectifs' },
  { cle: 'vivier_evenementiel', libelle: "Vivier d'agents événementiels", categorie: 'effectifs' },
  { cle: 'agents_mobilisables_48h', libelle: 'Agents mobilisables en 48 heures', categorie: 'effectifs' },
  { cle: 'vehicules_encadrement', libelle: 'Véhicules des encadrants et contrôleurs', categorie: 'moyens' },
  { cle: 'vehicules_astreinte', libelle: "Véhicules d'astreinte", categorie: 'moyens' },
  { cle: 'logiciel_main_courante', libelle: 'Logiciel de main courante électronique', categorie: 'moyens' },
  { cle: 'logiciel_planification', libelle: 'Logiciel de planification', categorie: 'moyens' },
  { cle: 'logiciel_controle', libelle: 'Logiciel de contrôle des prestations', categorie: 'moyens' },
  { cle: 'application_pti', libelle: 'Application PTI (travailleur isolé)', categorie: 'moyens' },
  { cle: 'recours_sous_traitance', libelle: 'Recours à la sous-traitance (prestations fixes ou supplémentaires)', categorie: 'organisation' },
  { cle: 'certification_iso', libelle: 'Certification ISO', categorie: 'certifications' },
  { cle: 'certification_apsad', libelle: 'Certification APSAD', categorie: 'certifications' },
  { cle: 'partenaire_telesurveillance', libelle: 'Partenaire de télésurveillance', categorie: 'partenaires' },
  { cle: 'organisme_formation', libelle: 'Organismes de formation partenaires', categorie: 'partenaires' },
  { cle: 'delai_astreinte', libelle: "Délai maximal de mobilisation de l'agent d'astreinte", categorie: 'delais' },
  { cle: 'delai_intervention_pti', libelle: "Délai d'intervention sur alarme PTI", categorie: 'delais' },
  { cle: 'delai_intervention_alarme', libelle: "Délai d'intervention du rondier sur alarme", categorie: 'delais' },
  { cle: 'envoi_plannings', libelle: "Délai d'envoi des plannings du mois suivant", categorie: 'delais' },
];

const norm = (t: string) => t.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function construireIndex(openai: OpenAI) {
  const base = JSON.parse(fs.readFileSync(path.join(DIR, 'base_memoires.json'), 'utf-8'));
  const textes: string[] = base.passages.map((p: any) => `${p.rubrique}\n${p.texte}`.slice(0, 6000));
  const vecs: number[][] = [];
  for (let i = 0; i < textes.length; i += 64) {
    const r = await openai.embeddings.create({ model: EMBED_MODEL, input: textes.slice(i, i + 64) });
    vecs.push(...r.data.map((d) => d.embedding as number[]));
  }
  const dim = vecs[0].length;
  const buf = Buffer.alloc(vecs.length * dim * 4);
  vecs.forEach((v, i) => v.forEach((x, j) => buf.writeFloatLE(x, (i * dim + j) * 4)));
  fs.writeFileSync(path.join(DIR, 'base_memoires.emb'), buf);
  console.log(`Index : ${vecs.length} passages × ${dim} dimensions.`);
}

async function extraireFaits(openai: OpenAI, fichierTextes: string) {
  const docs = JSON.parse(fs.readFileSync(path.join(DIR, 'documents.json'), 'utf-8'));
  const textes: Record<string, string[]> = JSON.parse(fs.readFileSync(fichierTextes, 'utf-8'));
  const catalogue = CATALOGUE.map((c) => `- ${c.cle} : ${c.libelle}`).join('\n');
  const registre: Record<string, any> = {};
  for (const d of docs) {
    const pages = textes[d.fichier] || [];
    const corpus = pages.map((p, i) => `=== PAGE ${i + 1} ===\n${p}`).join('\n').slice(0, 180_000);
    const r = await openai.chat.completions.create({
      model: MODELE,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Tu extrais d'un mémoire technique de la société GSS les informations D'ENTREPRISE suivantes, quand elles y figurent :\n${catalogue}\n\n` +
            `Règles : (1) uniquement ce qui est écrit, jamais de déduction ; (2) n'extrais PAS les informations propres au marché du client ` +
            `(effectifs dédiés à ce marché, délais par site du client, nombre d'agents par site) : seulement ce qui décrit GSS en général ; ` +
            `(3) "citation" = la phrase ou le fragment EXACT du texte (recopié à l'identique) ; (4) "page" = numéro de PAGE.\n` +
            `Réponds en JSON : {"faits":[{"cle":"...","valeur":"...","page":n,"citation":"..."}]}`,
        },
        { role: 'user', content: corpus },
      ],
    });
    let faits: any[] = [];
    try { faits = JSON.parse(r.choices[0]?.message?.content || '{}').faits || []; } catch { faits = []; }
    const texteNorm = norm(pages.join(' '));
    let gardes = 0;
    for (const f of faits) {
      const def = CATALOGUE.find((c) => c.cle === f.cle);
      if (!def || !f.valeur || !f.citation) continue;
      // Anti-invention : la citation doit exister dans le mémoire et contenir les chiffres de la valeur.
      const citationOk = texteNorm.includes(norm(String(f.citation)).slice(0, 120));
      const chiffres = String(f.valeur).match(/\d+/g) || [];
      const chiffresOk = chiffres.every((n) => norm(String(f.citation)).includes(n) || texteNorm.includes(n));
      if (!citationOk || !chiffresOk) continue;
      (registre[f.cle] ||= { cle: f.cle, libelle: def.libelle, categorie: def.categorie, valeurs: [] }).valeurs.push({
        valeur: String(f.valeur).trim(), client: d.client, document: d.fichier, date: d.date, page: f.page ?? null,
        citation: String(f.citation).trim().slice(0, 400),
      });
      gardes++;
    }
    console.log(`${d.client} : ${gardes}/${faits.length} information(s) vérifiée(s).`);
  }
  reprendreReponsesGss(registre);
  consolider(registre);
  ecrireRegistre(registre);
}

/**
 * Champs propres au registre (hors extraction) conservés d'une reconstruction à l'autre. `valeur_retenue_imposee` :
 * valeur rédigée à partir de la valeur sourcée (ex. recours_sous_traitance : « Non : GSS n'envisage pas de recourir à la
 * sous-traitance pour les prestations fixes ou supplémentaires », d'après le cadre de l'Université de Rouen), retenue à
 * la place de la valeur extraite.
 */
const CHAMPS_CONSERVES = ['interne', 'usage', 'remarque', 'question_une_fois', 'valeur_retenue_imposee'];

/**
 * Réponses de l'équipe GSS (valeurs « reponse_gss », ex. réponses du 1er octobre 2026) et informations sans mémoire
 * source (internes, zone d'intervention…) : reprises du registre existant lors d'une reconstruction, car elles ne
 * figurent dans aucun mémoire (règle 1 du LISEZMOI : la réponse de GSS prime).
 */
function reprendreReponsesGss(registre: Record<string, any>) {
  let ancien: any[] = [];
  try { ancien = JSON.parse(fs.readFileSync(path.join(DIR, 'registre_informations.json'), 'utf-8')).informations || []; } catch { return; }
  for (const e of ancien) {
    const reponses = (e.valeurs || []).filter((v: any) => v.reponse_gss);
    if (!reponses.length && !CHAMPS_CONSERVES.some((k) => e[k] !== undefined)) continue;
    const cible = (registre[e.cle] ||= { cle: e.cle, libelle: e.libelle, categorie: e.categorie, valeurs: [] });
    cible.valeurs.push(...reponses);
    for (const k of CHAMPS_CONSERVES) if (e[k] !== undefined) cible[k] = e[k];
  }
}

/**
 * Consolidation. Valeur retenue = l'ensemble des valeurs du mémoire LE PLUS RÉCENT (une information peut
 * avoir plusieurs valeurs simultanées : deux responsables d'exploitation, deux logiciels…). Deux valeurs
 * sont équivalentes si l'une contient l'autre une fois normalisées (casse, accents, ponctuation, ordre
 * « NOM Prénom »). Statut « a_confirmer » si une date plus ancienne donne une valeur non équivalente :
 * l'information a changé (ou les mémoires se contredisent) → GSS doit confirmer la valeur actuelle.
 */
export function consolider(registre: Record<string, any>) {
  const cle = (v: string) => norm(v).split(' ').filter((m) => m.length > 1 && !['de', 'du', 'des', 'la', 'le', 'les', 'mr', 'mme', 'aux', 'couleurs', 'gss'].includes(m)).sort().join(' ');
  const nombres = (v: string) => (norm(v).match(/\d+/g) || []).join(' ');
  const mots = (v: string) => cle(v).split(' ').filter((m) => m.length >= 3 && !/^\d+$/.test(m));
  const proche = (a: string, b: string) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b.slice(0, 5)) || b.startsWith(a.slice(0, 5))));
  // Équivalentes : mêmes nombres ET l'essentiel des mots en commun (abréviations tolérées :
  // « maxi » = « maximum », « Contrôle MASTER » = « controlmaster », « DA SILVA Luis » = « LUIS DA SILVA SANTOS »).
  const equiv = (a: string, b: string) => {
    if (nombres(a) !== nombres(b)) return false;
    const A = mots(a), B = mots(b);
    if (!A.length || !B.length) return cle(a) === cle(b);
    const [petit, grand] = A.length <= B.length ? [A, B] : [B, A];
    const grandCompact = grand.join('');
    const communs = petit.filter((m) => grand.some((g) => proche(m, g)) || grandCompact.includes(m)).length;
    return communs / petit.length >= 0.6 || petit.join('') === grandCompact;
  };
  for (const e of Object.values(registre) as any[]) {
    e.valeurs.sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''));
    // Réponse de l'équipe GSS : elle prime sur tout le reste (règle 1 du LISEZMOI), même face à un mémoire plus récent.
    const gss = e.valeurs.filter((v: any) => v.reponse_gss);
    const dateRecente = (gss.length ? gss : e.valeurs)[0].date;
    const recentes: any[] = [];
    for (const v of (gss.length ? gss : e.valeurs).filter((v: any) => v.date === dateRecente)) {
      // Une valeur de liste (« OPCALIA ; IFESSU ») recouvre ses éléments : on garde la plus complète.
      const idx = recentes.findIndex((r) => equiv(r.valeur, v.valeur));
      if (idx < 0) recentes.push(v);
      else if (cle(v.valeur).length > cle(recentes[idx].valeur).length) recentes[idx] = v;
    }
    e.valeur_retenue = e.valeur_retenue_imposee || recentes.map((r) => r.valeur).join(' ; ');
    e.date_retenue = dateRecente;
    // Source précise d'une réponse de GSS (« Réponse de GSS (1er octobre 2026) », attestation datée) : `source_libelle`.
    e.source_retenue = [...new Set(recentes.map((r) => r.source_libelle || r.client))].join(', ');
    const anciennes = e.valeurs.filter((v: any) => v.date !== dateRecente);
    // Une valeur ancienne plus générique (« véhicules aux couleurs de GSS », « système P.T.I ») n'est pas un
    // changement : seul compte un NOM ou un CHIFFRE différent.
    const generique = (v: string) => !nombres(v) && !/[A-Z]{2,}|[A-Z][a-z]+\s+[A-Z]/.test(v.replace(/^(Mr|Mme)\s+/, ''));
    const ecarts = anciennes.filter((v: any) => !recentes.some((r) => equiv(r.valeur, v.valeur)) && !generique(v.valeur));
    // Valeur donnée par l'équipe GSS (réponse datée) : elle prime, l'information est confirmée.
    e.statut = ecarts.length && !recentes.some((r) => r.reponse_gss) ? 'a_confirmer' : 'confirmee';
    e.valeurs_anterieures_differentes = [...new Map(ecarts.map((v: any) => [cle(v.valeur), `${v.valeur} (${v.client}, ${v.date})`])).values()];
  }
}

function ecrireRegistre(registre: Record<string, any>) {
  const sortie = { genere_le: new Date().toISOString().slice(0, 10), informations: Object.values(registre) };
  fs.writeFileSync(path.join(DIR, 'registre_informations.json'), JSON.stringify(sortie, null, 1));
  console.log(`Registre : ${sortie.informations.length} information(s), ` +
    `${sortie.informations.filter((e: any) => e.statut === 'a_confirmer').length} à confirmer par GSS.`);
}

/** Registre existant relu pour une reconsolidation sans appel IA (--consolider) : valeurs et champs conservés. */
export function registrePourConsolidation(informations: any[]): Record<string, any> {
  const reg: Record<string, any> = {};
  for (const e of informations) {
    reg[e.cle] = { cle: e.cle, libelle: e.libelle, categorie: e.categorie, valeurs: e.valeurs };
    for (const k of CHAMPS_CONSERVES) if (e[k] !== undefined) reg[e.cle][k] = e[k];
  }
  return reg;
}

// Lancement en ligne de commande seulement (le module est aussi importé par les tests).
if (require.main === module) (async () => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY manquante.');
  const openai = new OpenAI({ apiKey: key, timeout: 600_000 });
  const args = process.argv.slice(2);
  if (!args.includes('--sans-index')) await construireIndex(openai);
  if (args.includes('--consolider')) {
    // Reconsolide le registre existant sans nouvel appel IA.
    const r = JSON.parse(fs.readFileSync(path.join(DIR, 'registre_informations.json'), 'utf-8'));
    const reg = registrePourConsolidation(r.informations);
    consolider(reg);
    ecrireRegistre(reg);
    return;
  }
  if (!args.includes('--sans-registre')) await extraireFaits(openai, args.find((a) => !a.startsWith('--')) || '');
})().catch((e) => { console.error(e); process.exit(1); });
