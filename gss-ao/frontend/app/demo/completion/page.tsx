"use client";

import { PlayCircle } from "lucide-react";
import { CompletionPanel } from "@/components/completion-panel";

/** Démonstration : mémoire d'exemple déjà généré, à compléter sans lancer de génération. */
export default function DemoCompletionPage() {
  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-7xl space-y-6 px-4 pb-10 pt-6 md:px-9 md:pt-[30px]">
        <div className="animate-monter">
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-signal-soft px-2.5 py-[3px] text-[11.5px] font-semibold uppercase tracking-[0.08em] text-signal-texte"><PlayCircle aria-hidden="true" className="h-3.5 w-3.5" />Démonstration</div>
          <h1 className="font-display text-[26px] font-bold leading-[1.1] text-foreground md:text-[28px]">Compléter un mémoire généré</h1>
          <p className="mt-2 max-w-3xl rounded-xl border border-border bg-card px-4 py-3 text-[13.5px] leading-relaxed text-muted-foreground shadow-o1">
            Exemple de mémoire déjà généré (cadre imposé en grille de notation). Cliquez sur un « [À COMPLÉTER] » surligné dans
            le document ou dans la liste pour saisir l'information : elle est intégrée immédiatement à cet endroit. « Demander à
            l'équipe » prépare les e-mails pour les bonnes personnes de l'annuaire GSS ; dans cette démonstration, aucun e-mail ne
            part et vous pouvez répondre à la place de chaque destinataire : la réponse est placée automatiquement, comme un vrai e-mail. L'onglet « Assistant » permet de demander une modification en langage naturel (refaire, corriger, développer une réponse, ajouter une page en annexe).
          </p>
        </div>
        <div className="animate-apparaitre [animation-delay:120ms]">
          <CompletionPanel dossierId="demo-etampes" demo />
        </div>
      </div>
    </div>
  );
}
