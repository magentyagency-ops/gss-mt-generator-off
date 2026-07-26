"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, ListChecks, PenLine, Download, FileStack, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
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
    <nav className="flex items-center gap-1 border-b border-border bg-card px-4">
      {steps.map((s, i) => {
        const active = pathname === s.href;
        const Icon = s.icon;
        return (
          <Link
            key={s.href}
            href={s.href}
            className={cn(
              "flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full text-[11px]",
                active ? "bg-primary text-primary-foreground" : "bg-secondary",
              )}
            >
              {i + 1}
            </span>
            <Icon className="h-4 w-4" />
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
