import { questionExacte } from '../../src/generation/memoire_generator';
for (const q of ["Information à fournir : Chargé d'affaires dédié", 'Information à fournir : « Référent qualité »', 'Valeur à fournir : Chef de poste', 'Information à fournir : Nombre de véhicules', 'Information à fournir pour compléter le mémoire : Taux de reprise']) console.log(q, '→', questionExacte(q));
