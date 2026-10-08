"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileCheck2, FileText, ArrowRight, AlertTriangle, SlidersHorizontal } from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { getMode, setMode, type ResponseMode } from "@/lib/ai/mode";

/**
 * Écran 3 — Mode de réponse.
 * Détection auto (cadre imposé si un "Mémoire technique cadre de réponse" est
 * présent dans le DCE — vrai pour le cas Univ Rouen) + toggle manuel de
 * simulation Mode B pour la démo.
 */
export function ModeSelector({ id, templateDetected }: { id: string; templateDetected: boolean }) {
  const [mode, setLocalMode] = useState<ResponseMode>("A");

  useEffect(() => {
    setLocalMode(getMode(id));
  }, [id]);

  function change(m: ResponseMode) {
    setMode(id, m);
    setLocalMode(m);
  }

  return (
    <Card className="animate-monter">
      <CardHeader>
        <CardTitle className="flex items-center gap-[9px] text-[15px]">
          <SlidersHorizontal aria-hidden="true" className="h-[18px] w-[18px] text-primary" />
          Mode de réponse
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3.5">
        <div className="flex flex-wrap items-center gap-2.5">
          {mode === "A" ? (
            <Badge variant="default" className="gap-1">
              <FileCheck2 className="h-3 w-3" /> Cadre imposé
            </Badge>
          ) : (
            <Badge variant="warning" className="gap-1">
              <FileText className="h-3 w-3" /> Réponse libre
            </Badge>
          )}
          <span className="text-[12.5px] text-muted-foreground">
            {templateDetected
              ? "Template « cadre de réponse » détecté dans le DCE."
              : "Aucun template client détecté."}
          </span>
        </div>

        {/* Toggle démo */}
        <div className="flex items-center gap-2.5 rounded-[10px] border border-border bg-[#FAFBFC] px-3 py-2.5">
          <button
            role="switch"
            aria-checked={mode === "B"}
            onClick={() => change(mode === "A" ? "B" : "A")}
            className={`relative h-6 w-11 shrink-0 rounded-full shadow-inner transition-[background-color,scale] duration-200 ease-doux active:scale-95 ${
              mode === "B" ? "bg-warning" : "bg-[#CBD3DE]"
            }`}
          >
            <span
              className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-o1 transition-transform duration-200 ease-doux ${
                mode === "B" ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
          <span className="text-sm font-medium">Simuler réponse libre</span>
        </div>

        {mode === "B" && (
          <div className="flex animate-monter items-start gap-2 rounded-[10px] border border-warning/25 bg-warning-soft px-3 py-2.5 text-xs leading-relaxed text-warning">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Mode démo — à utiliser uniquement pour démontrer le flux Mode B (réponse libre sur
            slides GSS).
          </div>
        )}

        {mode === "B" && (
          <Link href={`/dossiers/${id}/selection-slides`}>
            <Button size="sm" className="w-full">
              Analyser & sélectionner les slides <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
