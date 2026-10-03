import { describe, it, expect } from 'vitest';
import { formesClient, preparerMemoireType, publierMemoire } from '../src/generation/memoire_type';

/** Tour 9 (T9-COH-1, T9-COH-2) : forme juridique jamais coupée, nom en capitales, nom d'usage sans article, sigle du DCE. */
const publie = (client: string, dce: string) => {
  const prep: any = preparerMemoireType({ dce, analyse: { clientName: client } } as any);
  return { v: prep.variables.CLIENT, texte: publierMemoire(prep).map((r: any) => r.texte || '').join('\n') };
};

describe('société : forme juridique retirée en entier (T9-COH-1)', () => {
  it('« Société publique locale », « Société d’économie mixte » : le nom imprimé ne commence jamais par « locale » ni « mixte »', () => {
    for (const [client, nom] of [
      ['Société publique locale Citédia Métropole', 'Citédia Métropole'],
      ['Société Publique Locale CITEDIA METROPOLE', 'CITEDIA METROPOLE'],
      ["Société d'économie mixte Alençon Normandie Équipements", 'Alençon Normandie Équipements'],
      ['Société par actions simplifiée Rouen Expo Événements', 'Rouen Expo Événements'],
    ]) {
      const { v, texte } = publie(client, `${client}. 76000 Rouen. Marché de surveillance.`);
      expect(v.valeur).toBe(nom);
      expect(v.genre).toBe('f');
      expect(texte).not.toMatch(/\b(?:locale|Locale|mixte|actions simplifiée) (?:Citédia|CITEDIA|Alençon|Rouen Expo)/);
    }
  });
});

describe('forme courte d’un nom long (T9-COH-2)', () => {
  it('nom en capitales : forme juridique en graphie usuelle, nom d’usage écrit comme le DCE (« l’Opéra de Rouen Normandie »)', () => {
    const client = 'ÉTABLISSEMENT PUBLIC DE COOPÉRATION CULTURELLE OPÉRA DE ROUEN NORMANDIE';
    const { v, texte } = publie(client, `${client}. 76000 Rouen. L'Opéra de Rouen Normandie confie la surveillance.`);
    expect(v.valeur).toBe('Établissement public de coopération culturelle Opéra de Rouen Normandie');
    expect(v).toMatchObject({ court: 'Opéra de Rouen Normandie', articleCourt: "l'" });
    expect(texte).not.toMatch(/OPÉRA DE ROUEN/);
    expect(texte).toMatch(/Pour l'Opéra de Rouen Normandie, nous mobilisons/);
  });
  it('GIP : le sigle que le DCE emploie avec un article (« le GIP FCIP »), jamais « Pour Formation Continue… »', () => {
    const client = "Groupement d'Intérêt Public Formation Continue et Insertion Professionnelle de l'Académie de Rouen";
    const { v, texte } = publie(client, `${client} (GIP FCIP). 76000 Rouen. Le GIP FCIP confie la surveillance. Le GIP FCIP exige. Le GIP FCIP.`);
    expect(v).toMatchObject({ court: 'GIP FCIP', articleCourt: 'le' });
    expect(texte).toMatch(/Pour le GIP FCIP, nous mobilisons/);
    expect(texte).not.toMatch(/(?:Pour|à|dédiée à) Formation Continue/);
    // Sigle employé une seule fois : aucune forme courte, le nom entier avec son article.
    const un = publie(client, `${client} (GIP FCIP). 76000 Rouen. Le GIP FCIP confie.`);
    expect(un.v.court).toBeUndefined();
    expect(un.texte).not.toMatch(/(?:Pour|à|dédiée à) Formation Continue/);
  });
  it('CCI : « la CCI Rouen Métropole » quand le DCE l’emploie ; jamais « la Chambre » seule', () => {
    const client = "Chambre de commerce et d'industrie territoriale Rouen Métropole et Seine-Maritime";
    const avec = publie(client, `${client} (CCI Rouen Métropole). 76000 Rouen. La CCI Rouen Métropole confie la surveillance. La CCI Rouen Métropole exige. La CCI Rouen Métropole demande.`);
    expect(avec.v).toMatchObject({ court: 'CCI Rouen Métropole', articleCourt: 'la' });
    expect(avec.texte).toMatch(/Pour la CCI Rouen Métropole, nous mobilisons/);
    expect(formesClient(client, `${client}. 76000 Rouen.`).court).toBeUndefined();
    expect(publie(client, `${client}. 76000 Rouen.`).texte).not.toMatch(/la Chambre[,.;]/);
  });
  it('cas déjà validés inchangés (EPIC sans article, syndicat, SAR de Rouen)', () => {
    expect(formesClient('Établissement public industriel et commercial Rouen Normandie Tourisme & Congrès', 'Établissement public industriel et commercial Rouen Normandie Tourisme & Congrès. 76000 Rouen.').court).toMatchObject({ article: '', nom: 'Rouen Normandie Tourisme & Congrès' });
    expect(formesClient('Syndicat mixte de gestion des déchets ménagers et assimilés de la région elbeuvienne et du plateau du Neubourg').court).toMatchObject({ article: 'le', nom: 'Syndicat mixte' });
    expect(formesClient("Ministère de la Justice – Service administratif régional de Rouen (SAR de Rouen), BOP Normand, pour les cours d'appel de Rouen et de Caen", 'Le SAR de Rouen assure. Le SAR de Rouen. Le SAR de Rouen.').court?.nom).toBe('SAR de Rouen');
  });
});
