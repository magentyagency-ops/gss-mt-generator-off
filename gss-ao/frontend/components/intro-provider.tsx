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
            "fixed inset-0 z-50 flex flex-col items-center justify-center bg-white transition-all duration-700 ease-out",
            revealed && "scale-105 opacity-0",
          )}
        >
          {/* Logo qui "pulse" */}
          <img
            src="/gssAO.png"
            alt="GSS-AO"
            className="h-44 w-44 animate-pulse object-contain"
          />
          {/* Titre : texte en dégradé, animation slide-up */}
          <div className="mt-6 overflow-hidden">
            <h1 className="animate-slide-up bg-gradient-to-r from-black via-red-600 to-black bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl">
              Générateur de Mémoire
            </h1>
          </div>
        </div>
      )}
    </IntroContext.Provider>
  );
}
