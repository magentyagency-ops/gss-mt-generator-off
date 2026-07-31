"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface DossierContextValue {
  /** Données du dossier (null = en cours de chargement). */
  dossier: any | null;
  /** True pendant le chargement initial (pas les refreshs). */
  loading: boolean;
  /** Force un rechargement (ex. après upload DCE, détection, génération…). */
  refresh: () => void;
}

const DossierContext = createContext<DossierContextValue>({
  dossier: null,
  loading: true,
  refresh: () => {},
});

export function DossierProvider({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const [dossier, setDossier] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    // Pas de loading spinner sur les refreshs (seulement le 1er chargement).
    if (tick === 0) setLoading(true);
    apiFetch(`/api/dossiers/${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && !data.error) setDossier(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, tick]);

  return (
    <DossierContext.Provider value={{ dossier, loading, refresh }}>
      {children}
    </DossierContext.Provider>
  );
}

/** Hook pour accéder aux données du dossier depuis n'importe quel onglet enfant. */
export function useDossier() {
  return useContext(DossierContext);
}
