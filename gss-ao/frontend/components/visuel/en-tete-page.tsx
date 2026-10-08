import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * En-tête de page clair (pages hors dossier) : fil d'Ariane facultatif, titre en
 * IBM Plex Sans Condensed 28 px, sous-titre, actions à droite. Rend un <header>.
 * Les textes sont passés tels quels (aucun libellé imposé).
 * Usage : <EnTetePage titre="Dossiers d'appels d'offres" sousTitre={…} actions={<Button>…</Button>} />
 */
export function EnTetePage({
  titre,
  sousTitre,
  fil,
  actions,
  className,
  style,
  children,
}: {
  titre: React.ReactNode;
  sousTitre?: React.ReactNode;
  fil?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-end justify-between gap-4 px-4 pb-2 pt-6 md:px-9 md:pt-[30px]",
        className,
      )}
      style={style}
    >
      <div className="min-w-0">
        {fil ? <div className="mb-1 text-[12.5px] text-subtle-foreground">{fil}</div> : null}
        <h1 className="font-display text-[26px] font-bold leading-[1.1] tracking-[-0.005em] text-foreground md:text-[28px]">
          {titre}
        </h1>
        {sousTitre ? <div className="mt-1 text-sm text-muted-foreground">{sousTitre}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
      {children}
    </header>
  );
}
