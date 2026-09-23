// ════════════════════════════════════════════════════════════════════════════════════════
// Analyse d'une alerte de veille (e-mail d'opportunité) — module autonome
// ════════════════════════════════════════════════════════════════════════════════════════
// Extrait d'un e-mail d'alerte les informations d'un appel d'offres.
//
// POURQUOI UN MODULE À PART : l'endpoint /ingest-email porte un prompt jumeau, mais il fait
// DEUX choses — analyser ET créer un dossier. La veille a besoin de la première seule, pour
// afficher un aperçu avant que l'utilisateur décide de créer quoi que ce soit.
// Le refactoriser pour partager le prompt aurait modifié du code existant : par prudence, on
// s'en abstient. Si les deux prompts devaient diverger un jour, c'est ici qu'il faut regarder.
//
// Ne lève jamais : en cas d'échec, renvoie null et l'appelant laisse l'alerte non analysée.

import OpenAI from 'openai';
import { getSettings } from '../core/config';

const VEILLE_MODEL = process.env.EXTRACTION_MODEL || 'gpt-5.6-luna';
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS) || 300_000;

/** Opportunité telle qu'attendue par l'écran de veille. */
export interface OpportuniteVeille {
  acheteur: string;
  objet: string;
  dateLimite: string;
  departement: string;
  emailSummary: string;
  suggestionSections: string[];
  lienUnique: string;
}

export async function analyserAlerteVeille(
  sujet: string,
  corps: string,
): Promise<OpportuniteVeille | null> {
  const texte = `${sujet ? `Objet : ${sujet}\n\n` : ''}${corps}`.trim();
  if (!texte) return null;

  const key = getSettings().openaiApiKey;
  if (!key) {
    console.warn('[veille_parser] OPENAI_API_KEY absente → aucune analyse.');
    return null;
  }

  const prompt = `Tu es un assistant de traitement d'appels d'offres pour l'entreprise de sécurité GSS.
Tu as reçu un e-mail d'alerte décrivant un nouvel appel d'offres.
Analyse cet e-mail pour extraire les informations suivantes et réponds exclusivement sous la forme d'un objet JSON valide.

L'objet JSON doit avoir les champs suivants exacts :
{
  "acheteur": "Nom de l'acheteur (ex: Ville de Rouen, Conseil Départemental) ou 'Non spécifié'",
  "objet": "Objet du marché (ex: Prestations de sécurité et de gardiennage) ou 'Non spécifié'",
  "dateLimite": "Date limite de dépôt au format ISO AAAA-MM-JJ, ou 'Non spécifié'",
  "departement": "Département français en 2 ou 3 chiffres (ex: 76, 75, 974) ou 'Non spécifié'",
  "description": "Résumé de l'appel d'offres en 3 ou 4 phrases, détaillant la nature des prestations et le contexte",
  "suggestionSections": ["3 à 5 sections clés que GSS devra aborder dans son mémoire technique"],
  "lienUnique": "URL de l'appel d'offres si présente dans l'e-mail, sinon ''"
}

Texte de l'e-mail d'alerte :
"""
${texte}
"""`;

  try {
    const client = new OpenAI({ apiKey: key, timeout: OPENAI_TIMEOUT_MS });
    const completion = await client.chat.completions.create({
      model: VEILLE_MODEL,
      messages: [{ role: 'system', content: prompt }],
      temperature: 1,
      response_format: { type: 'json_object' },
    });

    const data = JSON.parse(completion.choices[0].message.content || '{}');
    const texteOuVide = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

    return {
      acheteur: texteOuVide(data.acheteur) || 'Non spécifié',
      objet: texteOuVide(data.objet) || 'Non spécifié',
      dateLimite: texteOuVide(data.dateLimite) || 'Non spécifié',
      departement: texteOuVide(data.departement) || 'Non spécifié',
      // Le prompt renvoie `description` ; l'écran de veille l'affiche sous le nom emailSummary.
      emailSummary: texteOuVide(data.description),
      suggestionSections: Array.isArray(data.suggestionSections)
        ? data.suggestionSections.map(texteOuVide).filter(Boolean)
        : [],
      lienUnique: texteOuVide(data.lienUnique),
    };
  } catch (e) {
    console.warn(`[veille_parser] échec analyse (${(e as Error)?.message}) → alerte non analysée.`);
    return null;
  }
}
