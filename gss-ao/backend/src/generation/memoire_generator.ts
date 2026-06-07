import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import OpenAI from 'openai';
import { getSettings } from '../core/config';

export class MemoireGenerator {
  private openai: OpenAI;
  private responseDir: string;
  private templateDir: string;

  constructor() {
    const settings = getSettings();
    this.openai = new OpenAI({ apiKey: settings.openaiApiKey });
    const baseDir = path.resolve(__dirname, '../../../../');
    this.responseDir = path.resolve(baseDir, 'response');
    this.templateDir = path.resolve(baseDir, 'Template');

    if (!fs.existsSync(this.responseDir)) {
      fs.mkdirSync(this.responseDir, { recursive: true });
    }
  }

  /**
   * Find if a Memoire Technique template exists in the given DCE directory.
   */
  private findDceTemplate(dceDir: string): string | null {
    if (!fs.existsSync(dceDir)) return null;
    const files = fs.readdirSync(dceDir);
    const memoireFile = files.find(f => 
      f.toLowerCase().includes('memoire') && 
      f.toLowerCase().includes('technique') && 
      f.toLowerCase().endsWith('.docx')
    );
    return memoireFile ? path.join(dceDir, memoireFile) : null;
  }

  private getDceContext(dossierId: string): string {
    const baseDir = path.resolve(__dirname, '../../../../');
    const rcPath = path.join(baseDir, `gss-ao/data/output/rc_${dossierId}.json`);
    const cctpPath = path.join(baseDir, `gss-ao/data/output/cctp_${dossierId}.json`);
    
    if (!fs.existsSync(cctpPath)) {
      throw new Error("Le CCTP est requis pour générer le mémoire (analyse DCE manquante).");
    }

    let context = '';
    if (fs.existsSync(rcPath)) {
      context += `\n\n--- REGLEMENT DE CONSULTATION (RC) ---\n${fs.readFileSync(rcPath, 'utf8')}`;
    }
    context += `\n\n--- CAHIER DES CLAUSES TECHNIQUES PARTICULIERES (CCTP) ---\n${fs.readFileSync(cctpPath, 'utf8')}`;
    return context;
  }

  /**
   * Main generation orchestration method.
   */
  public async generate(dossierId: string): Promise<{ filePath: string, generatedData: Record<string, string> }> {
    const settings = getSettings();
    const dceDir = settings.corpusDceDir;
    
    // 1. Detect Template
    let templatePath = this.findDceTemplate(dceDir);
    let isGenericTemplate = false;

    if (!templatePath) {
      // Fallback to generic template
      templatePath = path.join(this.templateDir, 'Mémoire technique', 'AO RNE.docx');
      isGenericTemplate = true;
      if (!fs.existsSync(templatePath)) {
        throw new Error(`Aucun template trouvé ni dans le DCE ni dans ${templatePath}`);
      }
    }

    // 2. Load the DOCX template
    const content = fs.readFileSync(templatePath, 'binary');
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    // Extract text from the docx directly using docxtemplater's text output
    const textContent = doc.getFullText();

    // 3. Prepare the AI Prompt
    const dceContext = this.getDceContext(dossierId);
    let prompt = `Tu es un expert en réponse aux appels d'offres pour GSS (Global Security Service).\n`;
    prompt += `Voici le contexte extrait du DCE (RC et CCTP) :\n${dceContext}\n\n`;
    prompt += `Et voici le texte brut de notre modèle de Mémoire Technique GSS :\n---\n${textContent}\n---\n\n`;
    prompt += `Ton objectif est de personnaliser le modèle générique pour qu'il réponde spécifiquement à cet appel d'offres.\n`;
    prompt += `Identifie les passages qui nécessitent d'être modifiés, adaptés ou personnalisés.\n`;
    prompt += `INSTRUCTIONS SPÉCIALES POUR LES FORMULAIRES ET TABLEAUX :\n`;
    prompt += `- Si tu trouves une case à cocher textuelle comme "☐" ou "[ ]" à côté d'une option qui correspond au DCE, propose de remplacer "☐ Nom Option" par "☑ Nom Option" ou "[X] Nom Option".\n`;
    prompt += `- Si tu repères des mots comme "[À remplir]" ou du texte vide à l'intérieur d'une structure qui ressemble à une cellule de tableau, propose un texte court et précis pour le remplacer.\n`;
    prompt += `IMPORTANT: Le champ "recherche" doit contenir un ou deux mots clés EXACTS présents dans le texte brut (ex: "☐ Télésécurité", "Date de début"). Pas de phrases longues car elles pourraient être coupées techniquement.\n`;
    prompt += `Fournis ta réponse sous forme de tableau JSON strict avec le format suivant :\n`;
    prompt += `{"replacements": [ {"recherche": "texte à remplacer", "remplacement": "nouveau texte"} ] }\n\n`;

    // 4. Call GPT
    console.log(`[MemoireGenerator] Calling OpenAI GPT-4o for Smart Replace...`);
    const completion = await this.openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: prompt }],
      temperature: 0.2,
    });

    const aiResponse = completion.choices[0].message.content || '{}';
    let replacements: Array<{recherche: string, remplacement: string}> = [];
    try {
      const data = JSON.parse(aiResponse);
      replacements = data.replacements || [];
    } catch (e) {
      console.error(`[MemoireGenerator] Failed to parse GPT response as JSON:`, aiResponse);
    }

    console.log(`[MemoireGenerator] GPT suggested ${replacements.length} replacements.`);

    // 5. In-Place XML Replacement (Best-Effort)
    let xml = zip.file('word/document.xml')?.asText() || '';
    let modificationsApplied = 0;

    for (const r of replacements) {
      if (r.recherche && xml.includes(r.recherche)) {
        // Safe string replacement inside XML
        xml = xml.split(r.recherche).join(r.remplacement);
        modificationsApplied++;
      }
    }

    console.log(`[MemoireGenerator] Successfully applied ${modificationsApplied} / ${replacements.length} replacements.`);
    
    // Save updated XML back to zip
    zip.file('word/document.xml', xml);

    const buf = zip.generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });

    const outputFileName = `Memoire_Technique_Personnalise_${dossierId}_${Date.now()}.docx`;
    const outputPath = path.join(this.responseDir, outputFileName);
    fs.writeFileSync(outputPath, buf);

    console.log(`[MemoireGenerator] Successfully generated ${outputPath}`);
    
    // Return detailed generated data for the API response so the user can see what was done
    return { filePath: outputPath, generatedData: {
      total_suggestions: String(replacements.length),
      modifications_reussies: String(modificationsApplied),
      details: JSON.stringify(replacements)
    } };
  }
}
