import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * État vide soigné (même condition d'affichage que l'existant) : icône 40 px dans un rond
 * voile, titre 15/600 et texte 13 px passés tels quels, actions facultatives.
 * `pointilles` : cadre en pointillés (zones de dépôt).
 * Usage : <EtatVide icone={Inbox} titre="Aucune alerte reçue pour le moment…" />
 */
export function EtatVide({
  icone: Icone,
  titre,
  texte,
  pointilles = false,
  className,
  children,
}: {
  icone?: LucideIcon;
  titre?: React.ReactNode;
  texte?: React.ReactNode;
  pointilles?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex animate-monter flex-col items-center justify-center gap-2 rounded-xl px-6 py-10 text-center",
        pointilles ? "border-2 border-dashed border-[#B9C5D4] bg-gradient-to-b from-card to-[#F8FAFC]" : "",
        className,
      )}
    >
      {Icone ? (
        <span aria-hidden="true" className="mb-1 grid h-16 w-16 place-items-center rounded-full bg-secondary text-primary">
          <Icone className="h-8 w-8" strokeWidth={1.6} />
        </span>
      ) : null}
      {titre ? <div className="text-[15px] font-semibold text-foreground">{titre}</div> : null}
      {texte ? <div className="max-w-md text-[13px] leading-relaxed text-muted-foreground">{texte}</div> : null}
      {children}
    </div>
  );
}
