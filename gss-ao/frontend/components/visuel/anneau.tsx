import * as React from "react";
import { cn } from "@/lib/utils";
import { TON_PLEIN, type Ton } from "@/components/visuel/tons";

/**
 * Anneau de progression qui se remplit de 0 à sa valeur à l'affichage (CSS seul),
 * puis suit les changements de valeur en douceur. Valeur en pourcentage (0 à 100).
 * Le contenu central (ex. « 5/6 ») est passé en enfant.
 * Usage : <Anneau valeur={(5 / 6) * 100} ton="succes">5/6</Anneau>
 */
export function Anneau({
  valeur,
  ton = "succes",
  taille = 62,
  epaisseur = 7,
  className,
  children,
}: {
  valeur: number;
  ton?: Ton;
  taille?: number;
  epaisseur?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  const p = Math.min(100, Math.max(0, Number.isFinite(valeur) ? valeur : 0));
  return (
    <div
      className={cn("anneau-gss grid shrink-0 place-items-center", className)}
      style={
        {
          width: taille,
          height: taille,
          ["--gss-p" as string]: p,
          ["--anneau-couleur" as string]: TON_PLEIN[ton],
        } as React.CSSProperties
      }
    >
      <div
        className="grid place-items-center rounded-full bg-card font-display text-[15px] font-bold tabular-nums text-foreground"
        style={{ width: taille - epaisseur * 2, height: taille - epaisseur * 2 }}
      >
        {children}
      </div>
    </div>
  );
}
