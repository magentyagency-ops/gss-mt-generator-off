// Vérification 7 (assistant et compatibilité), HORS LIGNE : aucun appel OpenAI (SDK intercepté).
//  A. format court : l'action « modifier » de l'assistant sur une partie qui porte le schéma de process de la
//     compréhension (#court#process) ou l'organigramme (#court#organigramme) : schémas gardés après recomposition ?
//  B. réponse libre v2 : « modifier » sur le bloc 1 (schéma de process) : schéma et titre de la page de schéma après ;
//     « modifier » sur une rubrique à schéma fixe (bibliothèque) : schéma gardé.
//  C. état v1 réel (avant la refonte) : chapitres proposés à l'assistant (I à IV) et repli d'un chapitre « V ».
// Usage : npx ts-node --transpile-only -P tsconfig.json _verif/verif7_assistant.ts <A|B|C> <état source> <dossier de sortie>
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import OpenAI from 'openai';

const [CAS, SOURCE, SORTIE] = process.argv.slice(2);
fs.mkdirSync(SORTIE, { recursive: true });
if (!process.env.CHROME_PATH) {
  const lanceur = path.join(SORTIE, 'chrome.sh');
  fs.writeFileSync(lanceur, `#!/bin/sh\nexec "${require('puppeteer').executablePath()}" --disable-gpu-vsync --disable-frame-rate-limit --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows "$@"\n`);
  fs.chmodSync(lanceur, 0o755);
  process.env.CHROME_PATH = lanceur;
}
const etat0 = JSON.parse(fs.readFileSync(SOURCE, 'utf-8'));
const id = `verif7-${CAS}`;
etat0.dossierId = id;
const etatF = path.resolve(__dirname, '../response/etats', `${id}.json`);
fs.writeFileSync(etatF, JSON.stringify(etat0));

const cli: any = new OpenAI({ apiKey: 'hors-ligne' });
const CP = Object.getPrototypeOf(cli.chat.completions);
const EP = Object.getPrototypeOf(cli.embeddings);
const prompts: string[] = [];
let plan: any = null;
CP.create = async (body: any) => {
  const s = String(body.messages?.[0]?.content || '');
  const u = String(body.messages?.[1]?.content || '');
  prompts.push(`${s}\n${u}`);
  let rep: any = {};
  if (/assistant de modification/.test(s)) rep = plan;
  else if (/Tu réécris/.test(s)) {
    const m = /Texte actuel[^:]*:\n([\s\S]*?)\n\nConsigne/.exec(u) || /RUBRIQUE ACTUELLE[^:]*:\n([\s\S]*?)\n\nConsigne/.exec(u);
    rep = { texte: `${(m?.[1] || 'Texte réécrit.').trim()}\n\nNotre chef de site vérifie chaque mois ce dispositif.` };
  } else if (/Tu rédiges une nouvelle rubrique/.test(s)) rep = { texte: '## Notre démarche\n\nGSS réduit ses consommations sur le site et suit ses émissions chaque trimestre.' };
  else if (/questions|emplacement/i.test(s)) rep = { questions: [] };
  else rep = {};
  return { choices: [{ message: { content: JSON.stringify(rep) } }], usage: {}, model: body.model };
};
EP.create = async (body: any) => {
  const inp: string[] = Array.isArray(body.input) ? body.input : [body.input];
  return { data: inp.map((_t, i) => ({ index: i, embedding: new Array(1536).fill(0.01) })) };
};

