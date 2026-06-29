import OpenAI from 'openai';
import { getSettings } from '../core/config';
const MEMOIRE_MODEL = process.env.MEMOIRE_MODEL || 'gpt-5.4-mini'; // Always use GPT-5.4-mini for strategy

export const AI_SECTIONS_B: Array<{ id: string; chapter: string; title: string }> = [
  // I — Présentation de notre structure
  { id: 'b_presentation', chapter: 'I', title: 'Présentation de la société GSS' },
  { id: 'b_implantation', chapter: 'I', title: 'Implantation régionale et agences de proximité' },
  { id: 'b_agrements', chapter: 'I', title: 'Autorisations, agréments CNAPS et conformité légale' },
  { id: 'b_engagement_rse', chapter: 'I', title: 'Engagement RSE et écologique' },
  // II — Les moyens humains
  { id: 'b_moyens_humains', chapter: 'II', title: 'Qualifications et profils des agents (CQP APS, SSIAP)' },
  { id: 'b_encadrement', chapter: 'II', title: 'Encadrement et organigramme opérationnel' },
  { id: 'b_reprise_personnel', chapter: 'II', title: 'Reprise du personnel en place (article L1224-1)' },
  { id: 'b_recrutement_formation', chapter: 'II', title: 'Recrutement, formation et montée en compétences' },
  { id: 'b_dispositif_absence', chapter: 'II', title: "Dispositif palliatif d'absence et remplacement" },
  { id: 'b_tenues_epi', chapter: 'II', title: 'Tenues et équipements de protection des agents' },
  // III — Les moyens opérationnels
  { id: 'b_moyens_materiels', chapter: 'III', title: 'Moyens matériels et équipements' },
  { id: 'b_rondes', chapter: 'III', title: 'Rondes, pointeaux et main courante électronique' },
  { id: 'b_controle_acces', chapter: 'III', title: 'Gestion des accès et contrôle des flux' },
  { id: 'b_telesurveillance', chapter: 'III', title: 'Télésurveillance et levée de doute (lot 3)' },
  { id: 'b_gestion_alarmes', chapter: 'III', title: "Gestion des alarmes et procédures d'intervention" },
  // IV — Les moyens organisationnels
  { id: 'b_organisation', chapter: 'IV', title: 'Organisation et démarrage de la prestation' },
  { id: 'b_planning', chapter: 'IV', title: 'Plannings et continuité de service' },
  { id: 'b_suivi_qualite', chapter: 'IV', title: 'Suivi qualité, contrôles inopinés et reporting' },
  { id: 'b_procedures', chapter: 'IV', title: 'Procédures opérationnelles et gestion des incidents' },
  { id: 'b_amelioration', chapter: 'IV', title: 'Amélioration continue et bilan de prestation' },
];

export interface StrategicSection {
  id: string;
  chapter: string;
  title: string;
  action: 'keep' | 'rewrite' | 'remove' | 'add';
  instructions?: string; // If rewrite or add, what should the AI focus on?
}

export class StrategicPlanner {
  private openai: OpenAI;

  constructor() {
    const settings = getSettings();
    this.openai = new OpenAI({ apiKey: settings.openaiApiKey });
  }

  /**
   * Generates a dynamic strategic plan based on the DCE analysis.
   */
  public async plan(analysisJson: string): Promise<StrategicSection[]> {
    const systemPrompt = `Tu es un Directeur du Développement Stratégique pour l'entreprise de sécurité privée GSS.
Ton objectif est de définir le plan de rédaction parfait pour un mémoire technique en réponse à un appel d'offres.
On te fournit l'analyse du DCE (Besoins du client, risques, enjeux).
On te fournit également la table des matières standard (master template) de notre mémoire technique.

TA MISSION :
1. Analyser le DCE et comprendre les enjeux critiques du client.
2. Décider pour CHAQUE section standard si on doit la 'keep' (garder telle quelle), la 'rewrite' (réécrire spécifiquement pour le client), ou la 'remove' (si non pertinente).
3. Ajouter ('add') de NOUVELLES sections si un enjeu majeur du client n'est pas couvert par le plan standard. (Ex: "Gestion du public VIP" ou "Sécurisation en milieu hospitalier").
4. Au moins 50% du document final doit être 'rewrite' ou 'add' pour prouver la personnalisation extrême.

FORMAT DE RÉPONSE ATTENDU (JSON strict) :
{
  "plan": [
    {
      "id": "identifiant_unique",
      "chapter": "I, II, III ou IV",
      "title": "Titre de la section",
      "action": "keep | rewrite | remove | add",
      "instructions": "Si action = rewrite ou add, donne une instruction claire à l'IA rédactrice sur ce qu'elle doit écrire (ex: 'Mettre l'accent sur la gestion des étudiants et les rondes de nuit sur le campus')."
    }
  ]
}
`;

    const userPrompt = `ANALYSE DU MARCHÉ (DCE) :
${analysisJson}

TABLE DES MATIÈRES STANDARD GSS :
${JSON.stringify(AI_SECTIONS_B, null, 2)}

Génère le plan stratégique JSON.`;

    const completion = await this.openai.chat.completions.create({
      model: MEMOIRE_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
    });

    const content = completion.choices[0].message.content || '{}';
    try {
      const data = JSON.parse(content);
      return data.plan || [];
    } catch (e) {
      console.error('[StrategicPlanner] Failed to parse JSON plan', e);
      return [];
    }
  }
}
