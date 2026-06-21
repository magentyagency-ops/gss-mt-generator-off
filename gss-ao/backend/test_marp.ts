import { MarpGenerator } from './src/generation/marp_generator';
import path from 'path';

const generator = new MarpGenerator(path.join(__dirname, 'response'));
const chapters = [
  {
    key: '1',
    title: 'PRESENTATION DE NOTRE STRUCTURE',
    sections: [
      {
        id: 'b_presentation',
        title: 'NOTRE CATALOGUE DE PRESTATION',
        text: 'Ceci est le texte de présentation. Il apparaît après la couverture de la section.',
        illustration: 'illu_encadrement.png'
      },
      {
        id: 'b_engagement_rse',
        title: 'NOTRE ENGAGEMENT ECOLOGIQUE',
        text: 'Ceci est le texte sur l\'écologie.',
        illustration: 'illu_ecologie.png'
      }
    ]
  },
  {
    key: '2',
    title: 'LES MOYENS TECHNIQUES',
    sections: [
      {
        id: 'b_moyens_materiels',
        title: 'COMMUNICATION',
        text: 'Les talkies walkies permettent aux agents de pouvoir communiquer entre eux en étant à des points différents du site.',
        illustration: 'illu_communication.png'
      }
    ]
  }
];

const cover = {
  client: 'TEST CLIENT',
  title: 'MEMOIRE TECHNIQUE TEST',
  ref: 'REF-2023-XYZ'
};

const result = generator.generatePdf(chapters, cover);
console.log('PDF Generated at:', result.filePath);
