// Correction 9, bug 2 : formes longue / courte de l'acheteur, durée, ouverture du bloc 1, genre d'une société.
import { formesClient, publiposter, variablesDuMarche, chargerMemoireType, donneesBesoin, preparerMemoireType } from '../src/generation/memoire_type';
let ko = 0;
const verifier = (nom: string, ok: boolean, detail = '') => { console.log(`${ok ? 'OK ' : 'KO '} ${nom}${detail ? ` — ${detail}` : ''}`); if (!ok) ko++; };
const IGN = "École Nationale des Ponts et Chaussées (ENPC) et Institut national de l’information géographique et forestière (IGN), pour l’École nationale des sciences géographiques (ENSG, dénommée Géodata Paris)";
const f = formesClient(IGN);
verifier('forme longue avec article', /\(ENPC\) et l['’]Institut/.test(f.long), f.long);
verifier('forme courte', f.court?.article === "l'" && f.court?.nom === "ENPC et l'IGN", JSON.stringify(f.court));
verifier('nom court sans forme courte', !formesClient('Citédia Métropole').court);
const mt = chargerMemoireType();
const ctx: any = { cover: { client: IGN }, analyse: { clientName: IGN, projectTitle: 'Prestations de gardiennage', duration: 'durée initiale de 2 ans à compter du démarrage effectif' }, dce: '', registre: [] };
const prep = preparerMemoireType(ctx);
const v = prep.variables;
const r = publiposter("Le site de {{CLIENT}} reçoit chaque mois. Envoi du planning à {{CLIENT}}. {{CLIENT}} peut, s'il le souhaite, consulter.", v, { definitions: mt.variables });
verifier('publipostage forme courte', r.texte === "Le site de l'ENPC et l'IGN reçoit chaque mois. Envoi du planning à l'ENPC et l'IGN. L'ENPC et l'IGN peuvent, s'ils le souhaitent, consulter.", r.texte);
const d = donneesBesoin(prep, ctx);
verifier('amorce longue sans « nous consulte » ni « durée de durée »', /^L.École Nationale [^]*\(ENPC\) et l['’]Institut [^]* lance/.test(d.amorce) && !/dur[ée]e de dur[ée]e|nous consulte/.test(d.amorce), d.amorce);
verifier('client de la rédaction court', d.client === "l'ENPC et l'IGN", d.client);
const ctx2: any = { cover: { client: 'S.P.L. CITEDIA METROPOLE' }, analyse: { clientName: 'Citédia Métropole' }, dce: '', registre: [] };
const v2 = variablesDuMarche(mt, ctx2, {});
verifier('Citédia : nom d\'usage', v2.CLIENT.valeur === 'Citédia Métropole', String(v2.CLIENT.valeur));
const r2 = publiposter("et {{CLIENT}} peut, s'il le souhaite, être destinataire", v2, { definitions: mt.variables });
verifier('Citédia : société au féminin', /Citédia Métropole peut, si elle le souhaite/.test(r2.texte), r2.texte);
const r3 = publiposter("d'une durée de {{DUREE_MARCHE}}.", { DUREE_MARCHE: { valeur: 'durée initiale de 2 ans' } }, { definitions: mt.variables });
verifier('durée sans répétition', r3.texte === "d'une durée initiale de 2 ans." || r3.texte === "d'une durée de 2 ans.", r3.texte);
{
  const dceCit = require('fs').readFileSync('/private/tmp/claude-501/-Users-stanislastolegano-GSS-Version-Finale/8345a302-25fc-48b3-8606-859ba09681d5/scratchpad/refonte/c9/dce_citedia2.txt', 'utf-8');
  const v3 = variablesDuMarche(mt, { cover: { client: 'Citédia Métropole' }, analyse: { clientName: 'Citédia Métropole' }, dce: dceCit, registre: [] } as any, {});
  const r4 = publiposter("{{CLIENT}} peut, s'il le souhaite, être destinataire", v3, { definitions: mt.variables });
  verifier('Citédia (S.P.L. dans le DCE) : féminin', /si elle le souhaite/.test(r4.texte), r4.texte);
}
console.log(ko ? `${ko} ÉCHEC(S)` : 'TOUT OK');
