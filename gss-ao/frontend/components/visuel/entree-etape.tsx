"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/*
 * Ordre fixe des étapes d'un dossier, pour le sens du glissement uniquement
 * (Synthèse → Conformité → Sélection slides → Mémoire → Recherches → Export).
 * Constante purement visuelle : elle ne pilote ni la navigation ni l'affichage des étapes.
 */
const ORDRE_ETAPES = ["", "conformite", "selection-slides", "memoire", "recherches", "export"];

/* Mémoire visuelle de la dernière étape affichée (variable de module, aucun stockage). */
const derniere = { dossier: "", courant: -1, precedent: -1 };

function sensDuGlissement(pathname: string | null): "avance" | "recule" | "fondu" {
  const m = /^\/dossiers\/([^/]+)(?:\/([^/?#]+))?\/?$/.exec(pathname ?? "");
  const index = m ? ORDRE_ETAPES.indexOf(m[2] ?? "") : -1;
  if (!m || index < 0 || m[1] === "nouveau") return "fondu";
  // Mise à jour idempotente (un second rendu identique ne change rien).
  if (derniere.dossier !== m[1]) {
    derniere.dossier = m[1];
    derniere.precedent = -1;
    derniere.courant = index;
  } else if (derniere.courant !== index) {
    derniere.precedent = derniere.courant;
    derniere.courant = index;
  }
  if (derniere.precedent < 0 || derniere.precedent === index) return "fondu";
  return index > derniere.precedent ? "avance" : "recule";
}

/**
 * Enveloppe le corps d'une page de dossier : le contenu glisse vers la gauche quand on avance
 * d'une étape, vers la droite quand on recule (280 ms), en fondu sinon. Le sens est calculé
 * une seule fois au montage de la page (chaque étape est déjà un nouveau segment monté par
 * Next) : aucune key, aucun template.tsx, aucun état métier, rien n'est retardé.
 * Usage : <EntreeEtape className="flex-1 overflow-y-auto p-6">…corps existant…</EntreeEtape>
 */
export function EntreeEtape({
  className,
  style,
  children,
}: {
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  const pathname = usePathname();
  const [sens] = React.useState(() => sensDuGlissement(pathname));
  return (
    <div
      className={cn(
        sens === "avance" ? "entree-avance" : sens === "recule" ? "entree-recule" : "entree-fondu",
        className,
      )}
      style={style}
    >
      {children}
    </div>
  );
}
