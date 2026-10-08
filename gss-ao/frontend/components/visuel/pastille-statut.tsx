import * as React from "react";
import { cn } from "@/lib/utils";
import { TON_PASTILLE, type Ton } from "@/components/visuel/tons";

/**
 * Pastille de statut (rayon plein, point coloré, fond doux). Le texte est passé en enfant,
 * mot pour mot. `pulse` : point orange qui pulse (traitement en cours).
 * Usage : <PastilleStatut ton="attente">{libelleExistant}</PastilleStatut>
 */
export function PastilleStatut({
  ton = "neutre",
  point = true,
  pulse = false,
  className,
  children,
}: {
  ton?: Ton;
  point?: boolean;
  pulse?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[7px] whitespace-nowrap rounded-full px-[11px] py-1 text-[12.5px] font-semibold leading-tight",
        TON_PASTILLE[ton],
        className,
      )}
    >
      {pulse ? (
        <span aria-hidden="true" className="pastille-live" />
      ) : point ? (
        <span aria-hidden="true" className="h-[7px] w-[7px] shrink-0 rounded-full bg-current" />
      ) : null}
      {children}
    </span>
  );
}

/** Point orange qui pulse, seul (ex. devant « Analyse du DCE en cours »). */
export function PointActif({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("pastille-live", className)} />;
}
