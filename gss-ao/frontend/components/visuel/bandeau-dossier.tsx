import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Bandeau marine d'un dossier (Synthèse, Conformité, Mémoire, Recherches, Sélection slides,
 * Export) : méta en Plex Mono, titre 28 px blanc, ligne secondaire (acheteur), repères en
 * pastilles translucides, actions à droite. Rend un <header class="bandeau-dossier">.
 * Les boutons <Button> placés dedans deviennent automatiquement clairs (CSS global).
 * Usage : <BandeauDossier meta={…} titre={…} sousTitre={…} reperes={<ChipBandeau …/>} actions={…} />
 */
export function BandeauDossier({
  meta,
  titre,
  sousTitre,
  reperes,
  actions,
  className,
  children,
}: {
  meta?: React.ReactNode;
  titre?: React.ReactNode;
  sousTitre?: React.ReactNode;
  reperes?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className={cn("bandeau-dossier px-4 pb-[22px] pt-6 text-white md:px-9 md:pt-[26px]", className)}>
      {meta ? (
        <div className="flex flex-wrap items-center gap-2.5 font-mono text-[12.5px] font-medium text-[#AFC0D6]">
          {meta}
        </div>
      ) : null}
      {titre ? (
        <div className="mt-2.5 font-display text-[24px] font-bold leading-[1.15] text-white md:text-[28px]">
          {titre}
        </div>
      ) : null}
      {sousTitre ? (
        <div className="mt-1 flex items-center gap-2 text-[14.5px] text-[#C8D4E4] [&_svg]:h-4 [&_svg]:w-4">
          {sousTitre}
        </div>
      ) : null}
      {reperes || actions ? (
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3.5">
          <div className="flex flex-wrap gap-2.5">{reperes}</div>
          {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </header>
  );
}

/**
 * Repère translucide du bandeau : petit libellé + valeur en blanc. `urgent` : bord orange.
 * Usage : <ChipBandeau libelle="Remise des offres" valeur="17 octobre · J−9" urgent />
 */
export function ChipBandeau({
  libelle,
  valeur,
  urgent = false,
  className,
}: {
  libelle: React.ReactNode;
  valeur: React.ReactNode;
  urgent?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("chip-bandeau", urgent && "chip-bandeau-urgent", className)}>
      {libelle}
      <b className="mt-px block text-sm font-semibold text-white">{valeur}</b>
    </div>
  );
}
