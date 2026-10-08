import * as React from "react";
import { cn } from "@/lib/utils";
import { TON_PLEIN, type Ton } from "@/components/visuel/tons";

/**
 * Jauge horizontale qui se remplit de 0 à sa valeur à l'affichage, puis suit les
 * changements de valeur en douceur (aucun remontage). Valeur en pourcentage (0 à 100).
 * Décorative par défaut (aria-hidden) ; passer `libelle` pour l'exposer comme barre de progression.
 * Usage : <Jauge valeur={86} ton="succes" /> · <Jauge valeur={pct} actif libelle="Génération" />
 */
export function Jauge({
  valeur,
  ton = "marine",
  epaisseur = 6,
  actif = false,
  libelle,
  className,
  couleur,
}: {
  valeur: number;
  ton?: Ton;
  /** Hauteur en pixels (5 à 8 conseillé). */
  epaisseur?: number;
  /** Reflet animé tant qu'un traitement est en cours. */
  actif?: boolean;
  libelle?: string;
  className?: string;
  /** Couleur CSS libre (prioritaire sur `ton`), ex. un dégradé. */
  couleur?: string;
}) {
  const p = Math.min(100, Math.max(0, Number.isFinite(valeur) ? valeur : 0));
  const accessible = libelle
    ? { role: "progressbar", "aria-label": libelle, "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": Math.round(p) }
    : { "aria-hidden": true };
  return (
    <div
      {...accessible}
      className={cn("relative w-full overflow-hidden rounded-full bg-secondary", className)}
      style={{ height: epaisseur }}
    >
      <div
        className={cn(
          "h-full origin-left animate-remplir rounded-full transition-[width,background-color] duration-[400ms] ease-doux",
          actif && "reflet-actif",
        )}
        style={{ width: `${p}%`, background: couleur ?? TON_PLEIN[ton] }}
      />
    </div>
  );
}
