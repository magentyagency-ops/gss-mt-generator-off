"use client";

import { CheckCircle2, AlertTriangle, Send } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Separator,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import { DossierNav } from "@/components/dossier-nav";
import { ExportButtons } from "@/components/export/export-buttons";
import {
  BlocContact,
  GroupeCases,
  Reponse,
  SectionTitre,
  SousQuestion,
} from "@/components/export/template-parts";
import {
  IDENTITE_CANDIDAT,
  DEFAULT_SECTION_I,
  DEFAULT_SECTION_IV,
  formatDate,
} from "@/lib/gss-config";
import { cn } from "@/lib/utils";
import { use, useEffect, useState } from "react";
import dynamic from "next/dynamic";

const DocxPreviewViewer = dynamic(
  () => import("@/components/docx-preview-viewer").then((mod) => mod.DocxPreviewViewer),
  { ssr: false }
);

const CHECKS = [
  { label: "Toutes les pièces administratives présentes", ok: false },
  { label: "Mémoire technique validé (4/4 sections)", ok: false },
  { label: "BPU / DPGF joints et complétés", ok: true },
  { label: "Acte d'Engagement signé électroniquement", ok: true },
  { label: "Certificat de visite joint", ok: true },
];

export default function ExportPage({ params }: { params: { id: string } }) {
  const id = params.id;
  const pret = CHECKS.every((c) => c.ok);
  const [generatedDocxUrl, setGeneratedDocxUrl] = useState<string | null>(null);
  const [generatedPath, setGeneratedPath] = useState<string | null>(null);
  // Cas sans template → PDF (Marp) ; cas template → DOCX. On adapte libellé, nom de fichier et aperçu.
  const isPdf = !!generatedPath && generatedPath.toLowerCase().endsWith(".pdf");

  const [dossierInfo, setDossierInfo] = useState<any>({ acheteur: "Chargement...", reference: "...", objet: "..." });

  useEffect(() => {
    fetch(`http://localhost:8000/api/dossiers/${id}`)
      .then(res => res.json())
      .then(data => {
        if (!data.error) setDossierInfo(data);
      })
      .catch(e => console.error(e));

    const path = localStorage.getItem(`generated_docx_${id}`);
    if (path) {
      setGeneratedPath(path);
      setGeneratedDocxUrl(`http://localhost:8000/api/download?file=${encodeURIComponent(path)}`);
    }
  }, [id]);

  return (
    <div className="flex h-full flex-col">
      {/* En-tête + boutons export — CONSERVÉS */}
      <header className="flex items-center justify-between border-b border-border bg-card px-6 py-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {dossierInfo.acheteur} · {dossierInfo.reference}
          </div>
          <h1 className="text-xl font-semibold">Export & dépôt</h1>
        </div>
        <div className="flex items-center gap-4">
          {generatedDocxUrl && (
            <a
              href={`${generatedDocxUrl}&download=1`}
              download={isPdf ? "Mémoire technique GSS.pdf" : "Mémoire technique GSS.docx"}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors h-9 px-4 py-2 bg-primary text-primary-foreground"
            >
              {isPdf ? "Télécharger le document généré (.pdf)" : "Télécharger le document généré (.docx)"}
            </a>
          )}
          <ExportButtons />
        </div>
      </header>

      <DossierNav id={id} />

      <div className="grid flex-1 grid-cols-[1fr_320px] gap-6 overflow-hidden p-6">
        {/* ============ Document central : template imposé ou DOCX généré ============ */}
        <div className="overflow-y-auto rounded-lg bg-muted/40 p-6">
          {generatedDocxUrl ? (
            <div className="mx-auto max-w-4xl space-y-4">
              <div className="rounded-md border border-success/30 bg-success/5 px-4 py-3 text-sm text-success flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Voici le document final généré, prêt pour l'export.
              </div>
              {isPdf ? (
                <div className="relative h-[800px] w-full rounded-md border border-border bg-muted shadow-inner">
                  <iframe
                    src={generatedDocxUrl}
                    className="h-full w-full rounded-md"
                    title="Prévisualisation PDF"
                  />
                </div>
              ) : (
                <DocxPreviewViewer fileUrl={generatedDocxUrl} />
              )}
            </div>
          ) : id !== "rouen-2026-08" ? (
            <div className="mx-auto max-w-3xl rounded-md border border-border bg-card p-12 shadow-sm text-center">
              <h2 className="text-xl font-semibold mb-2">Aucun document final généré</h2>
              <p className="text-muted-foreground">
                Veuillez retourner à l'étape "Mémoire technique" pour lancer la génération de votre document.
              </p>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl rounded-md border border-border bg-card p-12 shadow-sm">
            {/* En-tête du document */}
            <div className="mb-8 border-b border-border pb-6 text-center">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                Mémoire technique — cadre de réponse
              </div>
              <h2 className="mt-2 text-2xl font-bold text-foreground">{dossierInfo.objet}</h2>
              <div className="mt-2 text-sm text-muted-foreground">
                {dossierInfo.acheteur} · {dossierInfo.reference} · Remise le {dossierInfo.dateLimite ? formatDate(dossierInfo.dateLimite) : "N/A"}
              </div>
              <div className="mt-4 text-sm font-medium text-muted-foreground">
                Candidat : GSS — Sécurité privée
              </div>
            </div>

            {/* Bloc identité du candidat */}
            <div className="mb-8 rounded-md border border-border p-4">
              <div className="grid gap-1 text-sm">
                <div className="flex gap-2">
                  <span className="text-muted-foreground">Dénomination du candidat :</span>
                  <span className="font-medium text-foreground">
                    {IDENTITE_CANDIDAT.denomination}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="text-muted-foreground">N° CNAPS d'autorisation d'exercer :</span>
                  <span className="font-medium text-foreground">{IDENTITE_CANDIDAT.num_cnaps}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-muted-foreground">Date d'obtention de l'autorisation :</span>
                  <span className="font-medium text-foreground">
                    {IDENTITE_CANDIDAT.date_autorisation}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-8">
              {/* ---------- Section I ---------- */}
              <section className="space-y-4">
                <SectionTitre>
                  {DEFAULT_SECTION_I.num}. {DEFAULT_SECTION_I.titre} ({DEFAULT_SECTION_I.points} pts)
                </SectionTitre>

                {/* 3. Sous-traitance — cases à cocher */}
                <div className="space-y-2">
                  <SousQuestion numero={3}>{DEFAULT_SECTION_I.soustraitance.label}</SousQuestion>
                  <GroupeCases options={DEFAULT_SECTION_I.soustraitance.options} />
                </div>

                {/* 4. Dispositif absence */}
                <div className="space-y-1.5">
                  <SousQuestion numero={4}>{DEFAULT_SECTION_I.dispositifAbsence.label}</SousQuestion>
                  <Reponse>{DEFAULT_SECTION_I.dispositifAbsence.reponse}</Reponse>
                </div>

                {/* 5 & 6. Interlocuteurs */}
                <div className="space-y-1.5">
                  <SousQuestion numero={5}>{DEFAULT_SECTION_I.interlocuteurPrincipal.label}</SousQuestion>
                  <BlocContact contact={DEFAULT_SECTION_I.interlocuteurPrincipal.contact} />
                </div>
                <div className="space-y-1.5">
                  <SousQuestion numero={6}>{DEFAULT_SECTION_I.interlocuteurDevis.label}</SousQuestion>
                  <BlocContact contact={DEFAULT_SECTION_I.interlocuteurDevis.contact} />
                </div>
              </section>

              {/* ---------- Section IV ---------- */}
              <section className="space-y-4">
                <SectionTitre>
                  {DEFAULT_SECTION_IV.num}. {DEFAULT_SECTION_IV.titre} ({DEFAULT_SECTION_IV.points} pts — lot 3 uniquement)
                </SectionTitre>

                <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning">
                  {DEFAULT_SECTION_IV.lotNote}
                </div>

                {/* 1. APSAD */}
                <div className="space-y-2">
                  <SousQuestion numero={1}>{DEFAULT_SECTION_IV.apsad.label}</SousQuestion>
                  <GroupeCases options={DEFAULT_SECTION_IV.apsad.options} />
                </div>

                {/* 2. Localisation */}
                <div className="space-y-1.5">
                  <SousQuestion numero={2}>{DEFAULT_SECTION_IV.localisation.label}</SousQuestion>
                  <Reponse>{DEFAULT_SECTION_IV.localisation.reponse}</Reponse>
                </div>

                {/* 3. Sous-traitance lever de doute */}
                <div className="space-y-1.5">
                  <SousQuestion numero={3}>{DEFAULT_SECTION_IV.soustraitanceLeverDoute.label}</SousQuestion>
                  <ul className="ml-1 space-y-1">
                    {DEFAULT_SECTION_IV.soustraitanceLeverDoute.departements.map((d: any) => (
                      <li key={d.dep} className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">Département {d.dep} :</span> {d.valeur}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* 4. Report alarmes */}
                <div className="space-y-1.5">
                  <SousQuestion numero={4}>{DEFAULT_SECTION_IV.reportAlarmes.label}</SousQuestion>
                  <Reponse>{DEFAULT_SECTION_IV.reportAlarmes.reponse}</Reponse>
                </div>

                {/* 5. Moyens d'ouverture */}
                <div className="space-y-1.5">
                  <SousQuestion numero={5}>{DEFAULT_SECTION_IV.moyensOuverture.label}</SousQuestion>
                  <Reponse>{DEFAULT_SECTION_IV.moyensOuverture.reponse}</Reponse>
                </div>

                {/* 6. Délais — tableau */}
                <div className="space-y-2">
                  <SousQuestion numero={6}>{DEFAULT_SECTION_IV.delaisLabel}</SousQuestion>
                  <div className="rounded-md border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>Site</TableHead>
                          <TableHead className="text-right">Délai max. d'intervention</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell className="text-muted-foreground">Site A</TableCell>
                          <TableCell className="text-right font-medium tabular-nums text-foreground">
                            30 min
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* 7. Nombre d'intervenants */}
                <div className="space-y-1.5">
                  <SousQuestion numero={7}>{DEFAULT_SECTION_IV.intervenantsLabel}</SousQuestion>
                  <div className="inline-flex items-baseline gap-2 rounded-md border border-border bg-muted/30 px-4 py-2">
                    <span className="text-2xl font-bold text-primary">
                      3
                    </span>
                    <span className="text-sm text-muted-foreground">intervenants véhiculés</span>
                  </div>
                </div>
              </section>
            </div>

            {/* Signature */}
            <div className="mt-10 border-t border-border pt-6 text-right text-sm leading-6 text-muted-foreground">
              <div>Fait à Rouen, le {dossierInfo.dateLimite ? formatDate(dossierInfo.dateLimite) : "N/A"}</div>
              <div className="font-medium text-foreground">GSS — Sécurité privée</div>
              <div>Mme Vaché, Responsable réponse AO</div>
              <div className="italic text-muted-foreground/70">[Signature électronique]</div>
            </div>
          </div>
          )}
        </div>

        {/* ============ Sidebar : vérifications — CONSERVÉE ============ */}
        <aside className="space-y-4 overflow-y-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Vérifications avant envoi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {CHECKS.map((c) => (
                <div
                  key={c.label}
                  className={cn(
                    "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
                    c.ok ? "border-border" : "border-warning/40 bg-warning/5",
                  )}
                >
                  {c.ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  )}
                  <span>{c.label}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {!pret && (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-muted-foreground">
              Certaines vérifications ne sont pas satisfaites. Complétez la check-list de conformité
              et la validation du mémoire avant de marquer le dossier prêt.
            </div>
          )}

          <Separator />

          <Button className="w-full" disabled={!pret}>
            <Send className="h-4 w-4" /> Marquer comme prêt à envoyer
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            Le dépôt s'effectue sur {dossierInfo.plateforme || "la plateforme de l'acheteur"} (hors application).
          </p>
        </aside>
      </div>
    </div>
  );
}
