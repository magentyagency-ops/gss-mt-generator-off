// Correction 8 : repli de l'organigramme sans moteur Python (PYTHON_BIN inexistant) : aux couleurs du thème.
process.env.PYTHON_BIN = '/inexistant/python3';
import { organigrammeSvg } from '../src/generation/organigramme';
for (const [f, t] of [['page', 'marine'], ['paysage', 'marine'], ['paysage', 'gss-2026-09']] as const) {
  const svg = organigrammeSvg(f, t) || '';
  const anciennes = (svg.match(/#(D9D9D9|484545|FBFAF4|F5F5DE|463A2F|6298C0|1D49A7|DD4E49|E99842)/gi) || []).length;
  console.log(JSON.stringify({ format: f, theme: t, viewBox: /viewBox="([^"]+)"/.exec(svg)?.[1], anciennes_couleurs: anciennes }));
}
