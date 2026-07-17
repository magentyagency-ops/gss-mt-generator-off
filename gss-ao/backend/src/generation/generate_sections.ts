import OpenAI from 'openai';
import { getSettings } from '../core/config';
import { StrategicSection } from './strategic_planner';

const MEMOIRE_MODEL = process.env.MEMOIRE_MODEL || 'luna';

export class SectionGenerator {
  private openai: OpenAI;

  constructor() {
    const settings = getSettings();
    this.openai = new OpenAI({ apiKey: settings.openaiApiKey });
  }

  public async generateSection(
    section: StrategicSection,
    analysisJson: string,
    gssContext: string
  ): Promise<string> {
    // If we just keep it, we could return a placeholder or standard text. 
    // Since the system assembles it by cloning standard spreads, if it's 'keep', 
    // we actually don't want to replace the whole text with AI slop.
    // However, assembleFromSections currently replaces the text of the spread.
    // So if it's 'keep', we might need to fetch the standard text, OR we just let the AI rewrite it lightly.
    // Actually, for maximum quality, we should instruct the AI.

    const systemPrompt = `Tu es un expert en sécurité privée chez GSS. Tu rédiges une section d'un mémoire technique pour répondre à un appel d'offres.
Ton but est de générer le contenu de la section "${section.title}" (Chapitre ${section.chapter}).
L'instruction stratégique pour cette section est : ${section.action.toUpperCase()}
Détail de l'instruction : ${section.instructions || 'Aucune instruction spécifique. Sois professionnel.'}

RÈGLES DE RÉDACTION :
- Utilise un ton très professionnel, technique et commercial.
- Mets en évidence les atouts de GSS.
- Personnalise le contenu avec le nom du client et ses besoins spécifiques si l'action est REWRITE ou ADD.
- Si l'action est KEEP, rédige une présentation standard et robuste de ce sujet chez GSS, en t'appuyant sur les textes de référence.
- Génère UNIQUEMENT du texte. Pas de markdown (sauf si nécessaire, mais évite les listes à puces complexes car le formateur Word ne les gère pas toujours bien). Utilise des sauts de ligne pour aérer.
- Mets impérativement en forme les titres et sous-titres en gras ET souligné (par exemple : **<u>Titre de ma partie</u>**).
- Ajoute TOUJOURS un saut de ligne (ligne vide) entre chaque titre/sous-titre et le paragraphe qui suit.
- Le texte doit être assez long pour remplir une page A4 (environ 300 à 400 mots minimum) car il sera inséré dans une "slide" du mémoire. Structure-le en plusieurs paragraphes.`;

    const userPrompt = `ANALYSE DU MARCHÉ (DCE) :
${analysisJson}

TEXTES DE RÉFÉRENCE GSS :
${gssContext}

Rédige le contenu complet de la section "${section.title}".`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: MEMOIRE_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.5,
      });

      return completion.choices[0].message.content || '';
    } catch (e) {
      console.error(`[SectionGenerator] Error generating section ${section.title}`, e);
      return '';
    }
  }
}
