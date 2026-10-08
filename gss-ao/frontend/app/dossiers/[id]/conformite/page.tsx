"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  XCircle,
  MinusCircle,
  AlertTriangle,
  FileSearch,
  X,
  ArrowRight,
  UploadCloud,
  FileCheck,
} from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { DossierNav } from "@/components/dossier-nav";
import { type Piece, type DceFile } from "@/lib/gss-config";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { BandeauDossier } from "@/components/visuel/bandeau-dossier";
import { EntreeEtape } from "@/components/visuel/entree-etape";
import { Jauge } from "@/components/visuel/jauge";

type Etat = Piece["etat"];
const ETATS: { key: Etat; label: string; icon: React.ElementType; cls: string }[] = [
  { key: "obtenu", label: "Obtenu", icon: CheckCircle2, cls: "text-success" },
  { key: "attente", label: "En attente", icon: Clock, cls: "text-warning" },
  { key: "manquant", label: "Manquant", icon: XCircle, cls: "text-destructive" },
  { key: "na", label: "N/A", icon: MinusCircle, cls: "text-muted-foreground" },
];

/**
 * Pièces sans lesquelles l'offre est irrecevable. `type` = libellé produit par le
 * classifieur de l'écran de dépôt (lib/dce-detect.ts) : les deux listes doivent concorder.
 */
const OBLIGATOIRES: { type: string; label: string }[] = [
  { type: "CCTP", label: "CCTP / CCP (Exigences techniques)" },
  { type: "RC", label: "Règlement de Consultation (RC)" },
  { type: "CCAP", label: "Cahier des Clauses Administratives Particulières (CCAP)" },
  { type: "BPU / DPGF", label: "BPU / DPGF (Chiffrage)" },
  { type: "Acte d'Engagement", label: "Acte d'Engagement" },
];

function PieceRow({
  piece,
  onUpload,
  onRef,
}: {
  piece: Piece;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRef: () => void;
}) {
  const meta = ETATS.find((e) => e.key === piece.etat)!;
  const Icon = meta.icon;
  const bloquant = piece.etat === "manquant" && piece.obligatoire;
  
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-[10px] border px-3.5 py-3 transition-[border-color,box-shadow,translate] duration-200 ease-doux hover:border-[#C9D3DF] hover:shadow-o1 motion-safe:hover:-translate-y-px sm:flex-nowrap",
        bloquant ? "border-[#F2C3C8] bg-[#FFF9F9] hover:border-[#EBA9B0]" : "border-border bg-card",
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]",
          piece.etat === "obtenu" ? "bg-success-soft" : piece.etat === "manquant" ? "bg-destructive-soft" : piece.etat === "attente" ? "bg-warning-soft" : "bg-secondary",
        )}
      >
        <Icon className={cn("h-[17px] w-[17px]", meta.cls)} />
      </div>
      <div className="min-w-0 flex-1 max-sm:basis-[calc(100%-50px)]">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="min-w-0 truncate text-sm font-semibold">{piece.nom}</span>
          {piece.alternative && (
            <Badge variant="outline" className="font-normal text-xs">
              ou {piece.alternative}
            </Badge>
          )}
          {!piece.obligatoire && (
            <Badge variant="secondary" className="font-normal text-xs">
              facultatif
            </Badge>
          )}
        </div>
        <button
          onClick={onRef}
          className="mt-0.5 flex items-center gap-1 rounded text-[12px] text-subtle-foreground underline-offset-2 hover:text-primary hover:underline transition-colors"
        >
          <FileSearch className="h-3 w-3" /> Source RC ({piece.ref})
        </button>
      </div>
      <div className="ml-auto flex items-center gap-2.5 shrink-0">
        <Badge variant={meta.key === "obtenu" ? "success" : meta.key === "manquant" ? "destructive" : meta.key === "attente" ? "warning" : "secondary"}>
          {meta.label}
        </Badge>
        
        {/* Upload Button */}
        <label className="cursor-pointer rounded-lg transition-[scale] duration-150 active:scale-[.97] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring">
          <input type="file" className="hidden" onChange={onUpload} accept=".pdf,.doc,.docx,.zip" />
          <div className={cn(
            "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-semibold shadow-o1 transition-[background-color,border-color,box-shadow] duration-150",
            piece.etat === "obtenu" 
              ? "border-border bg-card text-foreground hover:border-[#C7D0DC] hover:bg-[#FBFCFD]" 
              : "border-primary bg-primary text-primary-foreground hover:bg-primary-hover hover:shadow-o2"
          )}>
            {piece.etat === "obtenu" ? (
              <><FileCheck className="h-3.5 w-3.5" /> Remplacer</>
            ) : (
              <><UploadCloud className="h-3.5 w-3.5" /> Uploader</>
            )}
          </div>
        </label>
      </div>
    </div>
  );
}

