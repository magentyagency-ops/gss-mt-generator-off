"use client";

import { CompletionPanel } from "@/components/completion-panel";

/** Démonstration : mémoire d'exemple déjà généré, à compléter sans lancer de génération. */
export default function DemoCompletionPage() {
  return (
    <div className="h-full overflow-y-auto bg-muted/10 p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Démonstration</div>
          <h1 className="text-lg font-semibold">Compléter un mémoire généré</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Exemple de mémoire déjà généré (cadre imposé en grille de notation). Cliquez sur un « [À COMPLÉTER] » surligné dans
            le document ou dans la liste pour saisir l'information : elle est intégrée immédiatement à cet endroit. « Demander à
            l'équipe » prépare les e-mails pour les bonnes personnes de l'annuaire GSS ; dans cette démonstration, aucun e-mail ne
            part et vous pouvez répondre à la place de chaque destinataire : la réponse est placée automatiquement, comme un vrai e-mail. L'onglet « Assistant » permet de demander une modification en langage naturel (refaire, corriger, développer une réponse, ajouter une page en annexe).
          </p>
        </div>
        <CompletionPanel dossierId="demo-etampes" demo />
      </div>
    </div>
  );
}
