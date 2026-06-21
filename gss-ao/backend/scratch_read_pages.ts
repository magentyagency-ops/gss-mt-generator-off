import { AI_SECTIONS_B } from './src/generation/memoire_generator';
import { MarpGenerator } from './src/generation/marp_generator';
import path from 'path';

// We can run buildMarkdown or just count the sections/slides
const generator = new MarpGenerator(path.join(__dirname, 'response'));

// Let's create dummy sections matching AI_SECTIONS_B
const chapters = [
  {
    key: 'I',
    title: 'Présentation de notre structure',
    sections: AI_SECTIONS_B.filter(s => s.chapter === 'I').map(s => ({
      id: s.id,
      title: s.title,
      text: 'Lorem ipsum. ' + 'word '.repeat(100), // simulate typical length
    }))
  },
  {
    key: 'II',
    title: 'Les moyens humains',
    sections: AI_SECTIONS_B.filter(s => s.chapter === 'II').map(s => ({
      id: s.id,
      title: s.title,
      text: 'Lorem ipsum. ' + 'word '.repeat(100),
    }))
  }
];

const markdown = (generator as any).buildMarkdown(chapters, { client: 'NEOMA' });
const slides = markdown.split('\n---');
console.log('Total slides:', slides.length);
slides.forEach((slide: string, idx: number) => {
  if (slide.includes('ENCADREMENT ET ORGANIGRAMME')) {
    console.log(`Slide ${idx + 1} matches:`, slide.substring(0, 150));
  }
});
