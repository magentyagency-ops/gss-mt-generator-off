import { accorderEffectifUn } from '../../src/generation/memoire_type';
const cas = [
  "Nous mettons en place une équipe de 1 agents titulaires, qui assurent les missions de façon régulière.",
  "une équipe suppléante de 1 agents formés au site",
  "une équipe de 21 agents titulaires, qui assurent",
  "soit 0,1 agents",
  "1 agents",
];
for (const c of cas) console.log(JSON.stringify(accorderEffectifUn(c)));
