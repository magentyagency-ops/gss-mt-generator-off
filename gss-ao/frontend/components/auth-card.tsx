"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { MailCheck, FileText, ListChecks, PenLine } from "lucide-react";

type Mode = "login" | "signup";

export function AuthCard({ initialMode = "login" }: { initialMode?: Mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";

  const [mode, setMode] = useState<Mode>(initialMode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signupDone, setSignupDone] = useState(false);

  // Champs partagés
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function switchMode(next: Mode) {
    setError(null);
    setMode(next);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(
        error.message === "Invalid login credentials"
          ? "Email ou mot de passe incorrect."
          : error.message === "Email not confirmed"
            ? "Email non confirmé — vérifie ta boîte mail."
            : error.message,
      );
      return;
    }
    router.push(redirect);
    router.refresh();
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSignupDone(true);
  }

  const inputCls =
    "h-10 w-full rounded-[9px] border border-input bg-card px-[13px] text-sm text-foreground outline-none transition-[border-color,box-shadow] duration-150 ease-doux hover:border-[#B9C5D4]";
  const labelCls = "mb-1.5 block text-[13px] font-semibold text-muted-foreground";
  const erreurCls =
    "animate-monter rounded-[9px] border border-destructive/25 bg-destructive-soft px-3 py-2 text-[13px] leading-snug text-destructive";

  return (
    <div className="grid min-h-screen w-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr] bg-background lg:grid-cols-2 lg:grid-rows-1">
      {/* Panneau de présentation GSS (planche, écran 5) : bandeau compact sur mobile. */}
      <aside className="relative flex flex-col overflow-hidden bg-[linear-gradient(150deg,#0B2545_0%,#123A66_65%,#1B4F86_100%)] px-5 py-5 text-white sm:px-8 lg:px-[72px] lg:py-16">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-36 -right-36 h-[480px] w-[480px] rounded-full bg-[radial-gradient(circle,rgba(241,90,34,0.28),transparent_65%)]"
        />
        {/* Logo + titre */}
        <div className="relative z-[1] flex animate-apparaitre items-center gap-3.5">
          <img
            src="/gssAO.png"
            alt="GSS-AO"
            className="h-11 w-11 rounded-xl bg-white object-contain p-1 shadow-o2 lg:h-[54px] lg:w-[54px] lg:rounded-[14px]"
          />
          <div>
            <h1 className="text-[18px] font-bold leading-tight text-white lg:text-[20px]">GSS-AO</h1>
            <p className="text-[13px] text-[#AFC0D6]">Appels d&apos;offres</p>
          </div>
        </div>
        <div className="relative z-[1] hidden lg:block">
          <h2 className="mb-3 mt-9 max-w-[13ch] animate-monter font-display text-[44px] font-bold leading-[1.05] [animation-delay:80ms]">
            Vos appels d&apos;offres, de l&apos;analyse du DCE à l&apos;envoi.
          </h2>
          <p className="max-w-[42ch] animate-monter text-base text-[#C8D4E4] [animation-delay:140ms]">
            La plateforme de Global Security Services pour préparer chaque réponse.
          </p>
          <ul className="apparait mt-[30px] grid gap-3.5 [&>*:nth-child(1)]:[animation-delay:220ms] [&>*:nth-child(2)]:[animation-delay:290ms] [&>*:nth-child(3)]:[animation-delay:360ms]">
            <li className="flex items-center gap-3.5">
              <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] bg-white/10">
                <FileText className="h-[19px] w-[19px] text-white" />
              </span>
              <div>
                <b className="block text-[15px] font-semibold">Synthèse</b>
                <span className="text-[13.5px] text-[#AFC0D6]">Les informations clés et les risques du dossier.</span>
              </div>
            </li>
            <li className="flex items-center gap-3.5">
              <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] bg-white/10">
                <ListChecks className="h-[19px] w-[19px] text-white" />
              </span>
              <div>
                <b className="block text-[15px] font-semibold">Conformité</b>
                <span className="text-[13.5px] text-[#AFC0D6]">La check-list des pièces à fournir.</span>
              </div>
            </li>
            <li className="flex items-center gap-3.5">
              <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] bg-white/10">
                <PenLine className="h-[19px] w-[19px] text-white" />
              </span>
              <div>
                <b className="block text-[15px] font-semibold">Mémoire technique</b>
                <span className="text-[13.5px] text-[#AFC0D6]">Le mémoire GSS, adapté à chaque marché.</span>
              </div>
            </li>
          </ul>
        </div>
        <div className="relative z-[1] mt-auto hidden pt-10 text-[13px] text-[#8FA3BF] lg:block">
          Global Security Services · Rouen
        </div>
      </aside>

      <div className="flex min-w-0 items-start justify-center px-4 py-8 sm:items-center sm:p-10">
      <div className="w-full min-w-0 max-w-[420px] animate-monter [animation-delay:120ms]">
      <div
        data-mode={mode}
        className="group/auth overflow-hidden rounded-2xl border border-border bg-card shadow-o2"
      >
        {/* Accroche (texte d'accueil, suit l'onglet actif en CSS seul) */}
        <div className="px-6 pt-6 sm:px-[30px] sm:pt-[30px]">
          <div className="group-data-[mode=signup]/auth:hidden">
            <div className="font-display text-[26px] font-bold leading-[1.1] text-foreground">Bon retour</div>
            <p className="mt-1 text-[13.5px] text-muted-foreground">Connectez-vous pour accéder à vos dossiers.</p>
          </div>
          <div className="hidden group-data-[mode=signup]/auth:block">
            <div className="font-display text-[26px] font-bold leading-[1.1] text-foreground">Bienvenue</div>
            <p className="mt-1 text-[13.5px] text-muted-foreground">Créez votre compte pour accéder à vos dossiers.</p>
          </div>
        </div>
        {/* Sélecteur glissant */}
        <div className="px-6 pb-1 pt-5 sm:px-[30px]">
          <div className="relative flex rounded-[10px] bg-[#E9EDF3] p-1">
            <span
              aria-hidden
              className={cn(
                "absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-lg bg-card shadow-o1 transition-transform duration-300 ease-doux motion-reduce:transition-none",
                mode === "signup" && "translate-x-[100%]",
              )}
            />
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={cn(
                "relative z-10 flex-1 rounded-lg py-2 text-sm font-semibold transition-[color,scale] duration-150 active:scale-[.97]",
                mode === "login" ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              Connexion
            </button>
            <button
              type="button"
              onClick={() => switchMode("signup")}
              className={cn(
                "relative z-10 flex-1 rounded-lg py-2 text-sm font-semibold transition-[color,scale] duration-150 active:scale-[.97]",
                mode === "signup" ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              Inscription
            </button>
          </div>
        </div>

        {/* Piste coulissante : connexion | inscription */}
        <div className="overflow-hidden">
          <div
            className="flex w-[200%] transition-transform duration-300 ease-doux motion-reduce:transition-none"
            style={{ transform: mode === "signup" ? "translateX(-50%)" : "translateX(0)" }}
          >
            {/* Panneau CONNEXION */}
            <div className="w-1/2 shrink-0 px-6 pb-7 pt-1 sm:px-[30px] sm:pb-[30px]">
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className={labelCls}>Email</label>
                  <input
                    type="email"
                    required={mode === "login"}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputCls}
                    placeholder="vous@exemple.fr"
                  />
                </div>
                <div>
                  <label className={labelCls}>Mot de passe</label>
                  <input
                    type="password"
                    required={mode === "login"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputCls}
                    placeholder="••••••••"
                  />
                </div>
                {mode === "login" && error && (
                  <p className={erreurCls}>{error}</p>
                )}
                <Button type="submit" size="lg" className="mt-2 w-full" disabled={loading && mode === "login"}>
                  {loading && mode === "login" ? "Connexion…" : "Se connecter"}
                </Button>
              </form>
            </div>

            {/* Panneau INSCRIPTION */}
            <div className="w-1/2 shrink-0 px-6 pb-7 pt-1 sm:px-[30px] sm:pb-[30px]">
              {signupDone ? (
                <div className="flex animate-monter flex-col items-center gap-3 py-4 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-soft ring-4 ring-success-soft/60">
                    <MailCheck className="h-6 w-6 text-success" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Un email de confirmation a été envoyé à{" "}
                    <span className="font-medium text-foreground">{email}</span>. Clique
                    sur le lien reçu pour activer ton compte.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setSignupDone(false);
                      switchMode("login");
                    }}
                  >
                    Retour à la connexion
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSignup} className="space-y-4">
                  <div>
                    <label className={labelCls}>Email</label>
                    <input
                      type="email"
                      required={mode === "signup"}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={inputCls}
                      placeholder="vous@exemple.fr"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Mot de passe</label>
                    <input
                      type="password"
                      required={mode === "signup"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={inputCls}
                      placeholder="6 caractères minimum"
                    />
                  </div>
                  {mode === "signup" && error && (
                    <p className={erreurCls}>{error}</p>
                  )}
                  <Button type="submit" size="lg" className="mt-2 w-full" disabled={loading && mode === "signup"}>
                    {loading && mode === "signup" ? "Création…" : "Créer mon compte"}
                  </Button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>

      <p className="mt-5 text-center text-[13.5px] text-muted-foreground">
        {mode === "login" ? (
          <>
            Pas encore de compte ?{" "}
            <button
              type="button"
              onClick={() => switchMode("signup")}
              className="font-semibold text-primary underline-offset-4 hover:underline"
            >
              Créer un compte
            </button>
          </>
        ) : (
          <>
            Déjà un compte ?{" "}
            <button
              type="button"
              onClick={() => switchMode("login")}
              className="font-semibold text-primary underline-offset-4 hover:underline"
            >
              Se connecter
            </button>
          </>
        )}
      </p>
      </div>
      </div>
    </div>
  );
}
