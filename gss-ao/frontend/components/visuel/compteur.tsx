import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Compteur qui défile de 0 jusqu'à sa valeur à l'affichage (CSS seul, aucun effet React).
 * La valeur réelle est rendue pour les lecteurs d'écran ; les chiffres animés sont décoratifs.
 * Mouvement réduit : la valeur finale s'affiche directement.
 * Usage : <Compteur valeur={dossiers.length} /> · <Compteur valeur={4} prefixe="J−" />
 */
export function Compteur({
  valeur,
  prefixe,
  suffixe,
  className,
}: {
  valeur: number;
  prefixe?: React.ReactNode;
  suffixe?: React.ReactNode;
  className?: string;
}) {
  const entier = Number.isFinite(valeur) && Number.isInteger(valeur);
  return (
    <span className={cn("tabular-nums", className)}>
      {prefixe}
      {entier ? (
        <>
          <span className="sr-only">{valeur}</span>
          <span
            aria-hidden="true"
            className="compteur-gss"
            style={{ ["--gss-cible" as string]: valeur } as React.CSSProperties}
          />
        </>
      ) : (
        valeur
      )}
      {suffixe}
    </span>
  );
}
