import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Titre de carte : icône marine 18 px + titre 15/600 + élément à droite (badge, compteur).
 * Usage : <TitreCarte icone={CalendarClock} badge={<Badge variant="outline">7 pièces</Badge>}>Informations clés</TitreCarte>
 */
export function TitreCarte({
  icone: Icone,
  couleurIcone,
  badge,
  className,
  children,
}: {
  icone?: LucideIcon;
  couleurIcone?: string;
  badge?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("mb-3 flex items-center gap-[9px] text-[15px] font-semibold", className)}>
      {Icone ? <Icone aria-hidden="true" className={cn("h-[18px] w-[18px] shrink-0 text-primary", couleurIcone)} /> : null}
      <span className="min-w-0">{children}</span>
      {badge ? <span className="ml-auto">{badge}</span> : null}
    </div>
  );
}

/**
 * Indicateur chiffré (KPI) : pastille d'icône 42 px, libellé en petites capitales,
 * valeur 28 px Condensed tabulaire, détail. `alerte` : variante orangée (échéance proche).
 * La valeur est calculée par l'écran à partir de données déjà chargées.
 * Usage : <Indicateur icone={Hourglass} libelle="En cours" valeur={<Compteur valeur={2} />} detail="…" />
 */
export function Indicateur({
  icone: Icone,
  libelle,
  valeur,
  detail,
  alerte = false,
  className,
  style,
}: {
  icone?: LucideIcon;
  libelle: React.ReactNode;
  valeur: React.ReactNode;
  detail?: React.ReactNode;
  alerte?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cn(
        "vive flex items-center gap-3.5 rounded-xl border bg-card px-[18px] py-4 shadow-o1",
        alerte ? "border-[#F3C9A9] bg-gradient-to-b from-[#FFF7F2] to-card to-70%" : "border-border",
        className,
      )}
      style={style}
    >
      {Icone ? (
        <span
          aria-hidden="true"
          className={cn(
            "grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[11px]",
            alerte ? "bg-[#FFE8DC] text-signal" : "bg-secondary text-primary",
          )}
        >
          <Icone className="h-5 w-5" />
        </span>
      ) : null}
      <div className="min-w-0">
        <div className="petites-capitales">{libelle}</div>
        <div className={cn("chiffre-cle text-[28px]", alerte ? "text-signal" : "text-foreground")}>{valeur}</div>
        {detail ? <div className="truncate text-[12.5px] text-muted-foreground">{detail}</div> : null}
      </div>
    </div>
  );
}

/**
 * Pastille d'initiales (ex. acheteur) : tuile 34 px voile, texte marine Condensed.
 * Usage : <Initiales texte={d.acheteur} />
 */
export function Initiales({ texte, className }: { texte?: string | null; className?: string }) {
  const mots = String(texte ?? "")
    .replace(/[()«»"'’]/g, " ")
    .split(/[\s\-–—/]+/)
    .filter((m) => m.length > 2 || /^[A-ZÀ-Ý]{2,}$/.test(m));
  const ini = (mots.length >= 2 ? mots[0][0] + mots[1][0] : (mots[0] ?? "…").slice(0, 2)).toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px] bg-secondary font-display text-xs font-bold text-primary",
        className,
      )}
    >
      {ini}
    </span>
  );
}
