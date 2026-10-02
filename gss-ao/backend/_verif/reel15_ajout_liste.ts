/**
 * HARNAIS HORS LIGNE (aucun appel OpenAI) — adaptation au CCTP, ajout dont le point d'insertion est une ligne qui annonce
 * une liste (« …, votre interlocuteur unique est : », génération réelle imm 15) : l'ajout a son propre paragraphe après
 * la liste, jamais collé après les deux-points ; une insertion en fin de phrase ordinaire est inchangée.
 */
import { appliquerModifications } from '../src/generation/memoire_type';
const texte = "Nous proposons donc un numéro unique.\n\nPour le marché de l'IMM, votre interlocuteur unique est :\n- Interlocuteur unique : MARCHANI Adil ;\n- Numéro unique : 06 58 06 32 25 ;\n- Mail unique : contact@gss-securite.fr.\n\nGSS notifie au Client toute modification.";
const ajout = "Les agents sont identifiables à tout moment et justifient de leur appartenance à l'entreprise titulaire.";
let ko = 0;
const a = appliquerModifications(texte, { ajouts: [{ apres: 'votre interlocuteur unique est', texte: ajout }] });
const attendu = "Nous proposons donc un numéro unique.\n\nPour le marché de l'IMM, votre interlocuteur unique est :\n- Interlocuteur unique : MARCHANI Adil ;\n- Numéro unique : 06 58 06 32 25 ;\n- Mail unique : contact@gss-securite.fr.\n\n" + ajout + "\n\nGSS notifie au Client toute modification.";
if (a.texte !== attendu || a.appliquees.length !== 1) { ko++; console.log(`ÉCHEC liste annoncée :\n${a.texte}`); }
const b = appliquerModifications(texte, { ajouts: [{ apres: 'Nous proposons donc un numéro unique', texte: ajout }] });
if (!b.texte.startsWith(`Nous proposons donc un numéro unique. ${ajout}\n\n`)) { ko++; console.log(`ÉCHEC fin de phrase :\n${b.texte}`); }
console.log(ko ? `${ko} échec(s)` : '2/2 cas conformes');
process.exit(ko ? 1 : 0);
