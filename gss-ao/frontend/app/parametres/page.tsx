"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserCircle, LogOut, Sparkles, ShieldCheck } from "lucide-react";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { EnTetePage } from "@/components/visuel/en-tete-page";
import { Compteur } from "@/components/visuel/compteur";

interface Quota {
  role: string;
  used: number;
  limit: number;
}

export default function ParametresPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      setEmail(user?.email ?? null);
      if (!user) return;
      supabase
        .from("profiles")
        .select("role, generation_count, generation_limit")
        .eq("id", user.id)
        .single()
        .then(({ data: p }) => {
          if (p) setQuota({ role: p.role, used: p.generation_count, limit: p.generation_limit });
        });
    });
  }, []);

  const remaining = quota ? Math.max(quota.limit - quota.used, 0) : 0;
  const pct = quota && quota.limit > 0 ? Math.min((quota.used / quota.limit) * 100, 100) : 0;

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex h-full flex-col">
      <EnTetePage
        className="animate-monter"
        titre="Paramètres"
        sousTitre="Configuration générale de l'application GSS-AO."
      />

      <div className="flex-1 overflow-y-auto px-4 pb-10 pt-5 md:px-9">
        <div className="apparait grid max-w-[960px] grid-cols-[minmax(0,1fr)] items-start gap-5 [&>*:nth-child(1)]:[animation-delay:60ms] [&>*:nth-child(2)]:[animation-delay:130ms] lg:grid-cols-2">
          {/* Compte */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-[9px] text-[15px]">
                <UserCircle className="h-[18px] w-[18px] text-primary" /> Compte
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4">
                <div className="flex min-w-0 items-center gap-3.5 rounded-xl border border-border bg-[#FAFBFC] px-4 py-3.5">
                  <span aria-hidden="true" className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[11px] bg-primary text-primary-foreground shadow-o1">
                    <UserCircle className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                  <div className="break-all text-sm font-semibold sm:truncate">
                    {email ?? "Chargement…"}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                    <span aria-hidden="true" className="h-[7px] w-[7px] shrink-0 rounded-full bg-success" />
                    Connecté à GSS-AO
                  </div>
                  </div>
                  <ShieldCheck aria-hidden="true" className="ml-auto hidden h-5 w-5 shrink-0 text-success sm:block" />
                </div>
                <Button
                  variant="outline"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="self-start text-destructive hover:border-destructive hover:bg-destructive hover:text-destructive-foreground"
                >
                  <LogOut className="h-4 w-4" />
                  {signingOut ? "Déconnexion…" : "Se déconnecter"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Quota de génération */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-[9px] text-[15px]">
                <Sparkles className="h-[18px] w-[18px] text-primary" /> Générations de mémoires
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!quota ? (
                <p className="text-sm text-muted-foreground">Chargement…</p>
              ) : (
                <div className="space-y-3.5">
                  <div className="flex items-end justify-between gap-3">
                    <span className="petites-capitales pb-1">Crédits restants</span>
                    <span className="chiffre-cle text-[34px] text-foreground">
                      <Compteur valeur={remaining} />
                      <span className="ml-1 font-sans text-sm font-normal text-muted-foreground">
                        / {quota.limit}
                      </span>
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className={
                        remaining === 0
                          ? "h-full origin-left animate-remplir rounded-full bg-destructive transition-[width] [transition-duration:400ms] ease-doux"
                          : "h-full origin-left animate-remplir rounded-full bg-[linear-gradient(90deg,hsl(var(--primary)),hsl(var(--info)))] transition-[width] [transition-duration:400ms] ease-doux"
                      }
                      style={{ width: `${100 - pct}%` }}
                    />
                  </div>
                  <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                    {quota.used} génération{quota.used > 1 ? "s" : ""} utilisée
                    {quota.used > 1 ? "s" : ""} sur {quota.limit}.
                    {remaining === 0 &&
                      " Quota atteint — contactez un administrateur pour l'augmenter."}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
