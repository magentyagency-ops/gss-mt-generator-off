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
Tu dois générer du code D2 valide, lisible et avec un design "SaaS / Tech" ultra-moderne (Glassmorphism, Dark Mode, formes arrondies, contrastes forts).

Règles de rendu et de syntaxe STRICTES (CONFORMITÉ D2) :
1. GLOBAL : Déclare "direction: right" ou "direction: down" au début.
2. GUILLEMETS : Le libellé d'un nœud DOIT IMPÉRATIVEMENT être entouré de doubles guillemets.
3. SYSTÈME DE CLASSES (Design System) : N'utilise PLUS de blocs "style" individuels pour chaque nœud. Déclare TOUJOURS le bloc "classes: { ... }" fourni dans l'exemple ci-dessous en haut de ton code, et assigne les classes aux nœuds (ex: "class: root").
4. TAILLES DE POLICES : Gérées par les classes (32 pour root, 24 pour item). Ne les redéfinis pas localement.
5. FORMES MODERNES : Utilise l'attribut "shape" pour varier visuellement : "shape: cylinder" (données), "shape: cloud" (réseau), "shape: step" (processus), "shape: package" (logiciel).
6. RETOURS À LA LIGNE : Utilise systématiquement \\n à l'intérieur des guillemets pour couper les longs textes.
7. LISIBILITÉ DES FLÈCHES : Ne mets RIEN sur les flèches (laisser le texte vide) ou 1 mot max. 
8. Ne renvoie AUCUN texte d'introduction ni d'explication. Renvoie UNIQUEMENT le bloc de code D2 valide.

Exemple de structure D2 attendue (Design Ultra-Moderne avec Classes) :
\`\`\`d2
direction: right

classes: {
  root: {
    style: {
      fill: "#1e293b"
      font-color: "#ffffff"
      font-size: 32
      bold: true
      shadow: true
      border-radius: 16
      stroke: "#dc2626"
      stroke-width: 4
    }
  }
  category: {
    style: {
      fill: "#334155"
      stroke-dash: 5
      shadow: true
      border-radius: 16
    }
  }
  item: {
    style: {
      fill: "#0f172a"
      font-color: "#f8fafc"
      font-size: 24
      border-radius: 12
      shadow: true
      stroke: "#475569"
      stroke-width: 2
    }
  }
}

racine: "ARCHITECTURE SÉCURITÉ\\nClient: {CLIENT}" { class: root }

niveau1: "DISPOSITIF DE PROTECTION" {
  class: category
  
  col1: "PRÉVENTION & CONTRÔLE\\n- Agent de sécurité\\n- Contrôle d'accès" { 
    class: item 
    shape: step
  }
  
  col2: "INTERVENTION & DÉTECTION\\n- Télésurveillance 24/7\\n- Ronde mobile" { 
    class: item 
    shape: package
  }
}

racine -> niveau1 {
  style: {
    stroke-width: 3
    stroke: "#dc2626"
  }
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
