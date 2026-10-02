// Correction 2, bug B : schéma de secours du bloc 1 (sous-titres prescrits) accepté par le moteur, process de 4 phases.
import { dessinerSpecs } from '../src/generation/schema_service';
import { specSecoursBesoin, specSecoursPuces, anomaliesSchemaBloc1 } from '../src/generation/reponse_libre_v2';
import fs from 'fs';
const Q4 = '/private/tmp/claude-501/-Users-stanislastolegano-GSS-Version-Finale/8345a302-25fc-48b3-8606-859ba09681d5/scratchpad/refonte/qualite/tour4';
const V = '/private/tmp/claude-501/-Users-stanislastolegano-GSS-Version-Finale/8345a302-25fc-48b3-8606-859ba09681d5/scratchpad/refonte/verif2';
(async () => {
  let ko = 0;
  const textes: [string, string][] = ['becquerel', 'caen', 'ign'].map((c) => [c, require(`${V}/${c}/etat.json`).libre.sections.b1_comprehension]);
  // Tour 4 : textes réels caen 471 et 441 (réponse libre) et imm 473 (format court).
  for (const [n, f] of [['caen 471', 'consignes/caen_b1.md'], ['caen 441', 'nouveautes/caen_b1.md'], ['imm 473', 'consignes/imm_c5.md']]) if (fs.existsSync(`${Q4}/${f}`)) textes.push([n, fs.readFileSync(`${Q4}/${f}`, 'utf-8')]);
  textes.push(['sous-titres seuls', '## Le périmètre de la prestation demandée\n\nTexte.\n\n## Vos attentes et nos engagements\n\nTexte.\n\n## Les points de vigilance identifiés et nos réponses\n\nTexte.']);
  for (const [nom, texte] of textes) {
    const spec = specSecoursPuces(texte) || specSecoursBesoin(texte);
    // Tour 2 (T2C-1) : sans aucune phrase de résultat dans le texte, pas de schéma plutôt qu'une étape « Votre résultat » vide.
    if (!spec) { if (nom !== 'sous-titres seuls') ko++; console.log(nom === 'sous-titres seuls' ? 'OK ' : 'KO', nom, 'aucune spécification'); continue; }
    const r = (await dessinerSpecs([{ id: 'b1_comprehension', gabarit: spec.gabarit, params: spec.params, source: texte, titre_section: 'Notre compréhension de votre besoin' } as any], 'page')).get('b1_comprehension');
    const etapes = spec.params.etapes.map((e: any) => `${e.titre} [${e.role}]${e.texte ? ` : ${e.texte}` : ''}`);
    // Gabarit du tour 3 et suivants : 2 à 4 étapes de contenu puis « Votre résultat » (vert) ; chaque texte d'étape est
    // une réponse entière (aucune anomalie : ni « ** », ni sujet coupé, ni texte sans sujet, ni titre qui est une phrase).
    const n = spec.params.etapes.length;
    const ok = !!r?.ok && n >= 3 && n <= 5 && spec.params.etapes[n - 1].role === 'vert' && spec.params.etapes[n - 1].titre === 'Votre résultat' && !anomaliesSchemaBloc1(spec).length;
    if (!ok) ko++;
    console.log(ok ? 'OK ' : 'KO ', nom, '\n   ' + etapes.join('\n   '), r?.ok ? '' : `\n   erreurs : ${JSON.stringify(r?.erreurs)}`);
  }
  console.log(ko ? `${ko} échec(s)` : 'tous acceptés');
  process.exit(0);
})();
