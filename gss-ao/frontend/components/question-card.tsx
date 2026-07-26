"use client";

// ════════════════════════════════════════════════════════════════════════════════════════
// Carte d'une sollicitation interne (statut + réponse reçue) — Ticket #3
// ════════════════════════════════════════════════════════════════════════════════════════
// Composant partagé, utilisé par la vue mono-dossier (app/sollicitations) et la boîte de
// réception globale (app/inbox). `dossierNom` optionnel : affiché seulement hors vue mono-dossier.

import { FolderKanban } from "lucide-react";
import { Badge, Card, CardContent } from "@/components/ui";
import { STATUT_LABEL, STATUT_BADGE, type QuestionInterne } from "@/lib/sollicitations";

export function QuestionCard(
  { q, dossierNom }: { q: QuestionInterne; dossierNom?: string },
) {
  return (
    <Card>
      <CardContent className="space-y-2 py-4">
        {dossierNom && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FolderKanban className="size-3.5" />
            <span className="font-medium text-foreground">{dossierNom}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <Badge variant={STATUT_BADGE[q.statut]}>{STATUT_LABEL[q.statut]}</Badge>
          <code className="text-xs text-muted-foreground">{q.question_id}</code>
        </div>
        <div className="text-sm"><span className="text-muted-foreground">Critère : </span>{q.critere_concerne}</div>
        <div className="text-sm"><span className="text-muted-foreground">Destinataire : </span>{q.destinataire_nom ? `${q.destinataire_nom} · ` : ""}{q.destinataire_email}</div>
        <div className="text-sm"><span className="text-muted-foreground">Question : </span>{q.question}</div>
        {q.date_limite && <div className="text-xs text-muted-foreground">Date limite : {q.date_limite}</div>}

        {/* Réponse reçue → parsée par l'IA et intégrée automatiquement à la base de connaissance (RAG).
            Aucune validation manuelle : on affiche juste la réponse et le fait qu'elle est intégrée. */}
        {(q.statut === "reponse_recue" || q.statut === "validee") && q.reponse_contenu && (
          <div className="mt-2 rounded-md border border-success bg-success/10 p-3">
            <div className="mb-1 text-xs font-semibold text-muted-foreground">
              Réponse reçue — intégrée à la base de connaissance
            </div>
            <div className="whitespace-pre-wrap text-sm">{q.reponse_contenu}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
