// T10C-4 : bloc 1 en mode dégradé (OpenAI indisponible, citedia) : le texte de secours (périmètre d'une phrase, attentes en
// citations sans « → notre réponse ») donne toujours un schéma de process accepté par anomaliesSchemaBloc1.
import { describe, it, expect } from 'vitest';
import { specSecoursBesoin, specSecoursPuces, specSecoursObligations, anomaliesSchemaBloc1 } from '../src/generation/reponse_libre_v2';

const TEXTE = "## Votre contexte et votre site\n\nVotre établissement lance le marché de sécurité privée.\n\n## Le périmètre de la prestation demandée\n\nLe marché comprend : rondes, vacations de nuit, travail isolé (PTI), télésurveillance et interventions sur alarme, prestations ponctuelles sur bon de commande, événementiel, reprise du personnel en place.\n\nHoraires imposés par le cahier des charges :\n- « Bureau du Parc Lices ouvert : Les Lundis de 09h00 à 00h00. »\n\n## Vos attentes et nos engagements\n\nNous nous engageons sur chacune des obligations chiffrées du cahier des charges :\n- « A réception d’une alarme au frontal du PC ou du superviseur MM 8000 et Désigo, le chef d’équipe SSIAP 2 du Titulaire doit appliquer les consignes définies par Citédia Métropole en ANNEXE 2 sur le site concerné sous un délai de 3 minutes maximum. »\n- « Les interventions seront effectuées sur le site en alerte par l’intervenant TLS dans un délai de 15 minutes maximum à compter de la réception de l'alarme au PC de télésurveillance. »\n- « Bouton anti-agression A réception d’une alarme au frontal du PC de télésurveillance, le chef d’équipe SSIAP 2 du Titulaire doit appliquer les consignes définies par Citédia Métropole sous un délai de 3 minutes maximum. »\n- « L’agent de Citédia Métropole basé 24h/24 et 7 jours/7 au Poste de Contrôle et Régulations (PCR) doit être informé systématiquement des interventions dans les 3 minutes qui suivent l’alerte. »";

describe('schéma de secours du bloc 1 (T10C-4)', () => {
  it('les secours habituels échouent sur ce texte', () => {
    expect(specSecoursBesoin(TEXTE)).toBeNull();
    expect(specSecoursPuces(TEXTE)).toBeNull();
  });
  it('une étape par obligation chiffrée citée, l’action et son délai en titre, puis le résultat', () => {
    const s = specSecoursObligations(TEXTE)!;
    expect(s).not.toBeNull();
    expect(anomaliesSchemaBloc1(s)).toEqual([]);
    expect(s.params.etapes.map((e: any) => e.titre.replace(/[\u00a0\u202f]/g, ' '))).toEqual(["Traitement de l'alarme en 3 min", 'Intervention sur site en 15 min', 'Information du client en 3 min', 'Votre résultat']);
    expect(s.params.etapes[1].texte).toBe('Les interventions seront effectuées sur le site en alerte par l’intervenant TLS');
  });
  it('sans obligations citées : les prestations du périmètre en chevrons', () => {
    const s = specSecoursObligations(TEXTE.replace(/## Vos attentes[\s\S]*$/, ''))!;
    expect(s.gabarit).toBe('chevrons');
    expect(anomaliesSchemaBloc1(s)).toEqual([]);
    expect(s.params.etapes.map((e: any) => e.titre)).toEqual(['Rondes', 'Vacations de nuit', 'Travail isolé (PTI)', 'Votre résultat']);
  });
});
