"use client";

import { CheckCircle2, AlertTriangle, Send, FileText, ShieldCheck } from "lucide-react";
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
import { apiFetch, apiBase } from "@/lib/api";
import { use, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { BandeauDossier } from "@/components/visuel/bandeau-dossier";
import { EntreeEtape } from "@/components/visuel/entree-etape";
import { Jauge } from "@/components/visuel/jauge";

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
    apiFetch(`/api/dossiers/${id}`)
      .then(res => res.json())
      .then(data => {
        if (!data.error) setDossierInfo(data);
      })
      .catch(e => console.error(e));

    const path = localStorage.getItem(`generated_docx_${id}`);
    if (path) {
      setGeneratedPath(path);
      setGeneratedDocxUrl(`${apiBase}/api/download?file=${encodeURIComponent(path)}`);
    }
  }, [id]);

  return (
    <div className="flex h-full flex-col">
      {/* En-tête + boutons export — CONSERVÉS */}
      <BandeauDossier className="flex flex-wrap items-end justify-between gap-4 pb-5 pt-5 md:pb-5 md:pt-5 animate-apparaitre">
        <div>
          <div className="font-mono text-[12.5px] font-medium uppercase tracking-wide text-muted-foreground">
            {dossierInfo.acheteur}{dossierInfo.reference ? ` · ${dossierInfo.reference}` : ""}
          </div>
          <h1 className="mt-1.5 font-display text-[24px] font-bold leading-[1.15] md:text-[28px]">Export & dépôt</h1>
        </div>
        <div className="flex flex-wrap items-start gap-3 md:gap-4">
          {generatedDocxUrl && (
            <a
              href={`${generatedDocxUrl}&download=1`}
              download={isPdf ? "Mémoire technique GSS.pdf" : "Mémoire technique GSS.docx"}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[9px] text-sm font-semibold shadow-o1 transition-[background-color,box-shadow,translate] duration-150 motion-safe:hover:-translate-y-px h-[38px] px-4 py-2 bg-primary text-primary-foreground"
            >
              {isPdf ? "Télécharger le document généré (.pdf)" : "Télécharger le document généré (.docx)"}
            </a>
          )}
          <ExportButtons />
        </div>
      </BandeauDossier>

      <DossierNav id={id} />

      <EntreeEtape className="grid flex-1 grid-cols-[minmax(0,1fr)] content-start gap-5 overflow-y-auto px-4 py-5 md:px-9 md:py-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:content-stretch lg:overflow-hidden">
        {/* ============ Document central : template imposé ou DOCX généré ============ */}
        <div className="min-w-0 animate-monter lg:overflow-y-auto rounded-xl border border-border bg-[#EEF2F7]/70 p-3 md:p-6">
          {generatedDocxUrl ? (
            <div className="mx-auto max-w-4xl space-y-4">
              <div className="rounded-xl border border-[#BFE0CC] bg-gradient-to-r from-success-soft to-card px-4 py-3 text-sm font-semibold text-success flex items-center gap-2.5 shadow-o1">
                <CheckCircle2 className="h-5 w-5 motion-safe:animate-zoom-doux" />
                Voici le document final généré, prêt pour l'export.
              </div>
              {isPdf ? (
                <div className="relative h-[800px] w-full overflow-hidden rounded-xl border border-border bg-secondary shadow-inner">
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
            <div className="mx-auto flex max-w-3xl flex-col items-center rounded-xl border-2 border-dashed border-[#B9C5D4] bg-gradient-to-b from-card to-[#F8FAFC] px-6 py-12 text-center md:p-12">
              <span aria-hidden="true" className="mb-4 grid h-16 w-16 place-items-center rounded-full bg-secondary text-primary"><FileText className="h-8 w-8 motion-safe:animate-flotte" strokeWidth={1.6} /></span>
              <h2 className="font-display text-[22px] font-bold mb-2">Aucun document final généré</h2>
              <p className="max-w-md text-[14.5px] leading-relaxed text-muted-foreground">
                Veuillez retourner à l'étape "Mémoire technique" pour lancer la génération de votre document.
              </p>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl rounded-xl border border-border bg-card px-5 py-8 shadow-o2 md:p-12">
            {/* En-tête du document */}
            <div className="mb-8 border-b border-border pb-6 text-center">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                Mémoire technique — cadre de réponse
              </div>
              <h2 className="mt-2 text-2xl font-bold text-foreground">{dossierInfo.objet}</h2>
              <div className="mt-2 text-sm text-muted-foreground">
                {dossierInfo.acheteur}{dossierInfo.reference ? ` · ${dossierInfo.reference}` : ""} · Remise le {dossierInfo.dateLimite ? formatDate(dossierInfo.dateLimite) : "N/A"}
              </div>
              <div className="mt-4 text-sm font-medium text-muted-foreground">
                Candidat : GSS — Sécurité privée
              </div>
            </div>

            {/* Bloc identité du candidat */}
            <div className="mb-8 rounded-xl border border-border bg-[#FAFBFD] p-4">
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

                <div className="rounded-lg border border-[#F0D3A8] bg-warning-soft px-3 py-2 text-sm text-warning">
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
                  <div className="overflow-hidden rounded-xl border border-border">
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
                  <div className="inline-flex items-baseline gap-2 rounded-xl border border-border bg-secondary/60 px-4 py-2">
                    <span className="chiffre-cle text-[28px] text-primary">
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
        <aside className="space-y-4 lg:overflow-y-auto animate-monter [animation-delay:100ms]">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-[9px] text-[15px]"><ShieldCheck aria-hidden="true" className="h-[18px] w-[18px] text-primary" />Vérifications avant envoi</CardTitle>
              {/* Jauge : contrôles déjà satisfaits sur le total de la liste ci-dessous. */}
              <div aria-hidden="true" className="flex items-center gap-3 pt-1">
                <Jauge valeur={(CHECKS.filter((c) => c.ok).length / CHECKS.length) * 100} ton="succes" epaisseur={7} />
                <span className="shrink-0 font-mono text-[12.5px] font-semibold tabular-nums text-muted-foreground">{CHECKS.filter((c) => c.ok).length}/{CHECKS.length}</span>
              </div>
            </CardHeader>
            <CardContent className="apparait grid gap-2">
              {CHECKS.map((c) => (
                <div
                  key={c.label}
                  className={cn(
                    "flex items-start gap-2.5 rounded-[10px] border px-3 py-2.5 text-sm transition-colors",
                    c.ok ? "border-border bg-card" : "border-[#F0D3A8] bg-warning-soft/70",
                  )}
                >
                  {c.ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success motion-safe:animate-zoom-doux" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  )}
                  <span>{c.label}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {!pret && (
            <div className="rounded-xl border border-[#F0D3A8] bg-gradient-to-r from-warning-soft to-[#FFFBF3] p-3.5 text-[12.5px] leading-relaxed text-muted-foreground">
              Certaines vérifications ne sont pas satisfaites. Complétez la check-list de conformité
              et la validation du mémoire avant de marquer le dossier prêt.
            </div>
          )}

          <Separator />

          <Button className="h-11 w-full" disabled={!pret}>
            <Send className="h-4 w-4" /> Marquer comme prêt à envoyer
          </Button>
          <p className="text-center text-[12px] text-subtle-foreground">
            Le dépôt s'effectue sur {dossierInfo.plateforme || "la plateforme de l'acheteur"} (hors application).
          </p>
        </aside>
      </EntreeEtape>
    </div>
  );
}
