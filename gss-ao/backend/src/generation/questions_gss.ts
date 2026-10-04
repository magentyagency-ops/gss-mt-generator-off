/**
 * Questions à GSS en clair (questionExacte), partagées par le générateur et les contrôles des propositions de réponse
 * (reponse_libre_v2.controlerProposition, T5-CONS-8) : une seule règle pour toute consigne interne du modèle.
 */
import { valeurRegistre } from './base_memoires';

/** Mots en -er / -ir / -re qui ne sont pas des infinitifs (noms, adjectifs, prépositions). */
export const PAS_INFINITIF = new Set(['premier', 'dernier', 'cahier', 'quartier', 'dossier', 'papier', 'fichier', 'chantier', 'metier', 'calendrier', 'palier',
  'escalier', 'particulier', 'regulier', 'entier', 'hier', 'cher', 'fer', 'mer', 'hiver', 'super', 'laser', 'leader', 'plaisir', 'avenir', 'loisir',
  'soir', 'espoir', 'desir', 'manoir', 'couloir', 'trottoir', 'miroir', 'cadre', 'ordre', 'titre', 'nombre', 'membre', 'centre', 'registre', 'lettre',
  'livre', 'chiffre', 'metre', 'offre', 'autre', 'notre', 'votre', 'entre', 'contre', 'outre', 'quatre', 'libre', 'propre', 'sobre', 'pupitre', 'acier',
  'atelier', 'clavier', 'collier', 'courrier', 'denier', 'foyer', 'loyer', 'pompier', 'routier', 'sentier', 'usager', 'voisinage', 'tiers', 'ouvrier',
  'gardiennage', 'tir', 'noir', 'mur', 'sur', 'pur', 'sir', 'lire', 'faire']);

/** Question en clair sur une case de tableau du cadre (même forme que les cartes de l'assistant, T8CS-4). */
export function questionCaseTableau(ligne: string, colonne: string): string {
  const l = String(ligne || '').split('|')[0].replace(/\[CHAMP_\d+\]/g, '').replace(/\s+/g, ' ').trim();
  const c = String(colonne || '').replace(/\[CHAMP_\d+\]/g, '').replace(/\s*\/\s*/g, ' — ').replace(/\s+/g, ' ').trim();
  return l ? `Tableau du cadre, ligne « ${l} », colonne « ${c} » : quelle valeur faut-il écrire ?` : `Tableau du cadre, colonne « ${c} » : quelle valeur faut-il écrire ?`;
}

/** DCE du dossier en cours (posé par le générateur à la lecture du DCE) : une consigne du modèle n'est présentée comme
 *  « Exigence du DCE » que si le DCE l'écrit (T6-CONS-8). Vide : aucune vérification possible (forme seule). */
