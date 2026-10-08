import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Coche qui se dessine à l'affichage (tracé SVG), pour un contrôle ou une pièce validés.
 * Usage : <CocheTracee className="h-4 w-4 text-success" />
 */
export function CocheTracee({ className, delai = 0 }: { className?: string; delai?: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-4 w-4", className)}
    >
      <path d="M20 6 9 17l-5-5" pathLength={1} className="trace" style={delai ? { animationDelay: `${delai}ms` } : undefined} />
    </svg>
  );
}
