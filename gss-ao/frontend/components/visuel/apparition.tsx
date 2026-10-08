import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Apparition en douceur (opacité + montée de 10 px), CSS seul, coupée en mouvement réduit.
 * - par défaut : l'élément lui-même apparaît, après `delai` ms ;
 * - `echelonne` : ses enfants directs apparaissent les uns après les autres (pas de 60 ms, plafond 8).
 * N'enveloppe que de la présentation : aucun remontage, aucune action retardée.
 * Pour éviter un élément en plus, on peut aussi poser directement la classe « apparait »
 * (enfants échelonnés) ou « animate-monter » (élément seul) sur un conteneur existant.
 * Usage : <Apparition echelonne className="grid gap-4">…</Apparition>
 */
export function Apparition({
  as: Balise = "div",
  delai = 0,
  echelonne = false,
  className,
  style,
  children,
}: {
  as?: React.ElementType;
  delai?: number;
  echelonne?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  return (
    <Balise
      className={cn(echelonne ? "apparait" : "animate-monter", className)}
      style={!echelonne && delai ? { animationDelay: `${delai}ms`, ...style } : style}
    >
      {children}
    </Balise>
  );
}
