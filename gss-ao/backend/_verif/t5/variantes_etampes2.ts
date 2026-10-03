/** Variantes du rejeu etampes2 552 : le dispositif de la mise en situation tel qu'il était écrit avant T5CP-3 (« ; 0 poste
 *  d'inspection filtrage (PIF) ; 0 détecteur de métaux »). */
export const VARIANTES: Array<(t: string) => string> = [
  (t) => t.replace(/(\(dispositif de GSS\) : \d+ agents? en service \([^\n]*?\))(\. Reprends)/g, "$1 ; 0 poste d'inspection filtrage (PIF) ; 0 détecteur de métaux$2"),
];
