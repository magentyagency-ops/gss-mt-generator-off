// Correction 9, bug 9 : schéma opérationnel du cas pratique d'Étampes (répartition des effectifs par plage, dessiné par
// le moteur sur le texte de la réponse) et relais cynophile proposé quand le chien ne peut pas exercer.
import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';
import { calculerDimensionnement, etapesSchemaDemande, remplirCasPratique } from '../src/generation/dimensionnement';
import { specProcessBesoin } from '../src/generation/reponse_libre_v2';
import { dessinerSpecs } from '../src/generation/schema_service';
import { controlerFaitsNouveauxCadre, RELAIS_CYNOPHILE } from '../src/generation/memoire_type_cadre';
import { normaliser } from '../src/generation/memoire_type';
let ko = 0;
const verifier = (nom: string, ok: boolean, detail = '') => { console.log(`${ok ? 'OK ' : 'KO '} ${nom}${detail ? ` — ${detail}` : ''}`); if (!ok) ko++; };
const D = '/private/tmp/claude-501/-Users-stanislastolegano-GSS-Version-Finale/8345a302-25fc-48b3-8606-859ba09681d5/scratchpad/refonte/c9';
const d = calculerDimensionnement(JSON.parse(fs.readFileSync(`${D}/rep_etampes1.json`, 'utf-8')), fs.readFileSync(`${D}/dce_etampes1.txt`, 'utf-8'))!;
const et = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../_corpus_verif/_resultats/v-etampes1-13.json'), 'utf-8')).texte_docx as string;
const i = et.indexOf('Schéma opérationnel et répartition des effectifs\n');
const champ = remplirCasPratique(et.slice(i, et.indexOf('\n\n', et.indexOf('Lundi férié, 6 h–21 h | Encadrant', i))), d).texte;
const cadre = new PizZip(fs.readFileSync(path.resolve(__dirname, '../../_corpus_verif/etampes1/2026MA006 - CADRE MEMOIRE TECHNIQUE LOT 1.docx'))).file('word/document.xml')!.asText().split(/<w:p[ >]/).map((p) => (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map((m) => m.replace(/<[^>]+>/g, '')).join('')).filter((t) => t.trim()).join('\n');
const etapes = etapesSchemaDemande(champ, d)!;
console.log(JSON.stringify(etapes));
const spec = specProcessBesoin(etapes, 'flux')!;
(async () => {
  const r = (await dessinerSpecs([{ id: 'demande', gabarit: spec.gabarit, params: spec.params, source: `${champ}\n${cadre}`, titre_section: 'Schéma opérationnel' }], 'paysage')).get('demande');
  verifier('schéma opérationnel dessiné (répartition par plage + résultat)', !!r?.ok, (r?.erreurs || []).join(' | '));
  if (r?.svg) fs.writeFileSync(`${D}/etampes_schema_operationnel.svg`, r.svg);
  // Relais cynophile.
  const sources: any = { toutes: normaliser('GSS agent sécurité maître-chien rondes'), gss: '' };
  const contexte = 'Question: "Mise en situation appliquée : Descriptif de la solution suggérée par le candidat en cas d\'absence d\'1 agent de sécurité et d\'1 chien ne pouvant exercer"';
  const long = "L'agent absent est remplacé par un agent d'astreinte de GSS, formé au site, qui prend le relais dès son arrivée et reçoit les consignes du poste. Le responsable cynophile, Vladimir KOSTOV, coordonne la recherche d'un binôme cynophile apte à prendre le relais. Le client est informé de la situation et du remplacement effectué par le responsable d'exploitation.";
  const a = controlerFaitsNouveauxCadre(long, contexte, sources);
  verifier('phrase sur le chien retirée → relais cynophile proposé', a.texte.includes(RELAIS_CYNOPHILE) && !/KOSTOV/.test(a.texte) && a.questions.some((q) => /^Proposition à valider/.test(q)), a.questions.join(' | '));
  const b = controlerFaitsNouveauxCadre(long.replace(/ Le responsable cynophile[^.]*\./, ''), contexte, sources);
  verifier('réponse muette sur le chien → relais cynophile ajouté', b.texte.endsWith(RELAIS_CYNOPHILE));
  const c = controlerFaitsNouveauxCadre(long.replace(/ Le responsable cynophile[^.]*\./, ''), 'Question: "Remplacement d\'un agent absent"', sources);
  verifier('hors mise en situation du chien : rien d\'ajouté', !c.texte.includes(RELAIS_CYNOPHILE));
  console.log(ko ? `${ko} ÉCHEC(S)` : 'TOUT OK');
  process.exit(0);
})();
