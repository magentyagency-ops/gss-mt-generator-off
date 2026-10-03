// Tour 5 (T5N-5, becquerel 591) : le mémoire ne promet jamais une valeur du CCTP contraire à une procédure de GSS gardée.
import { describe, it, expect } from 'vitest';
import { retirerEngagementsRefuses, messageAjoutsAdaptation } from '../src/generation/reponse_libre_v2';
import { ajoutContraireAuxDelaisGss } from '../src/generation/memoire_type';
import { voixDeGss } from '../src/generation/format_court';

const B1 = `## Vos attentes et nos engagements
- **« au moins 10 jours avant le début du mois considéré »** : transmettre les plannings mensuels dans le délai demandé → « La planification »
- **« remplacement immédiat d'un agent absent »** : assurer la continuité des deux postes → « Le remplacement d'un agent absent »
- **« PC sécurité 24h/24 »** : un agent SSIAP 2 tient le poste en continu → « L'adéquation de nos moyens humains avec votre besoin »

## Les points de vigilance identifiés et nos réponses
- **Deux postes** : coordination → « La planification »`;

describe('engagements du bloc 1 contraires à une pratique de GSS gardée (T5N-5)', () => {
  it('puces retirées jusqu’à la réponse de GSS ; les autres restent', () => {
    const r = retirerEngagementsRefuses(B1, ['Les plannings mensuels sont transmis au moins 10 jours avant le début du mois considéré.', "Exigence du CCTP : remplacement immédiat d'un agent absent."]);
    expect(r.retirees).toHaveLength(2);
    expect(r.texte).not.toMatch(/10 jours|immédiat/);
    expect(r.texte).toContain('PC sécurité 24h/24');
    expect(r.texte).toContain('## Les points de vigilance');
    expect(r.marques.map((x) => x.toLowerCase())).toEqual(['10 jours', 'immédiat']);
    expect(retirerEngagementsRefuses(B1, ['Les rondes sont faites à pied.']).retirees).toEqual([]);
  });
  it('ajout de l’adaptation contraire au délai de GSS ; « du candidat » écrit « de GSS » ; message à GSS', () => {
    const gss = "il appelle l'agent et mobilise automatiquement l'agent d'astreinte, qui est sur site en 60 minutes maximum ;";
    expect(ajoutContraireAuxDelaisGss("Nous assurons le remplacement immédiat d'un agent absent par un agent qualifié.", gss)).toBe(gss);
    expect(ajoutContraireAuxDelaisGss('Le remplacement d’un agent absent intervient en 60 minutes maximum.', gss)).toBe('');
    expect(voixDeGss('Le personnel affecté au marché est employé comme salarié du candidat.')).toBe('Le personnel affecté au marché est employé comme salarié de GSS.');
    expect(voixDeGss('Le candidat retenu est informé.')).toBe('Le candidat retenu est informé.');
    expect(messageAjoutsAdaptation([{ titre: "L'adéquation", phrase: 'Phrase ajoutée.' }])).toMatch(/^J'ai ajouté au texte de GSS une phrase rédigée/);
  });
});
