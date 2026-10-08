"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Message long replié : seules les premières lignes sont visibles, en fondu, avec un bouton
 * « Afficher tout » qui déroule le texte complet (et « Réduire » pour le replier).
 * Le déroulé et le repli sont animés (hauteur + fondu), sauf si le système demande moins
 * d'animations. Purement visuel : le texte affiché est exactement celui reçu.
 */
export function MessageRepliable({ texte, lignes = 3 }: { texte: string; lignes?: number }) {
  const replie = `${lignes * 1.25}rem`;
  const [ouvert, setOuvert] = React.useState(false);
  const [hauteur, setHauteur] = React.useState<string>(replie);
  const ref = React.useRef<HTMLParagraphElement>(null);

  const basculer = () => {
    const el = ref.current;
    if (!el) return setOuvert((o) => !o);
    const moinsDAnimations = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!ouvert) {
      setOuvert(true);
      setHauteur(moinsDAnimations ? "none" : `${el.scrollHeight}px`);
    } else {
      setOuvert(false);
      if (moinsDAnimations) return setHauteur(replie);
      // Depuis « none », on repart de la hauteur réelle pour que le repli soit animé.
      setHauteur(`${el.scrollHeight}px`);
      requestAnimationFrame(() => requestAnimationFrame(() => setHauteur(replie)));
    }
  };

  return (
    <div>
      <div className="relative">
        <p
          ref={ref}
          className="overflow-hidden whitespace-pre-line"
          // Transition inline : en mode « moins d'animations », basculer() passe directement par
          // « none », ce qui supprime tout mouvement.
          style={{ maxHeight: hauteur, transition: "max-height 420ms cubic-bezier(0.22, 0.8, 0.3, 1)" }}
          onTransitionEnd={(e) => {
            if (e.propertyName === "max-height" && ouvert) setHauteur("none");
          }}
        >
          {texte}
        </p>
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-b from-transparent to-card motion-safe:transition-opacity motion-safe:duration-300",
            ouvert ? "opacity-0" : "opacity-100",
          )}
        />
      </div>
      <button
        type="button"
        aria-expanded={ouvert}
        onClick={basculer}
        className="mt-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold text-primary transition-colors hover:bg-secondary active:scale-[0.97]"
      >
        <ChevronDown aria-hidden="true" className={cn("h-3.5 w-3.5 transition-transform duration-300", ouvert && "rotate-180")} />
        {ouvert ? "Réduire" : "Afficher tout le message"}
      </button>
    </div>
  );
}
