/**
 * Tons de couleur partagés par les composants visuels (pastilles, jauges, anneaux).
 * Constantes purement visuelles : aucune logique métier.
 */
export type Ton =
  | "marine"
  | "info"
  | "succes"
  | "attente"
  | "danger"
  | "signal"
  | "neutre"
  | "termine";

/** Couleur pleine (barres, anneaux, points). */
export const TON_PLEIN: Record<Ton, string> = {
  marine: "hsl(var(--primary))",
  info: "hsl(var(--info))",
  succes: "hsl(var(--success))",
  attente: "#E08A1E",
  danger: "hsl(var(--destructive))",
  signal: "hsl(var(--signal))",
  neutre: "#9AA7B8",
  termine: "#3E4B5E",
};

/** Classes de pastille (fond doux + texte AA). */
export const TON_PASTILLE: Record<Ton, string> = {
  marine: "bg-primary text-primary-foreground",
  info: "bg-info-soft text-info",
  succes: "bg-success-soft text-success",
  attente: "bg-warning-soft text-warning",
  danger: "bg-destructive-soft text-destructive",
  signal: "bg-signal-soft text-signal-texte",
  neutre: "bg-secondary text-muted-foreground",
  termine: "bg-[#EDEFF3] text-[#3E4B5E]",
};
