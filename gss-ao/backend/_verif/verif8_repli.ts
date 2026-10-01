// Vérification 8 : repli des schémas de la bibliothèque quand le moteur Python échoue (thème par défaut).
process.env.PYTHON_BIN = '/inexistant/python3';
import { schemasBibliotheque, themeActif } from '../src/generation/themes';
const m = schemasBibliotheque(['I-PRE-01', 'III-RON-02'], 'page');
for (const [id, svg] of m) {
  const anciennes = (svg.match(/#(D9D9D9|484545|FBFAF4|F5F5DE|463A2F|6298C0|1D49A7|DD4E49|E99842)/gi) || []).length;
  const vb = /viewBox="([^"]+)"/.exec(svg)?.[1];
  console.log(JSON.stringify({ theme: themeActif(), id, viewBox: vb, anciennes_couleurs: anciennes, lexend: /Lexend/.test(svg) }));
}
