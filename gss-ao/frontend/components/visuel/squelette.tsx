import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Squelettes de chargement (blocs voile avec reflet qui glisse), décoratifs (aria-hidden).
 * Ils s'ajoutent au texte de chargement existant, qui reste présent.
 * Usage : <Squelette className="h-4 w-40" /> · <SqueletteLignes lignes={5} /> · <SqueletteCartes nombre={3} />
 */
export function Squelette({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div aria-hidden="true" className={cn("squelette h-4 w-full", className)} style={style} />;
}

/** Lignes de tableau fantômes (pastille + deux lignes de texte + statut). */
export function SqueletteLignes({ lignes = 5, className }: { lignes?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cn("divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-o1", className)}>
      {[...Array(lignes)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-[13px]" style={{ opacity: 1 - i * 0.12 }}>
          <div className="squelette h-[34px] w-[34px] shrink-0 rounded-[9px]" />
          <div className="flex-1 space-y-2">
            <div className="squelette h-3.5 w-2/5" />
            <div className="squelette h-3 w-3/5" />
          </div>
          <div className="squelette hidden h-6 w-24 rounded-full sm:block" />
        </div>
      ))}
    </div>
  );
}

/** Cartes fantômes (titre + trois lignes). */
export function SqueletteCartes({ nombre = 3, className }: { nombre?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cn("grid gap-[18px]", className)}>
      {[...Array(nombre)].map((_, i) => (
        <div key={i} className="space-y-3 rounded-xl border border-border bg-card px-5 py-[18px] shadow-o1">
          <div className="flex items-center gap-2.5">
            <div className="squelette h-[18px] w-[18px] rounded-md" />
            <div className="squelette h-4 w-48" />
          </div>
          <div className="squelette h-3 w-full" />
          <div className="squelette h-3 w-11/12" />
          <div className="squelette h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}
