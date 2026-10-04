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
      // Tour 4 (T4-COH-8) : nom en capitales seulement dans le DCE, mis en casse (accents du dictionnaire) ; le mot incertain
      // (« Citedia ») est soumis à GSS.
      ['Société Publique Locale CITEDIA METROPOLE', 'Citedia Métropole'],
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

// Tour 4, correcteur (T4-COH-8, T4-COH-9, T4G-1, T4G-8) : noms d'acheteur et intitulés écrits seulement en capitales.
import { casseDuDce, formesClient } from '../src/generation/memoire_type';
describe('noms et intitulés en capitales (T4-COH-8, T4-COH-9)', () => {
  it('nom en capitales seulement : mots pleins avec leur majuscule, accents, « Le » de « Le Havre », forme « SA HLM » retirée', () => {
    for (const [client, nom] of [['ROUEN NORMANDIE AMENAGEMENT', 'Rouen Normandie Aménagement'], ['LE HAVRE SEINE METROPOLE', 'Le Havre Seine Métropole'], ['SEINE-MARITIME ATTRACTIVITE', 'Seine-Maritime Attractivité'], ['SA HLM LOGEO SEINE', 'Logeo Seine']]) {
      const { v, texte } = publie(client, `Pouvoir adjudicateur : ${client}. Marché de gardiennage. Site : 76000 Rouen.`);
      expect(v.valeur, client).toBe(nom);
      expect(texte).not.toMatch(new RegExp(client.replace(/^SA HLM /, '')));
    }
    // Mot ni du dictionnaire ni lieu connu : la graphie est soumise à GSS.
    const { v } = publie('LOGEO SEINE', 'Pouvoir adjudicateur : LOGEO SEINE. Marché de gardiennage. Site : 76000 Rouen.');
    expect(String(v.aConfirmer || '')).toMatch(/« Logeo »/);
  });
  it('intitulés en capitales : lieux connus et gentilés dans leur graphie usuelle', () => {
    const dce = 'Marché de gardiennage. 76000 Rouen.';
    expect(casseDuDce('SURVEILLANCE DU PARKING DE LA PORTE OCEANE', dce, true)).toBe('Surveillance du parking de la Porte Océane');
    expect(casseDuDce("SECURITE DES PLAGES DE LA COTE D'ALBATRE", dce, true)).toBe("Sécurité des plages de la Côte d'Albâtre");
    expect(casseDuDce('GARDIENNAGE DU SITE DE ST ETIENNE DU ROUVRAY', dce, true)).toBe('Gardiennage du site de Saint-Étienne-du-Rouvray');
    expect(casseDuDce("OFFICE PUBLIC DE L'HABITAT DE L'AGGLOMERATION ROUENNAISE", dce, true)).toBe("Office public de l'habitat de l'agglomération rouennaise");
  });
});

describe('nom de l\'acheteur avec un tiret (T4G-1, T4G-8)', () => {
  it('complément de lieu après le tiret : jamais la forme courte ; sigle du DCE sinon', () => {
    const cpam = formesClient("Caisse primaire d'assurance maladie de Rouen-Elbeuf-Dieppe – Seine-Maritime", "La Caisse primaire d'assurance maladie de Rouen-Elbeuf-Dieppe – Seine-Maritime lance une consultation. La CPAM met à disposition… La CPAM se réserve… Les agences de la CPAM… 76000 Rouen");
    expect(cpam.court?.nom).toBe('CPAM');
    expect(formesClient('Caisse d’allocations familiales de la Seine-Maritime – Normandie', 'La Caisse d’allocations familiales de la Seine-Maritime – Normandie lance une consultation. La Caf… 76000 Rouen').court?.nom || '').not.toBe('Normandie');
    expect(formesClient('Chambre de commerce et d’industrie territoriale Rouen Métropole – Normandie', 'La Chambre de commerce et d’industrie territoriale Rouen Métropole – Normandie lance une consultation.').court?.nom || '').not.toBe('Normandie');
    // Nom d'usage après le tiret (témoin) : inchangé.
    expect(formesClient("Office public de l’habitat de la Métropole Rouen Normandie – Rouen Habitat", "L’Office public de l’habitat de la Métropole Rouen Normandie – Rouen Habitat lance une consultation. Rouen Habitat… 76000 Rouen").court?.nom).toBe('Rouen Habitat');
  });
  it('sigle en capitales après le tiret : gardé en capitales, avec son article', () => {
    const { v, texte } = publie('MINISTERE DES ARMEES – ESID DE RENNES', "MINISTERE DES ARMEES – ESID DE RENNES. L'ESID de Rennes lance la consultation. L'ESID de Rennes assure… 35000 Rennes.");
    expect(v.valeur).toBe('Ministère des armées – ESID de Rennes');
    expect(texte).toMatch(/à l'ESID de Rennes/);
    expect(texte).not.toMatch(/Esid/);
  });
});
