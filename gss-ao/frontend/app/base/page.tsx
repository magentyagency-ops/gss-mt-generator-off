import { Library, Layers, Tags, Search } from "lucide-react";
import { EnTetePage } from "@/components/visuel/en-tete-page";
import { Compteur } from "@/components/visuel/compteur";

export default function BasePage() {
  return (
    <div className="flex h-full flex-col">
      <EnTetePage className="animate-monter" titre="Base de connaissances" />
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 text-center md:p-9">
        <div className="w-full max-w-[560px] animate-monter rounded-2xl border border-border bg-card px-6 py-10 shadow-o1 [animation-delay:80ms] sm:px-10">
          <span
            aria-hidden="true"
            className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-secondary text-primary ring-8 ring-secondary/50"
          >
            <Library className="h-8 w-8 motion-safe:animate-flotte" strokeWidth={1.6} />
          </span>
          <h2 className="font-display text-[22px] font-bold leading-tight">Base de connaissances — SLIDE REP AO</h2>
          <p className="mx-auto mt-2 max-w-md text-[13.5px] leading-relaxed text-muted-foreground">
            118 slides réutilisables, 21 catégories, indexées pour le RAG. Explorateur de la base prévu
            dans une prochaine itération.
          </p>
          <div aria-hidden="true" className="apparait mt-7 grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-border bg-[#FAFBFC] px-3 py-3.5">
              <Layers className="mx-auto mb-1.5 h-[18px] w-[18px] text-primary" />
              <div className="chiffre-cle text-[24px] text-foreground">
                <Compteur valeur={118} />
              </div>
              <div className="petites-capitales mt-0.5">slides</div>
            </div>
            <div className="rounded-xl border border-border bg-[#FAFBFC] px-3 py-3.5">
              <Tags className="mx-auto mb-1.5 h-[18px] w-[18px] text-primary" />
              <div className="chiffre-cle text-[24px] text-foreground">
                <Compteur valeur={21} />
              </div>
              <div className="petites-capitales mt-0.5">catégories</div>
            </div>
            <div className="rounded-xl border border-border bg-[#FAFBFC] px-3 py-3.5">
              <Search className="mx-auto mb-1.5 h-[18px] w-[18px] text-primary" />
              <div className="chiffre-cle text-[24px] text-foreground">RAG</div>
              <div className="petites-capitales mt-0.5">indexées</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
