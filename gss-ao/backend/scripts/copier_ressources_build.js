#!/usr/bin/env node
/**
 * Étape 2 du build (`npm run build` = `tsc` puis ce script).
 *
 * `tsc` ne recopie que le code. Or le code compilé lit, à côté de lui (chemins relatifs à __dirname),
 * des fichiers qui ne sont pas du TypeScript :
 *   - src/generation/marp/ : gss-theme.css, gss-theme-pages.css, logos, bannières (media/), gss_memoire_master.md
 *     (themes.ts, marp_generator.ts, format_court.ts : path.resolve(__dirname, 'marp')) ;
 *   - src/generation/memoire_type/memoire_type.json (memoire_type.ts, base_memoires.ts).
 * Sans eux, `node dist/main.js` produit des mémoires sans thème, sans polices ni logo, sans aucune erreur.
 *
 * Ce script recopie donc TOUS les fichiers non TypeScript de src/ vers dist/, au même chemin relatif
 * (un fichier ajouté plus tard sous src/ est pris en compte sans modifier le build).
 * Node seul (fs.cpSync, Node 16.7 ou plus) : aucune dépendance, fonctionne sur Mac, Linux et Windows.
 *
 * Usage : node scripts/copier_ressources_build.js [dossier_de_sortie]   (par défaut : dist, relatif au backend)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const BACKEND = path.resolve(__dirname, '..');
const SRC = path.join(BACKEND, 'src');
const DIST = path.resolve(BACKEND, process.argv[2] || 'dist');

const estCode = (f) => /\.(ts|tsx|mts|cts)$/.test(f);

let nb = 0;
function copier(dossier) {
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    const source = path.join(dossier, e.name);
    if (e.isDirectory()) {
      copier(source);
    } else if (e.isFile() && !estCode(e.name) && e.name !== '.DS_Store') {
      const cible = path.join(DIST, path.relative(SRC, source));
      fs.mkdirSync(path.dirname(cible), { recursive: true });
      fs.cpSync(source, cible, { force: true, preserveTimestamps: true });
      nb += 1;
    }
  }
}

copier(SRC);

// Contrôle : les fichiers indispensables au rendu doivent être présents, sinon le build échoue (jamais de mémoire sans thème).
const indispensables = [
  'generation/marp/gss-theme.css',
  'generation/marp/gss-theme-pages.css',
  'generation/marp/logogss.png',
  'generation/marp/logogss_fond_clair.png',
  'generation/marp/media',
  'generation/memoire_type/memoire_type.json',
];
const manquants = indispensables.filter((f) => !fs.existsSync(path.join(DIST, f)));
if (manquants.length) {
  console.error(`[build] Fichiers manquants dans ${DIST} : ${manquants.join(', ')}`);
  process.exit(1);
}
console.log(`[build] ${nb} fichier(s) non TypeScript copié(s) de src/ vers ${path.relative(BACKEND, DIST) || DIST}/`);
