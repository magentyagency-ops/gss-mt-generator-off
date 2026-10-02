// Tour 2 (T2N-9) : un retrait ou un remplacement qui ôte seulement le début d'une phrase de GSS est refusé.
import { appliquerModifications } from '../src/generation/memoire_type';
const t = "Le chef de site assure le lien entre l'équipe terrain et l'équipe encadrante de GSS. Étant lui-même en poste sur le site, il alerte l'équipe encadrante des besoins.";
const r1 = appliquerModifications(t, { retraits: [{ extrait: 'Étant lui-même en poste sur le site,' }] } as any);
const r2 = appliquerModifications(t, { remplacements: [{ extrait: 'Étant lui-même en poste sur le site,', par: 'présent sur le site,' }] } as any);
const r3 = appliquerModifications(t, { retraits: [{ extrait: 'Étant lui-même en poste sur le site, il alerte l\'équipe encadrante des besoins.' }] } as any);
console.log(r1.refusees.map((x) => x.raison), r2.refusees.map((x) => x.raison), r3.appliquees.length, JSON.stringify(r3.texte));
process.exit(r1.refusees.length === 1 && r2.refusees.length === 1 && r3.appliquees.length === 1 ? 0 : 1);
