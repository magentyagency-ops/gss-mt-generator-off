import { MarpGenerator } from './src/generation/marp_generator';
import path from 'path';

const generator = new MarpGenerator();

// Simulate AI generating a custom section
const chapters = [
  {
    key: 'I',
    title: 'PRESENTATION',
    sections: [
      {
        title: 'NOTRE CATALOGUE DE PRESTATIONS',
        text: 'Ceci est une offre TOTALEMENT sur-mesure générée par l\'IA pour cet appel d\'offre spécifique.\n\nNous proposons une solution globale de sécurité.\n\n- Gardiennage\n- Télésurveillance\n- Sécurité incendie'
      }
    ]
  }
];

const templatePath = path.resolve(__dirname, 'src/generation/marp/gss_memoire_master.md');

console.log("Generating with template:", templatePath);
const result = generator.generatePdfWithTemplate(chapters, templatePath, { client: 'Mairie de Test' });

console.log("Success! Output:", result.filePath);