let dceDesQuestions = '';
const normDce = (t: string) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’`]/g, "'").replace(/[^a-z0-9']+/g, ' ').replace(/\s+/g, ' ').trim();
export function definirDceDesQuestions(dce: string | null | undefined): void { dceDesQuestions = normDce(String(dce || '')); }
/** Le texte figure dans le DCE (ses 10 premiers mots, normalisés) ; vrai quand le DCE n'est pas connu. */
export function figureDansLeDce(texte: string): boolean {
  if (!dceDesQuestions) return true;
  const mots = normDce(texte).split(' ').filter(Boolean);
  if (mots.length < 3) return true;
  return dceDesQuestions.includes(mots.slice(0, 10).join(' '));
}
/** Voix de l'acheteur ou du cahier des charges (« doit », « le titulaire », « exigé »…). */
const VOIX_ACHETEUR = /\b(?:doit|doivent|devra|devront|est tenue?|sont tenus|le titulaire|le prestataire|le candidat|exig|obligatoire|imp[ée]ratif)\b/i;

export function questionExacte(q: string): string {
  const t = String(q || '').replace(/\s+/g, ' ').trim();
  if (!t) return t;
  const maj = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  const min = (x: string) => (/^[A-ZÀ-Ý][a-zà-ÿ]/.test(x) ? x.charAt(0).toLowerCase() + x.slice(1) : x);
  const sansFin = (x: string) => x.replace(/\s*[.;:…]+\s*$/, '').trim();
  // Question déjà posée (éventuellement suivie d'une explication : « … PME … ? L'effectif est de 380 salariés ; … »). Question
  // qui coordonne une demande et un groupe nominal (« Combien d'agents …, et confirmation de l'engagement à … ? », T5-CONS-9) :
  // deux questions correctes.
  if (/\?/.test(t) && !/^(?:Information|Valeur) à fournir/i.test(t)) return scinderCoordination(maj(t));
  // Tâches de validation et alertes signalées comme telles (propositions de réponse, rubriques à relire, schéma absent).
  if (/^(?:Proposition|Réponse à relire|(?:Partie|Rubrique|Réponse) «|Phrases? (?:ajoutées? au texte de GSS|proposées? par l'IA|adaptées? au cahier des charges)|Engagements à valider)/i.test(t)) return t;
  // Préfixes : la question qui suit est mise en forme à son tour.
  const pref = /^(À demander à l.acheteur|Pour le critère «[^»]*»|Critère «[^»]*»|«[^»]*» — à confirmer|Champ \d+)\s*:\s*(.+)$/i.exec(t);
  if (pref) {
    const interieur = sansFin(pref[2]);
    if (/^À demander à l.acheteur$/i.test(pref[1]) && !/\?/.test(interieur)) return `${pref[1]} : pouvez-vous nous transmettre ou préciser ${/^«/.test(interieur) ? interieur : `« ${interieur} »`} ?`;
    if (/— à confirmer$/i.test(pref[1]) && !/\?/.test(interieur)) return `${pref[1].replace(/ — à confirmer$/, '')} : confirmez-vous ce point : « ${interieur} » ?`;
    const suite = questionExacte(pref[2]);
    return /^«[^»]*» — à confirmer$/i.test(pref[1]) ? `${pref[1].replace(/ — à confirmer$/, '')} : ${suite}` : `${pref[1]} : ${suite.startsWith('À demander') ? suite : min(suite)}`;
  }
  const aConfirmer = /^À confirmer\s*:\s*(.+)$/i.exec(t);
  if (aConfirmer) return `Confirmez-vous ce point : « ${sansFin(aConfirmer[1])} » ?`;
  // Case de tableau du cadre décrite par sa colonne et sa ligne (forme interne « Colonne: "…" | Ligne: "…" ») : la question
  // en clair des cartes de l'assistant, jamais la forme interne (havre1, T8CS-4).
  const caseTableau = /^Colonne:\s*"([^"]*)"\s*\|\s*Ligne:\s*"([^"]*)"/.exec(t);
  if (caseTableau) return questionCaseTableau(caseTableau[2], caseTableau[1]);
  // Intitulé numéroté d'une partie du cadre (« 3.1 Les moyens humains assignés à la mission ») : l'information à écrire dans
  // la réponse à cette partie.
  if (/^\d+(?:\.\d+)*\.?\s+[A-ZÀ-Ý]/.test(t) && t.split(/\s+/).length <= 14) return `Quelle information faut-il écrire dans la réponse à « ${sansFin(t)} » ?`;
  const delaiPropose = /^Délai proposé hors Normandie, à confirmer par GSS \(organisation locale\)\s*:\s*(.+)$/i.exec(t);
  if (delaiPropose) return `Hors Normandie, validez-vous ce délai proposé (organisation locale) : « ${sansFin(delaiPropose[1])} » ?`;
  // Lieu du site introuvable dans le DCE (T7-COH-2) : le délai de GSS n'est valable que si le site est en Normandie.
  const delaiLieu = /^Délai retiré faute de lieu du site dans le DCE, à confirmer par GSS\s*:\s*(.+)$/i.exec(t);
  if (delaiLieu) return `Le DCE ne donne pas la commune du site : si le site est en Normandie, validez-vous ce délai : « ${sansFin(delaiLieu[1])} » ? Sinon, quel délai GSS annonce-t-elle ?`;
  const horsNormandie = /^Marché hors Normandie\s*:\s*délai à confirmer par GSS \((.+)\)\.?$/i.exec(t);
  if (horsNormandie) return `Marché hors Normandie : quel délai GSS annonce-t-elle (${horsNormandie[1]}) ?`;
  const exigence = /^Exigence du (DCE|CCTP)( sans réponse dans le mémoire| à laquelle le mémoire (?:doit répondre|ne répond pas encore)[^:]*)\s*:\s*(.+)$/i.exec(t);
  if (exigence) {
    const inner = sansFin(exigence[3]).replace(/^«\s*|\s*»$/g, '');
    // Consigne du modèle (infinitif, « de GSS ») : jamais présentée comme une exigence du DCE (T5N-9).
    const premierMot = /^([A-Za-zÀ-ÿ][a-zà-ÿ'’-]+)(.*)$/.exec(inner);
    if ((premierMot && estInfinitif(premierMot[1], premierMot[2])) || /\b(?:de|à|avec|auprès de|par)\s+GSS\b/.test(inner)) return questionExacte(inner);
    // Texte absent du DCE (consigne nominale du modèle : « identité de l'agent affecté et disponibilité de ses titres… ») :
    // jamais présenté comme une exigence du DCE (T6-CONS-8).
    if (!figureDansLeDce(inner)) return `Pouvez-vous préciser ce point : « ${inner} » ?`;
    return `Exigence du ${exigence[1]}${exigence[2]} : « ${inner} ». Comment GSS y répond-elle (moyen, délai ou document à indiquer) ?`;
  }
  const information = /^(?:Information|Valeur) à fournir(?: pour compléter(?: le mémoire)?)?\s*:\s*(.+)$/i.exec(t);
  if (information) {
    const libelle = sansFin(information[1]).replace(/^«\s*|\s*»$/g, '');
    // Libellé d'une personne (imm 341 : « Chargé d'affaires dédié » → « Quelle donnée faut-il indiquer ici ? ») : qui, avec
    // son nom, sa fonction et son téléphone ; pour le chargé d'affaires ou l'interlocuteur, le responsable de marché de GSS.
    const personne = /^(?:(?:le|la|l['’]|un|une)\s*)?(chargée? d['’]affaires?|r[ée]f[ée]rent(?:e)?|responsable|interlocut(?:eur|rice)|chef (?:de (?:poste|site|service|projet|secteur|groupe)|d['’][ée]quipe)|coordinat(?:eur|rice)|correspondant(?:e)?|superviseur|contact|gestionnaire|directeur|directrice)\b(.*)$/i.exec(libelle);
    if (personne) {
      const fonction = `${personne[1]}${personne[2]}`.trim();
      const dirigeant = valeurRegistre('dirigeant').replace(/\s+/g, ' ').trim().replace(/^(\S+)\s+(\S+)$/, (_m, nom: string, prenom: string) => `${nom.toUpperCase()} ${prenom.charAt(0).toUpperCase()}${prenom.slice(1).toLowerCase()}`);
      const proposition = /chargée? d['’]affaires?|interlocut|responsable (?:du |de )?march[ée]|r[ée]f[ée]rent(?:e)? (?:du |de )?march[ée]/i.test(fonction) && dirigeant
        ? ` ${dirigeant}, responsable de marché et interlocuteur unique de GSS, peut-il être indiqué ?` : '';
      return `Qui sera ${/^[aeiouyhàâéèêîïôûü]/i.test(fonction) ? "l'" : 'le '}${min(fonction)} pour ce marché (nom, fonction et téléphone) ?${proposition}`;
    }
    // Libellé nominal (« Nombre de véhicules » → « Combien de véhicules ? ») ; sinon la donnée nommée par son libellé.
    const nominale = libelle && !/^(?:Information|Valeur) à fournir/i.test(libelle) ? questionExacte(libelle) : '';
    return nominale && !/^(?:Quelle réponse GSS|Exigence du DCE)/.test(nominale) ? nominale : `Quelle donnée faut-il indiquer pour : « ${libelle} » ?`;
  }
  // Consigne à l'infinitif (« Préciser les mesures… », « Confirmer auprès de GSS et de son assureur… ») : question à GSS.
  // Consigne interne du modèle (« Définir avec GSS les modalités … que GSS fournira », becquerel 1401, T4N-5) : la question
  // s'adresse à GSS, jamais « avec GSS » ni « GSS » à la troisième personne.
  // Consigne qui demande à GSS une pièce ou une donnée (« obtenir de GSS le CCTP, le BPU … », s2e 1501, T5N-3 ; « Obtenir les
  // coordonnées … ») : « fournir ». Pièces du DCE absentes : leur ajout au dossier est demandé.
  const obtenir = /^(?:obtenir|r[ée]cup[ée]rer|demander|collecter|recueillir)\s+(?:(?:de|à|auprès de|par)\s+GSS\s+)?(.+)$/i.exec(t);
  if (obtenir) {
    const objet = sansFin(obtenir[1]).replace(/\b(?:auprès de|de|à|par)\s+GSS\b/gi, '').replace(/\s{2,}/g, ' ').trim();
    if (/^(?:le|la|les|l['’])\s*(?:CCTP|CCP|BPU|DPGF|DQE|RC|CCAP|cahier des charges|r[èe]glement|annexes?|pi[èe]ces?)\b/i.test(objet)) {
      const plur = /\b(?:et|,)\b|^les\s/i.test(objet);
      return `Le DCE transmis ne comporte pas ${objet.replace(/^(le|la|les|l['’])\s*/i, (m0) => ({ le: 'le ', la: 'la ', les: 'les ' } as Record<string, string>)[m0.trim().toLowerCase()] || m0)} : pouvez-vous ${plur ? 'les' : "l'"} ajouter au dossier ${plur ? "s'ils existent" : "s'il existe"}, puis relancer la génération ?`;
    }
    return `Pouvez-vous fournir ${objet} ?`;
  }
  // Complément de tête avant la consigne (« Pour l'agent cynophile, garder les extérieurs… », « Lot 1, préparation : raccorder… »,
  // T5N-9) : la consigne est mise en question, le complément gardé en tête.
  if (/^(?:Pour|Concernant|S['’]agissant d[eu]|Au titre d[eu]|En cas d['’]|En cas de|Lors d[eu]|Avant|Après|Dès|Pendant|Lot\s*\d+)(?![\p{L}])/iu.test(t)) {
    for (const m of t.matchAll(/\s*([,:])\s+([a-zà-ÿ][a-zà-ÿ'’-]+)/g)) {
      if (m.index! > 110) break;
      const reste = t.slice(m.index! + m[0].length);
      if (!estInfinitif(m[2], reste)) continue;
      const suite = questionExacte(`${maj(m[2])}${reste}`);
      if (/^Pouvez-vous /.test(suite)) return `${t.slice(0, m.index!)}${m[1] === ':' ? ' :' : ','} ${min(suite)}`;
    }
  }
  // Consigne à l'infinitif, lue par sa forme (-er, -ir, -re, hors PAS_INFINITIF) et par ce qui la suit, en majuscule comme en
  // minuscule, avec une virgule ou un deux-points après le verbe (« Transmettre, pour les agents …, les noms… », « Fournir : la
  // liste… », « Souscrire et maintenir … », « Considérer infructueux … », T5-CONS-8, T5N-9).
  const inf = /^([A-Za-zÀ-ÿ][a-zà-ÿ'’-]+)(\s*[,:]\s*|\s+)(.+)$/.exec(t);
  const verbe = inf && estInfinitif(inf[1], `${inf[2]}${inf[3]}`) ? [inf[0], maj(inf[1]), inf[3], inf[2]] as const : null;
  if (verbe) {
    const sep = /,/.test(verbe[3]) ? ', ' : ' ';
    const reste = sansFin(verbe[2]).replace(/\bauprès de GSS et de son assureur\b/i, 'auprès de votre assureur').replace(/\b(?:auprès de|avec|par|pour) GSS\b/gi, '').replace(/^à GSS\s+/i, '')
      .replace(/\b(que|qu['’]|dont)\s*GSS\s+(fournira|mettra|prévoit|propose|assurera|utilisera|affectera|mobilisera)\b/gi, (_m, rel: string, v: string) => `${/^qu['’]/i.test(rel) ? 'que' : rel} vous ${({ fournira: 'fournirez', mettra: 'mettrez', prévoit: 'prévoyez', propose: 'proposez', assurera: 'assurerez', utilisera: 'utiliserez', affectera: 'affecterez', mobilisera: 'mobiliserez' } as Record<string, string>)[v.toLowerCase()] || v}`)
      .replace(/\bde GSS\b/g, 'de votre entreprise').replace(/\s{2,}/g, ' ').trim();
    return `Pouvez-vous ${verbe[1].toLowerCase()}${sep}${reste} ?`;
  }
  // Libellé nominal d'une donnée (« Nombre d'agents… », « Délai d'envoi des plannings… », « Diplômes détenus… »).
  // (« Nombre total d'agents … », T5N-9 : « Combien d'agents … au total ? »)
  const nombre = /^Nombre\s+(total\s+|global\s+|moyen\s+|maximal\s+|minimal\s+|maximum\s+|minimum\s+)?(d['’]|de |des )(.+)$/i.exec(t);
  if (nombre) {
    const q2 = nombre[1] ? ({ total: ' au total', global: ' au total', moyen: ' en moyenne', maximal: ' au maximum', maximum: ' au maximum', minimal: ' au minimum', minimum: ' au minimum' } as Record<string, string>)[nombre[1].trim().toLowerCase()] : '';
    return scinderCoordination(`Combien ${nombre[2].toLowerCase() === 'des ' ? 'de ' : nombre[2].toLowerCase()}${sansFin(nombre[3])}${q2} ?`);
  }
  const GENRES: Record<string, string> = {
    nom: 'Quel est', numero: 'Quel est', delai: 'Quel est', taux: 'Quel est', partenaire: 'Quel est', organigramme: 'Quel est', montant: 'Quel est',
    date: 'Quelle est', liste: 'Quelle est', composition: 'Quelle est', duree: 'Quelle est', frequence: 'Quelle est', periodicite: 'Quelle est', adresse: 'Quelle est',
    diplomes: 'Quels sont', noms: 'Quels sont', moyens: 'Quels sont', effectifs: 'Quels sont', horaires: 'Quels sont',
    quantites: 'Quelles sont', coordonnees: 'Quelles sont', modalites: 'Quelles sont', qualifications: 'Quelles sont', dates: 'Quelles sont', references: 'Quelles sont',
  };
  const premier = t.split(/[\s'’]/)[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  // Nom suivi d'un adjectif au pluriel (« taux horaires … ») ou libellé qui coordonne plusieurs données (« nom et
  // coordonnées du chef de site », « délai de remplacement et taux de reprise ») : chaque donnée prend son article
  // (T4N-9 : « Quel est le taux horaires … et montants … ? » n'était pas une question correcte).
  const sansAcc = (w: string) => w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const articleDe = (groupe: string): string | null => {
    const mots = groupe.trim().split(/\s+/);
    const w = sansAcc(mots[0].replace(/['’].*$/, ''));
    const suivant = mots[1] || '';
    const pluriel = /^(?:quels|quelles)/i.test(GENRES[w] || '')
      || (!GENRES[w] && /s$/.test(w) && !!GENRES[w.replace(/s$/, '')])
      || (!!GENRES[w] && /[sxz]$/.test(w) && /^[a-zà-ÿ]+s$/.test(suivant) && !/^(?:de|des|du|par|pour|sur|dans|avec|sous)$/.test(suivant));
    if (pluriel) return 'les';
    const g = GENRES[w];
    if (!g) return null;
    if (/^[aeiouyhàâéèêîïôûü]/i.test(mots[0])) return "l'";
    return /^Quelle /.test(g) ? 'la' : 'le';
  };
  const avecArticle = (groupe: string, art: string) => (art === "l'" ? `l'${min(groupe.trim())}` : `${art} ${min(groupe.trim())}`);
  if (GENRES[premier] || GENRES[premier.replace(/s$/, '')]) {
    const corps = sansFin(t);
    // Coordination : « A et B » (une seule coordination de premier niveau, avant toute virgule).
    const iVirgule = corps.search(/,\s/);
    const tete = iVirgule > 0 ? corps.slice(0, iVirgule) : corps;
    const suiteVirgule = iVirgule > 0 ? corps.slice(iVirgule) : '';
    const parts = tete.split(/\s+et\s+/);
    if (parts.length === 2) {
      const a1 = articleDe(parts[0]);
      const a2 = articleDe(parts[1]);
      if (a1 && a2) return `Pouvez-vous indiquer ${avecArticle(parts[0], a1)} et ${avecArticle(parts[1], a2)}${suiteVirgule} ?`;
    }
    const a = articleDe(corps);
    if (a === 'les' && GENRES[premier] && !/^(?:quels|quelles)/i.test(GENRES[premier])) return `Quels sont les ${min(corps)} ?`;
  }
  if (GENRES[premier]) {
    const article = /^(?:quels|quelles)/i.test(GENRES[premier]) ? 'les' : /^(?:date|liste|composition|duree|frequence|periodicite|adresse)$/.test(premier) ? 'la' : 'le';
    const corps = min(sansFin(t));
    return `${GENRES[premier]} ${/^[aeiouyhàâéèêîïôûü]/i.test(corps) && article !== 'les' ? `l'${corps}` : `${article} ${corps}`} ?`;
  }
  // Phrase dont GSS est le sujet (« GSS doit préciser les délais… », « GSS devra valider ou modifier dans l'assistant le
  // dimensionnement… ») : une question à GSS, jamais une « Exigence du DCE » (etampes1 592, T5N-1).
  const sujetGss = /^GSS\s+(?:doit|devra|devrait|est invitée? à|a à)\s+(.+)$/i.exec(t);
  if (sujetGss) {
    const reste = sansFin(sujetGss[1]);
    const valider = /^(?:valider|confirmer)(?:\s+ou\s+modifier)?(?:\s+dans\s+l['’]assistant)?\s+(.+)$/i.exec(reste);
    // Délais que le mémoire laisse à compléter (etampes2 701 : « Validez-vous les délais chiffrés de prise en compte… ? » alors
    // qu'aucun délai n'est écrit, hors Normandie) : la valeur est demandée, jamais une validation.
    if (valider && /^les\s+d[ée]lais\b/i.test(valider[1])) return `Quels ${valider[1].replace(/^les\s+/i, '')} GSS annonce-t-elle ?`;
    if (valider) return `Validez-vous ${valider[1]} ? Sinon, modifiez-le dans l'assistant.`;
    return `Pouvez-vous ${min(reste)} ?`;
  }
  // Consigne qui nomme GSS (« … de GSS », « … avec GSS ») : jamais une « Exigence du DCE » (T5N-9).
  if (/^[a-zà-ÿ]/.test(t) && /\b(?:de|à|avec|auprès de|par)\s+GSS\b/.test(t)) return `Pouvez-vous préciser ce point : « ${sansFin(t).replace(/\s*\b(?:auprès de|avec|par)\s+GSS\b/g, '').replace(/\bde GSS\b/g, 'de votre entreprise').replace(/\bà GSS\b/g, 'à votre entreprise')} » ?`;
  // Exigence du DCE (phrase à la voix de l'acheteur, ou fragment en minuscule tiré du cahier des charges).
  // Seulement quand le DCE l'écrit (T6-CONS-8) : une consigne nominale du modèle en minuscule (« identité de l'agent affecté
  // et disponibilité de ses titres… »), absente du DCE, est une question à GSS, jamais une « Exigence du DCE ».
  if (/^[a-zà-ÿ]/.test(t) || VOIX_ACHETEUR.test(t)) {
    if (!figureDansLeDce(t)) return `Pouvez-vous préciser ce point : « ${sansFin(t)} » ?`;
    return `Exigence du DCE à laquelle le mémoire doit répondre : « ${sansFin(t)} ». Comment GSS y répond-elle (moyen, délai ou document à indiquer) ?`;
  }
  return `Quelle réponse GSS apporte-t-elle sur ce point : « ${sansFin(t)} » ?`;
}

/** Noms usuels en « -er » ou « -ir » (« Danger de … », « Pouvoir adjudicateur ») : jamais des infinitifs. */
const NOMS_EN_ER = new Set(['danger', 'etranger', 'boucher', 'plancher', 'rocher', 'clocher', 'verger', 'berger', 'leger', 'archer', 'panier', 'cuir', 'soupir',
  'souvenir', 'elixir', 'menhir', 'zephyr', 'martyr', 'emir', 'saphir', 'nadir', 'conseiller', 'cancer', 'hangar', 'bar', 'car', 'par', 'pour', 'jour', 'four',
  'tour', 'cour', 'retour', 'amour', 'secteur', 'ingenieur', 'prestataire', 'locataire', 'beneficiaire', 'titulaire', 'gestionnaire']);
/** Verbes des consignes du modèle, reconnus quel que soit ce qui les suit. */
const VERBES_CONSIGNE = new Set(['preciser', 'confirmer', 'indiquer', 'fournir', 'transmettre', 'joindre', 'detailler', 'decrire', 'completer', 'valider', 'verifier',
  'lister', 'donner', 'communiquer', 'justifier', 'expliquer', 'definir', 'determiner', 'fixer', 'etablir', 'arreter', 'prevoir', 'organiser', 'mentionner',
  'presenter', 'chiffrer', 'estimer', 'choisir', 'identifier', 'designer', 'considerer', 'souscrire', 'maintenir', 'garder', 'raccorder', 'assurer', 'mettre',
  'remettre', 'produire', 'rediger', 'tenir', 'informer', 'prevenir', 'realiser', 'effectuer', 'controler', 'former', 'recruter', 'affecter', 'deployer',
  'installer', 'paramétrer', 'parametrer', 'signaler', 'alerter', 'adresser', 'envoyer', 'renseigner', 'actualiser', 'conserver', 'archiver', 'proposer']);
/**
 * Infinitif en tête de consigne (T5N-9) : verbe connu, ou mot en -er / -ir / -re (hors PAS_INFINITIF) suivi d'un déterminant,
 * d'une préposition, d'une virgule, d'un deux-points ou d'un second infinitif coordonné.
 */
export function estInfinitif(mot: string, suite: string): boolean {
  const k = String(mot || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (VERBES_CONSIGNE.has(k)) return true;
  if (!/(?:er|ir|re)$/.test(k) || PAS_INFINITIF.has(k) || NOMS_EN_ER.has(k) || k.length < 4) return false;
  // Terminaisons de noms (« Heure de … », « Procédure d'alerte », « Horaire », « Mémoire », « Dossier de … ») : jamais un infinitif ;
  // en « -ier », seuls les verbes en « -ifier » et quelques verbes usuels.
  if (/(?:ure|aire|oire|iere|ere|oir)$/.test(k) && !/^(?:croire|voir|prevoir|recevoir|pourvoir|percevoir|concevoir|devoir|emouvoir)$/.test(k)) return false;
  if (/ier$/.test(k) && !/ifier$/.test(k) && !/^(?:etudier|copier|relier|trier|publier|multiplier|associer|negocier|apprecier|privilegier|remercier|oublier|varier|lier|plier|nier|envoyer|appuyer)$/.test(k)) return false;
  if (/re$/.test(k) && !/(?:dre|tre|ire|vre|aitre|oitre)$/.test(k)) return false;
  return /^\s*[,:]|^\s+(?:la|le|les|l['’]|un|une|des|du|de|d['’]|à|au|aux|chaque|tout|toute|tous|toutes|son|sa|ses|leur|leurs|ce|cet|cette|ces|sans|en|sur|si|que|qu['’]|et\s+[a-zà-ÿ]+(?:er|ir|re))(?=[\s,.;'’]|$)/i.test(suite);
}

/**
 * Question qui coordonne une demande et un groupe nominal (« Combien d'agents …, et confirmation de l'engagement à … ? »,
 * T5-CONS-9) : deux questions correctes (« … ? Confirmez-vous l'engagement à … ? »).
 */
function scinderCoordination(t: string): string {
  const coord = /^(.+?),?\s+et\s+(confirmation|pr[ée]cision|indication)\s+(de la|de l['’]|du|des|de|d['’])\s*([^?]+?)\s*\?(.*)$/i.exec(t);
  if (!coord) return t;
  const art = /^de la$/i.test(coord[3]) ? 'la ' : /^(?:de l['’]|d['’])$/i.test(coord[3]) ? "l'" : /^du$/i.test(coord[3]) ? 'le ' : /^des$/i.test(coord[3]) ? 'les ' : '';
  const verbe = /^confirmation$/i.test(coord[2]) ? 'Confirmez-vous' : /^pr/i.test(coord[2]) ? 'Pouvez-vous préciser' : 'Pouvez-vous indiquer';
  return `${coord[1].replace(/\s*[,;]\s*$/, '')} ? ${verbe} ${art}${coord[4]} ?${coord[5]}`.replace(/\s+$/, '');
}
