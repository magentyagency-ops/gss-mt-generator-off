"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Message long replié : seules les premières lignes sont visibles, en fondu, avec un bouton
 * « Afficher tout » qui déroule le texte complet (et « Réduire » pour le replier).
 * Purement visuel : le texte affiché est exactement celui reçu, rien n'est retiré ni modifié.
 */
export function MessageRepliable({ texte, lignes = 3 }: { texte: string; lignes?: number }) {
  const [ouvert, setOuvert] = React.useState(false);
  return (
    <div>
      <p
        className={cn("whitespace-pre-line", !ouvert && "overflow-hidden")}
        style={
          ouvert
            ? undefined
            : {
                maxHeight: `${lignes * 1.25}rem`,
                WebkitMaskImage: "linear-gradient(to bottom, #000 45%, transparent)",
                maskImage: "linear-gradient(to bottom, #000 45%, transparent)",
              }
        }
      >
        {texte}
      </p>
      <button
        type="button"
        aria-expanded={ouvert}
        onClick={() => setOuvert((o) => !o)}
        className="mt-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold text-primary transition-colors hover:bg-secondary active:scale-[0.97]"
      >
        <ChevronDown aria-hidden="true" className={cn("h-3.5 w-3.5 transition-transform duration-200", ouvert && "rotate-180")} />
        {ouvert ? "Réduire" : "Afficher tout le message"}
      </button>
    </div>
  );
}
