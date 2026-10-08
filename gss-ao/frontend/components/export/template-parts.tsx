/**
 * Sous-composants présentationnels du template imposé (écran 6 — Export).
 * Spécifiques à cet écran : ne sont importés que par la page export.
 * Cases à cocher purement visuelles (non interactives), conformes au cadre
 * de réponse fourni par l'acheteur.
 */
import { Square, SquareCheck } from "lucide-react";
import type { Contact, OptionCochee } from "@/lib/gss-config";

/** Titre de section : text-lg, semibold, trait slate-200 dessous. */
export function SectionTitre({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 border-b-2 border-border pb-2 font-display text-[19px] font-bold text-primary">
      {children}
    </h2>
  );
}

/** Intitulé d'une sous-question (text-sm, medium, slate-700). */
export function SousQuestion({
  numero,
  children,
}: {
  numero?: number | string;
  children: React.ReactNode;
}) {
  return (
    <div className="text-sm font-semibold text-foreground">
      {numero != null && <span className="mr-1.5 font-mono text-subtle-foreground">{numero}.</span>}
      {children}
    </div>
  );
}

/** Bloc de réponse rédigée. */
export function Reponse({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>;
}

/** Case à cocher visuelle (non interactive). */
export function CaseACocher({ option }: { option: OptionCochee }) {
  const Icon = option.checked ? SquareCheck : Square;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
      <Icon
        className={option.checked ? "h-4 w-4 text-primary" : "h-4 w-4 text-[#9AA7B8]"}
      />
      {option.label}
    </span>
  );
}

/** Groupe de cases à cocher en ligne. */
export function GroupeCases({ options }: { options: OptionCochee[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
      {options.map((o) => (
        <CaseACocher key={o.label} option={o} />
      ))}
    </div>
  );
}

/** Bloc coordonnées d'un interlocuteur (Nom / Fonction / Téléphone / Email). */
export function BlocContact({ contact }: { contact: Contact }) {
  const lignes: [string, string][] = [
    ["Nom", contact.nom],
    ["Fonction", contact.fonction],
    ["Téléphone", contact.tel],
    ["Email", contact.email],
  ];
  return (
    <div className="grid gap-x-8 gap-y-1 rounded-lg border border-border bg-[#FAFBFD] p-3 sm:grid-cols-2">
      {lignes.map(([k, v]) => (
        <div key={k} className="flex gap-2 text-sm">
          <span className="w-20 shrink-0 text-subtle-foreground">{k} :</span>
          <span className="min-w-0 break-words font-medium text-foreground">{v}</span>
        </div>
      ))}
    </div>
  );
}
