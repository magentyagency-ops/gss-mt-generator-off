const fs = require('fs');
const dstFile = 'c:/Users/linal/GSSCLARENCE/gss-ao/backend/src/generation/memoire_generator.ts';
let code = fs.readFileSync(dstFile, 'utf8');

// Undo the fuzzy match around line 3922
code = code.replace(
  /RÈGLES DE RÉDACTION \(champ "pages"\) :[\s\S]*?- CONCRÉTUDE :/m,
  `RÈGLES DE RÉDACTION (champ "pages") :
- Marché \${marketType === 'public' ? 'PUBLIC : vocabulaire de la commande publique, obligations du CCP, conformité, transparence, pénalités' : 'PRIVÉ : ton commercial, flexibilité, SLA sur mesure, adaptation aux process internes'}. Secteur : \${sector}.
- PERSONNALISE : cite le nom du client (\${clientName})\${sites.length ? \` et ses sites (\${sites.slice(0, 6).join(', ')})\` : ''}, ses enjeux réels.
- CONCRÉTUDE :`
);

// Apply the correct modification to the MARP systemPrompt around line 4016
const oldMarpPrompt = `- Personnalise FORTEMENT pour le client \${clientName}.
- Ne rédige QUE le contenu de cette section, SANS introduction globale SANS conclusion générale, et SANS salutations.\`;`;

const newMarpPrompt = `- Personnalise FORTEMENT pour le client \${clientName}.
- Ne rédige QUE le contenu de cette section, SANS introduction globale SANS conclusion générale, et SANS salutations.
- IMPORTANT / ANTI-HALLUCINATION : Ne JAMAIS inventer de politiques sociales, de primes (ex: prime de fin d'année), d'avances sur salaire, ou de certifications (ex: APSAD R8) si elles ne sont pas explicitement écrites dans les Atouts GSS fournis.
- IMPORTANT / DCE vs OFFRE : Ne JAMAIS recopier les contraintes, pénalités ou exigences du client (ex: pénalités CCAP, pénalités sur manquements) en les présentant comme la politique qualité de GSS. GSS subit le CCAP, il ne faut pas l'afficher comme un atout !\`;`;

code = code.replace(oldMarpPrompt, newMarpPrompt);

fs.writeFileSync(dstFile, code);
console.log('Fixed both prompts successfully.');
