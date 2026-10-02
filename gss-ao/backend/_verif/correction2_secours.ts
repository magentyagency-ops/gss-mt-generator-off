// Correction 2, bug B : schéma de secours du bloc 1 (sous-titres prescrits) accepté par le moteur, process de 4 phases.
import { dessinerSpecs } from '../src/generation/schema_service';
import { specSecoursBesoin } from '../src/generation/reponse_libre_v2';
const V = '/private/tmp/claude-501/-Users-stanislastolegano-GSS-Version-Finale/8345a302-25fc-48b3-8606-859ba09681d5/scratchpad/refonte/verif2';
(async () => {
  let ko = 0;
  const textes: [string, string][] = ['becquerel', 'caen', 'ign'].map((c) => [c, require(`${V}/${c}/etat.json`).libre.sections.b1_comprehension]);
  textes.push(['sous-titres seuls', '## Le périmètre de la prestation demandée\n\nTexte.\n\n## Vos attentes et nos engagements\n\nTexte.\n\n## Les points de vigilance identifiés et nos réponses\n\nTexte.']);
  for (const [nom, texte] of textes) {
    const spec = specSecoursBesoin(texte);
    // Tour 2 (T2C-1) : sans aucune phrase de résultat dans le texte, pas de schéma plutôt qu'une étape « Votre résultat » vide.
    if (!spec) { if (nom !== 'sous-titres seuls') ko++; console.log(nom === 'sous-titres seuls' ? 'OK ' : 'KO', nom, 'aucune spécification'); continue; }
    const r = (await dessinerSpecs([{ id: 'b1_comprehension', gabarit: spec.gabarit, params: spec.params, source: texte, titre_section: 'Notre compréhension de votre besoin' } as any], 'page')).get('b1_comprehension');
    const etapes = spec.params.etapes.map((e: any) => `${e.titre} [${e.role}]${e.texte ? ` : ${e.texte}` : ''}`);
    const ok = !!r?.ok && spec.params.etapes.length === 4 && spec.params.etapes[3].role === 'vert';
    if (!ok) ko++;
    console.log(ok ? 'OK ' : 'KO ', nom, '\n   ' + etapes.join('\n   '), r?.ok ? '' : `\n   erreurs : ${JSON.stringify(r?.erreurs)}`);
  }
  console.log(ko ? `${ko} échec(s)` : 'tous acceptés');
  process.exit(0);
})();
