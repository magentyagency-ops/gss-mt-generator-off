import OpenAI from 'openai';
import { getSettings } from '../core/config';

/**
 * Service de génération et compilation des schémas D2 pour GSS Sécurité.
 * Conforme aux règles strictes de .agents/AGENTS.md :
 *  - Direction : direction: down
 *  - Topologie : Arborescente (Tree Layout)
 *  - Polices Géantes : Noeuds font-size: 24 à 40, Flèches font-size: 18 à 28
 *  - Syntaxe : stroke-width ENTIER (1, 2, 3 - JAMAIS de float)
 *  - Saut de ligne : \n systématique pour les textes longs
 */

const D2_SYSTEM_PROMPT = `Tu es un expert en conception de diagrammes D2 et schémas d'architecture pour le mémoire technique de GSS Sécurité.
Tu dois générer du code D2 valide, lisible et parfaitement mis en page.

Règles de rendu et de mise en page STRICTES (CONFORMITÉ AGENTS.MD) :
1. imposer "direction: down" au niveau global.
2. Topologie arborescente (Tree Layout) : Racine -> branches parallèles. Évite les longues chaînes horizontales.
3. Polices géantes :
   - Noeuds / Boîtes : font-size: 28 (gras) ou plus (jusqu'à 40).
   - Liens / Flèches : font-size: 20 (gras).
4. Syntaxe D2 stricte : stroke-width DOIT être un ENTIER (1, 2, 3). JAMAIS de nombre à virgule (ex: 1.5 est INTERDIT et fait planter le compilateur).
5. Répartition du texte : utilise systématiquement \\n pour couper les longs textes dans les nœuds.
6. Ne renvoie AUCUN texte d'introduction ni d'explication. Renvoie UNIQUEMENT le bloc de code D2 valide (ou contenu dans des balises \`\`\`d2 ... \`\`\`).

Exemple de structure D2 :
\`\`\`d2
direction: down

racine: "ARCHITECTURE SÉCURITÉ GSS\\nClient: {CLIENT}" {
  style.fill: "#1e293b"
  style.font-color: "#ffffff"
  style.font-size: 32
  style.bold: true
}

niveau1: "DISPOSITIF DE PROTECTION" {
  direction: down
  col1: "PRÉVENTION & CONTRÔLE\\n- Agent de sécurité\\n- Contrôle d'accès" {
    style.fill: "#0f172a"
    style.font-color: "#f8fafc"
    style.font-size: 24
  }
  col2: "INTERVENTION & DÉTECTION\\n- Télésurveillance 24/7\\n- Ronde mobile" {
    style.fill: "#0f172a"
    style.font-color: "#f8fafc"
    style.font-size: 24
  }
}

racine -> niveau1: "Supervision globale" {
  style.font-size: 20
  style.stroke-width: 2
}
\`\`\`
`;

export class D2Service {
  /**
   * Compile du code D2 en SVG via l'API Kroki.
   */
  public static async compileD2ToSvg(d2Code: string): Promise<Buffer> {
    const cleanD2 = d2Code
      .replace(/^```d2/g, '')
      .replace(/^```/g, '')
      .replace(/```$/g, '')
      .trim();

    const response = await fetch('https://kroki.io/d2/svg', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: cleanD2,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Erreur compilation Kroki D2 SVG (${response.status}): ${errText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Compile du code D2 en PNG via l'API Kroki.
   */
  public static async compileD2ToPng(d2Code: string): Promise<Buffer> {
    const cleanD2 = d2Code
      .replace(/^```d2/g, '')
      .replace(/^```/g, '')
      .replace(/```$/g, '')
      .trim();

    const response = await fetch('https://kroki.io/d2/png', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: cleanD2,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Erreur compilation Kroki D2 PNG (${response.status}): ${errText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Génère un schéma D2 personnalisé via OpenAI pour une section de mémoire.
   */
  public static async generateD2Code(
    sectionTitle: string,
    sectionText: string,
    clientName: string = 'Client',
    userApiKey?: string,
  ): Promise<string | null> {
    try {
      const apiKey = userApiKey || process.env.OPENAI_API_KEY || getSettings().openaiApiKey;
      if (!apiKey) {
        console.warn('[D2Service] Aucune clé OpenAI configurée.');
        return null;
      }

      const openai = new OpenAI({ apiKey });
      const prompt = `Génère un schéma D2 hautement pertinent et personnalisé pour la section du mémoire technique suivante :
Client / Bénéficiaire : ${clientName}
Titre de la section : ${sectionTitle}
Contenu de la section :
${sectionText.slice(0, 1500)}

Le schéma doit illustrer le processus, la structure d'équipe, l'architecture technique ou le plan de prévention GSS adapté à cette section.
Respecte scrupuleusement les consignes de format D2 (direction: down, polices géantes, stroke-width entier, \\n pour les textes).`;

      const response = await openai.chat.completions.create({
        model: process.env.MEMOIRE_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: D2_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
      });

      const raw = response.choices[0]?.message?.content || '';
      const code = raw
        .replace(/^```d2/g, '')
        .replace(/^```/g, '')
        .replace(/```$/g, '')
        .trim();

      return code || null;
    } catch (e: any) {
      console.error('[D2Service] Échec de la génération D2 par IA :', e.message || e);
      return null;
    }
  }

  /**
   * Génère le code D2 et les images (SVG et PNG) pour une section.
   */
  public static async generateDiagramForSection(
    sectionTitle: string,
    sectionText: string,
    clientName: string = 'Client',
    userApiKey?: string,
  ): Promise<{ d2Code: string; svgBuffer: Buffer; pngBuffer: Buffer } | null> {
    const d2Code = await this.generateD2Code(sectionTitle, sectionText, clientName, userApiKey);
    if (!d2Code) return null;

    try {
      const svgBuffer = await this.compileD2ToSvg(d2Code);
      const pngBuffer = await this.compileD2ToPng(d2Code);
      return { d2Code, svgBuffer, pngBuffer };
    } catch (e: any) {
      console.error('[D2Service] Échec de la compilation Kroki pour la section', sectionTitle, ':', e.message || e);
      return null;
    }
  }
}
