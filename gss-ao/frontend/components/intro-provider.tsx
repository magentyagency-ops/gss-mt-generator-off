"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type IntroContextValue = { introFinished: boolean };

const IntroContext = createContext<IntroContextValue>({ introFinished: false });

export const useIntro = () => useContext(IntroContext);

export function IntroProvider({ children }: { children: React.ReactNode }) {
  // false par défaut : l'intro n'a pas encore été jouée.
  const [introFinished, setIntroFinished] = useState(false);
  // Passe à true à 2.5s : déclenche l'estompage de l'overlay et révèle l'app.
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    // 2.5s : l'overlay s'estompe (opacité 0 + scale 105) et l'app apparaît.
    const tReveal = setTimeout(() => setRevealed(true), 2500);
    // 3.2s : l'overlay est démonté, introFinished passe à true.
    const tFinish = setTimeout(() => setIntroFinished(true), 3200);
    return () => {
      clearTimeout(tReveal);
      clearTimeout(tFinish);
    };
  }, []);

  return (
    <IntroContext.Provider value={{ introFinished }}>
      {/* CRITIQUE (anti-FOUC) : l'app reste cachée derrière l'intro tant que
          l'intro n'est pas finie ET qu'on est avant 2.5s, puis apparaît en fondu. */}
      <div
        style={{
          opacity: !introFinished && !revealed ? 0 : 1,
          transition: "opacity 0.7s ease",
        }}
      >
        {children}
      </div>

      {!introFinished && (
        <div
          className={cn(
            "fixed inset-0 z-50 flex flex-col items-center justify-center bg-white bg-[radial-gradient(circle_at_50%_42%,#F1F5FB_0%,#FFFFFF_55%)] transition-all duration-700 ease-out",
            revealed && "scale-105 opacity-0",
          )}
        >
          {/* Logo qui "pulse" */}
          <img
            src="/gssAO.png"
            alt="GSS-AO"
            className="h-44 w-44 animate-pulse object-contain drop-shadow-[0_18px_30px_rgba(11,37,69,0.18)]"
          />
          {/* Titre : texte en dégradé, animation slide-up */}
          <div className="mt-6 overflow-hidden">
            <h1 className="animate-slide-up bg-gradient-to-r from-primary via-signal to-primary bg-clip-text pb-1 text-3xl font-bold tracking-tight text-transparent sm:text-4xl">
              Générateur de Mémoire
            </h1>
          </div>
          {/* Fil de chargement décoratif (se remplit pendant l'intro, durées inchangées). */}
          <div aria-hidden="true" className="mt-7 h-[3px] w-40 overflow-hidden rounded-full bg-secondary">
            <div className="h-full origin-left animate-[remplir_2.3s_cubic-bezier(.2,.7,.2,1)_both] rounded-full bg-gradient-to-r from-primary to-signal" />
          </div>
        </div>
      )}
    </IntroContext.Provider>
  );
}