const textePdf = (f: string) => (spawnSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf-8', maxBuffer: 1 << 26 }).stdout || '');

(async () => {
  const { discuter } = require('../src/generation/assistant_memoire');
  const out: any = { cas: CAS };
  try {
    if (CAS === 'A') {
      out.schemas_avant = Object.keys(etat0.libre.schemas);
      const cible = Object.keys(etat0.libre.schemas).find((k) => k.endsWith('#court#process'))!.split('#')[0];
      plan = { reponse: 'Partie complétée.', actions: [{ type: 'modifier', id: cible, consigne: 'Ajoute que le chef de site vérifie chaque mois.' }] };
      const r = await discuter(id, 'Dans la partie sur la compréhension, ajoute que le chef de site vérifie chaque mois.');
      out.modifies = r.modifies;
      out.schemas_apres = Object.keys(r.etat.libre.schemas);
      const orga = Object.keys(etat0.libre.schemas).find((k) => k.endsWith('#court#organigramme'))!.split('#')[0];
      plan = { reponse: 'Partie complétée.', actions: [{ type: 'modifier', id: orga, consigne: 'Ajoute que le chef de site vérifie chaque mois.' }] };
      const r2 = await discuter(id, 'Dans la partie organisation, ajoute que le chef de site vérifie chaque mois.');
      out.schemas_apres_2 = Object.keys(r2.etat.libre.schemas);
      fs.copyFileSync(r2.etat.fichier, path.join(SORTIE, 'apres.pdf'));
      out.pdf = path.join(SORTIE, 'apres.pdf');
      // Contrôle (correction 7) : tous les schémas du format court sont gardés, l'organigramme est toujours dans le PDF.
      out.controle_schemas_gardes = out.schemas_avant.every((k: string) => out.schemas_apres_2.includes(k));
      out.controle_organigramme_pdf = /Directeur d.agence/i.test(textePdf(r2.etat.fichier));
    } else if (CAS === 'E') {
      // Format court : « Supprime la proposition sur … » ne vide plus la partie du RC ; une partie sans proposition
      // n'est jamais supprimée.
      const prop = etat0.libre.ajouts.find((x: any) => x.proposition);
      const autre = etat0.libre.court.plan.map((p: any) => p.id).find((x: string) => !etat0.libre.ajouts.some((a: any) => a.id === x && a.proposition));
      const avant = etat0.libre.sections[prop.id].length;
      plan = { reponse: 'Proposition supprimée.', actions: [{ type: 'supprimer', id: prop.id }, { type: 'supprimer', id: autre }] };
      const r = await discuter(id, `Supprime la proposition sur ${prop.sujet}.`);
      const consigne = prompts.find((x) => /Tu réécris/.test(x)) || '';
      out.proposition = prop;
      out.autre = autre;
      out.reponse = r.reponse;
      out.modifies = r.modifies;
      out.taille_partie = { avant, apres: (r.etat.libre.sections[prop.id] || '').length };
      out.autre_gardee = (r.etat.libre.sections[autre] || '').length === etat0.libre.sections[autre].length;
      out.consigne_reecriture = (/Consigne de l'utilisateur : ([^\n]*)/.exec(consigne) || [])[1];
      out.proposition_encore_en_attente = r.etat.libre.ajouts.some((x: any) => x.id === prop.id && x.proposition);
      out.prompt_court = /Une partie du RC ne se supprime pas/.test(prompts.find((x) => /assistant de modification/.test(x)) || '');
      out.schemas_apres = Object.keys(r.etat.libre.schemas);
    } else if (CAS === 'B') {
      const avant = etat0.libre.schemas['b1_comprehension#schema'] || '';
      out.b1_schema_avant = { taille: avant.length, gabarit: (/data-gabarit="([^"]+)"/.exec(avant) || [])[1], titre: etat0.libre.titresSchemas?.b1_comprehension };
      plan = { reponse: 'Compréhension complétée.', actions: [
        { type: 'modifier', id: 'b1_comprehension', consigne: 'Ajoute que le chef de site vérifie chaque mois.' },
        { type: 'modifier', id: 'b2_valeurs', consigne: 'Ajoute que le chef de site vérifie chaque mois.' },
      ] };
      const valeursAvant = etat0.libre.schemas['b2_valeurs#schema'];
      const r = await discuter(id, 'Dans la compréhension du besoin et nos valeurs, ajoute que le chef de site vérifie chaque mois.');
      const apres = r.etat.libre.schemas['b1_comprehension#schema'] || '';
      out.modifies = r.modifies;
      out.b1_schema_apres = { present: !!apres, identique: apres === avant, taille: apres.length, gabarit: (/data-gabarit="([^"]+)"/.exec(apres) || [])[1], titre_page: r.etat.libre.titresSchemas?.b1_comprehension };
      out.b2_valeurs_schema_identique = r.etat.libre.schemas['b2_valeurs#schema'] === valeursAvant;
      out.services_schema = prompts.filter((p) => /schéma|gabarit/i.test(p.slice(0, 400))).map((p) => p.slice(0, 160));
      fs.writeFileSync(path.join(SORTIE, 'b1_avant.svg'), avant);
      fs.writeFileSync(path.join(SORTIE, 'b1_apres.svg'), apres);
      fs.copyFileSync(r.etat.fichier, path.join(SORTIE, 'apres.pdf'));
      const t = textePdf(r.etat.fichier).split('\f');
      out.pages_b1 = t.map((p, i) => ({ i: i + 1, p })).filter(({ p }) => /COMPR[ÉE]HENSION|process/i.test(p.slice(0, 300))).map(({ i, p }) => `${i}: ${p.replace(/\s+/g, ' ').slice(0, 160)}`).slice(0, 6);
    } else if (CAS === 'D') {
      // Route /export-docx : même appel que routes.ts (sections b_* envoyées par le front).
      const { MemoireGenerator } = require('../src/generation/memoire_generator');
      const ids = Object.keys(etat0.libre.sections).slice(0, 3);
      const sections = Object.fromEntries(ids.map((k) => [k, etat0.libre.sections[k].replace(/⟦AC:\d+⟧/g, '')]));
      const md: string[] = [];
      const { MarpGenerator } = require('../src/generation/marp_generator');
      const P: any = MarpGenerator.prototype; const bm = P.buildMarkdown;
      P.buildMarkdown = function (...a: any[]) { const m = bm.apply(this, a); md.push(m); return m; };
      const r = await new MemoireGenerator().exportFromSectionsMap(sections);
      out.ids = ids;
      out.fichier = r.filePath;
      out.pages = textePdf(r.filePath).split('\f').length - 1;
      out.theme_nouveau = /gss-bloc-numero|theme-/.test(md[0] || '');
      out.debut_md = (md[0] || '').slice(0, 600);
      fs.copyFileSync(r.filePath, path.join(SORTIE, 'export.pdf'));
    } else if (CAS === 'C') {
      plan = { reponse: 'Rubrique ajoutée.', actions: [{ type: 'ajouter', chapitre: 'V', titre: 'Nos engagements environnementaux', consigne: 'Une page.' }] };
      const r = await discuter(id, 'Ajoute une page sur nos engagements environnementaux.');
      const p = prompts.find((x) => /assistant de modification/.test(x)) || '';
      out.chapitres_prompt = (/organisé en chapitres \(([^)]*)\)/.exec(p) || [])[1];
      out.ajout = r.etat.libre.ajouts;
      out.modifies = r.modifies;
      out.page = r.page;
      out.theme = r.etat.libre.theme;
      fs.copyFileSync(r.etat.fichier, path.join(SORTIE, 'apres.pdf'));
      out.pdf_pages = textePdf(r.etat.fichier).split('\f').length - 1;
    }
  } catch (e: any) {
    out.erreur = e?.stack || String(e);
  } finally {
    fs.rmSync(etatF, { force: true });
  }
  console.log('RESULTAT ' + JSON.stringify(out, null, 1));
  process.exit(0);
})();
