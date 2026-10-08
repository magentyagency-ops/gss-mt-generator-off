"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, ListChecks, PenLine, Download, FileStack, Globe, Mail, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { IndicateurGlissant } from "@/components/visuel/indicateur-glissant";
import { getMode } from "@/lib/ai/mode";
import { createClient } from "@/lib/supabase/client";

/** Onglets d'étapes au sein d'un dossier (écrans 3 → 6).
 *  En Mode B (réponse libre), une étape « Sélection slides » s'intercale. */
export function DossierNav({ id }: { id: string }) {
  const pathname = usePathname();
  const base = `/dossiers/${id}`;
  const [modeB, setModeB] = useState(false);
  // L'onglet « Recherches web » n'apparaît qu'APRÈS des résultats (recherche_web) — c.-à-d. après
  // avoir cliqué « Trouver l'info sur internet ». Tant qu'il n'y en a pas, l'onglet est masqué.
  const supabase = useMemo(() => createClient(), []);
  const [hasRecherches, setHasRecherches] = useState(false);

  useEffect(() => {
    setModeB(getMode(id) === "B");
  }, [id, pathname]);

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const { data } = await supabase.from("recherche_web").select("id").eq("dossier_id", id).limit(1);
        if (!annule) setHasRecherches(Array.isArray(data) && data.length > 0);
      } catch { if (!annule) setHasRecherches(false); }
    })();
    return () => { annule = true; };
  }, [supabase, id, pathname]);

  const steps = [
    { href: base, label: "Synthèse", icon: FileText },
    { href: `${base}/conformite`, label: "Conformité", icon: ListChecks },
    ...(modeB
      ? [{ href: `${base}/selection-slides`, label: "Sélection slides", icon: FileStack }]
      : []),
    { href: `${base}/memoire`, label: "Mémoire technique", icon: PenLine },
    // Onglet Recherches web : seulement s'il existe des résultats à valider (ou déjà sur la page).
    ...(hasRecherches || pathname === `${base}/recherches`
      ? [{ href: `${base}/recherches`, label: "Recherches web", icon: Globe }]
      : []),
    { href: `${base}/export`, label: "Export", icon: Download },
  ];
  return (
    <nav className="relative isolate flex items-center gap-1 overflow-x-auto border-b border-border bg-card px-3 py-2.5 shadow-o1 [scrollbar-width:none] md:gap-1.5 md:px-7">
      {/* Fond marine de l'étape active, qui glisse d'une étape à l'autre (purement visuel). */}
      <IndicateurGlissant groupe="etapes-dossier" className="rounded-[9px] bg-primary shadow-o2" />
      {steps.map((s, i) => {
        const active = pathname === s.href;
        const Icon = s.icon;
        return (
          <Link
            key={s.href}
            href={s.href}
            data-actif={active}
            title={s.label}
            className={cn(
              "group/etape relative flex shrink-0 items-center gap-2 whitespace-nowrap rounded-[9px] px-2.5 py-2 text-sm font-medium transition-colors md:px-3.5 md:text-[14.5px]",
              // Trait de liaison avec l'étape précédente (vert pâle s'il mène à une étape franchie ou active).
              "[&:not(:first-of-type)]:ml-3 md:[&:not(:first-of-type)]:ml-6 before:pointer-events-none before:absolute before:-left-[11px] before:top-1/2 before:h-0.5 before:w-2 before:origin-left before:-translate-y-1/2 before:animate-remplir before:rounded-full before:bg-border md:before:-left-[23px] md:before:w-[22px] [&:first-of-type]:before:hidden",
              "data-[actif=true]:before:bg-[#9CCFB3] [&:has(~a[data-actif=true])]:before:bg-[#9CCFB3]",
              active
                ? "text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground active:bg-[#E3E9F1]",
            )}
          >
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[12px] font-semibold transition-colors duration-200",
                active ? "bg-signal text-primary" : "bg-secondary text-muted-foreground",
                // Étape franchie (placée avant l'étape active) : rond vert pâle avec coche.
                "[a:has(~a[data-actif=true])_&]:bg-success-soft [a:has(~a[data-actif=true])_&]:text-success",
              )}
            >
              <span className="[a:has(~a[data-actif=true])_&]:hidden">{i + 1}</span>
              <Check aria-hidden="true" strokeWidth={3} className="hidden h-3.5 w-3.5 [a:has(~a[data-actif=true])_&]:block" />
            </span>
            <Icon className="hidden h-4 w-4 opacity-90 sm:block" />
            <span className="sr-only sm:not-sr-only">{s.label}</span>
          </Link>
        );
      })}

      {/* Historique des questions envoyées à l'équipe et des réponses reçues pour CE dossier.
          Hors séquence : ce n'est pas une étape du parcours, donc ni numéro ni renumérotation
          des onglets existants. `?ao=` filtre l'historique sur ce dossier. */}
      <span aria-hidden="true" className="ml-auto pl-3" />
      <Link
        href={`/inbox?ao=${id}`}
        className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-[9px] border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-[#C7D0DC] hover:bg-secondary hover:text-foreground"
      >
        <Mail className="h-4 w-4" />
        <span className="sr-only md:not-sr-only">Sollicitations</span>
      </Link>
    </nav>
  );
}