export default function ConformitePage({ params }: { params: { id: string } }) {
  const id = params.id;

  const [dossierInfo, setDossierInfo] = useState<any>({ acheteur: "Chargement...", reference: "..." });
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [refPiece, setRefPiece] = useState<Piece | null>(null);
  const storageKey = `gss_conformite_v4_${id}`;

  useEffect(() => {
    // Les pièces réellement déposées vivent côté serveur (dossier.dce_files, alimenté par
    // l'écran de dépôt). L'ancienne version lisait une clé localStorage `dce_files_<id>` que
    // RIEN n'écrivait : la check-list retombait donc toujours sur la liste en dur ci-dessous,
    // et aucun fichier du DCE n'était reconnu comme pièce requise.
    apiFetch(`/api/dossiers/${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) return;
        setDossierInfo(data);

        const uploaded: DceFile[] = Array.isArray(data.dce_files) ? data.dce_files : [];
        const deposees: Piece[] = uploaded.map((f) => ({
          nom: f.nom,
          obligatoire: OBLIGATOIRES.some((o) => o.type === f.type),
          alternative: null,
          etat: "obtenu" as Etat,
          ref: f.type,
        }));

        // Un prérequis qui n'a été retrouvé dans AUCUN fichier déposé doit apparaître
        // explicitement comme manquant (c'est lui qui rend l'offre irrecevable).
        const manquants: Piece[] = OBLIGATOIRES.filter(
          (o) => !uploaded.some((f) => f.type === o.type),
        ).map((o) => ({
          nom: o.label,
          obligatoire: true,
          alternative: null,
          etat: "manquant" as Etat,
          ref: o.type,
        }));

        const basePieces = [...deposees, ...manquants];

        // On réapplique les états déjà saisis (uploads manuels depuis cette page), par nom.
        const saved = localStorage.getItem(storageKey);
        let etatsSauves: Record<string, Etat> = {};
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            for (const p of parsed.pieces ?? []) etatsSauves[p.nom] = p.etat;
          } catch (e) {
            console.error("Failed to parse conformite data");
          }
        }
        setPieces(
          basePieces.map((p) => (etatsSauves[p.nom] ? { ...p, etat: etatsSauves[p.nom] } : p)),
        );
      })
      .catch((e) => console.error(e));
  }, [id, storageKey]);


  const persist = (newPieces: Piece[]) => {
    setPieces(newPieces);
    localStorage.setItem(storageKey, JSON.stringify({ pieces: newPieces }));
  };

  const handleUpload = (nom: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return; // if user cancelled

    const newPieces = pieces.map(p => p.nom === nom ? { ...p, etat: "obtenu" as Etat } : p);
    persist(newPieces);
    
    // Clear the input so the same file can be uploaded again if needed
    e.target.value = "";
  };

  const manquants = useMemo(
    () => pieces.filter((p) => p.obligatoire && p.etat === "manquant"),
    [pieces],
  );
  const total = pieces.length;
  const obtenus = pieces.filter((p) => p.etat === "obtenu").length;

  return (
    <div className="flex h-full flex-col">
      <BandeauDossier
        className="animate-apparaitre pb-5 pt-5 md:pb-[18px] md:pt-5"
        meta={
          <div className="text-[12.5px] font-medium uppercase tracking-wide text-muted-foreground">
            {dossierInfo.acheteur}{dossierInfo.reference ? ` · ${dossierInfo.reference}` : ""}
          </div>
        }
      >
        <div className="mt-1.5 flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-display text-[24px] font-bold leading-[1.15] md:text-[28px]">Check-list de conformité administrative</h1>
          <div className="flex flex-wrap items-center gap-4">
            <div className="min-w-[180px] md:min-w-[220px] md:text-right">
              <span className="font-mono text-[12.5px] tabular-nums text-muted-foreground">
                {obtenus}/{total} pièces obtenues
              </span>
              {/* Jauge : reprend le compteur « n/m pièces obtenues » déjà affiché. */}
              <Jauge
                valeur={(obtenus / Math.max(total, 1)) * 100}
                epaisseur={8}
                couleur="linear-gradient(90deg, hsl(var(--success)), #39A673)"
                className="mt-1.5 bg-white/15"
              />
            </div>
            <Link href={`/dossiers/${id}/memoire`}>
              <Button>
                Étape suivante <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </BandeauDossier>

      <DossierNav id={id} />

      <EntreeEtape className="flex-1 overflow-y-auto px-4 py-5 md:px-9 md:py-6">
        {/* Alerte */}
        {manquants.length > 0 && (
          <div className="mx-auto mb-5 flex max-w-4xl animate-monter items-center gap-3.5 rounded-xl border border-[#F2C3C8] bg-gradient-to-r from-[#FDECEE] to-[#FFF8F8] px-4 py-3.5">
            <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[10px] bg-card shadow-o1">
              <AlertTriangle className="h-[19px] w-[19px] text-destructive" />
            </span>
            <div>
              <div className="text-sm font-semibold text-destructive">
                {manquants.length} pièce(s) obligatoire(s) manquante(s) — offre éliminée si non
                fournie
              </div>
              <div className="mt-0.5 text-[13.5px] text-muted-foreground">
                {manquants.map((p) => p.nom).join(" · ")}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 max-w-4xl mx-auto animate-monter [animation-delay:80ms]">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between gap-[9px] text-[15px]">
                <span className="flex items-center gap-[9px]"><CheckCircle2 aria-hidden="true" className="h-[18px] w-[18px] text-primary" />Pièces Requises</span>
                <Badge variant="secondary" className="font-mono tabular-nums">{pieces.length} pièces</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="apparait grid grid-cols-[minmax(0,1fr)] gap-2">
              {pieces.map((p) => (
                <PieceRow
                  key={p.nom}
                  piece={p}
                  onUpload={(e) => handleUpload(p.nom, e)}
                  onRef={() => setRefPiece(p)}
                />
              ))}
            </CardContent>
          </Card>
        </div>
      </EntreeEtape>

      {/* Panneau latéral : référence RC */}
      {refPiece && (
        <div className="fixed inset-0 z-50 flex justify-end bg-[rgba(11,37,69,.45)] backdrop-blur-[4px] animate-in fade-in duration-200" onClick={() => setRefPiece(null)}>
          <div
            className="h-full w-full max-w-[420px] overflow-y-auto border-l border-border bg-card p-6 shadow-o3 animate-in slide-in-from-right-8 fade-in duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-[15px] font-semibold"><FileSearch aria-hidden="true" className="h-[18px] w-[18px] text-primary" />Référence dans le RC</h3>
              <button onClick={() => setRefPiece(null)} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <Badge variant="outline" className="mb-3">
              {refPiece.ref}
            </Badge>
            <div className="text-[15px] font-semibold">{refPiece.nom}</div>
            <div className="mt-3 rounded-xl border border-border border-l-4 border-l-primary bg-secondary/60 p-4 text-sm leading-6 text-muted-foreground">
              Extrait du Règlement de Consultation (RC) : la pièce «&nbsp;{refPiece.nom}
              &nbsp;» figure parmi les éléments à produire ({refPiece.ref}). Document exigé
              {refPiece.obligatoire ? " à peine d'irrecevabilité." : " (facultatif)."}
              {refPiece.alternative && ` Alternative admise : ${refPiece.alternative}.`}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
