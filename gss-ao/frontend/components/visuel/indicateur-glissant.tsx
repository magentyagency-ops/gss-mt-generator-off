"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/* Dernière position connue par groupe (variable de module, aucun stockage) : permet de
   glisser aussi d'une page à l'autre (ex. fil des étapes d'un dossier). */
const positions = new Map<string, { x: number; y: number; l: number; h: number }>();

/* useLayoutEffect côté navigateur seulement (évite l'avertissement du rendu serveur). */
const useEffetDeMesure = typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

/**
 * Indicateur qui glisse jusqu'à l'onglet / l'étape actif (point 4 de Clarence).
 * À poser comme enfant d'un conteneur `relative isolate` dont l'élément actif porte
 * `data-actif="true"` (les onglets eux-mêmes restent inchangés). Purement visuel : il mesure
 * la géométrie de l'élément actif après chaque rendu et déplace son propre nœud (transform),
 * sans état React, sans requête, sans toucher aux onglets ; transitions coupées en mouvement réduit.
 * - forme="fond"   : fond blanc de l'onglet actif (contrôle segmenté) — classe par défaut fournie ;
 * - forme="trait"  : trait de 2 px sous l'élément actif ;
 * - forme="liseré" : liseré vertical de 3 px à gauche.
 * Usage : <div className="relative isolate inline-flex …"><IndicateurGlissant groupe="filtres-dossiers" />{onglets}</div>
 */
export function IndicateurGlissant({
  groupe,
  forme = "fond",
  selecteur = '[data-actif="true"]',
  className,
}: {
  groupe?: string;
  forme?: "fond" | "trait" | "liseré";
  selecteur?: string;
  className?: string;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);

  useEffetDeMesure(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const reduit =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const mesurer = () => {
      const cible = parent.querySelector<HTMLElement>(selecteur);
      if (!cible) return null;
      const x = cible.offsetLeft;
      let y = cible.offsetTop;
      const l = cible.offsetWidth;
      const h = cible.offsetHeight;
      if (forme === "trait") y = y + h - 2;
      return { x, y, l, h };
    };
    const appliquer = (p: { x: number; y: number; l: number; h: number }, anime: boolean) => {
      el.style.transition = anime && !reduit ? "" : "none";
      el.style.opacity = "1";
      if (forme === "liseré") {
        el.style.transform = `translate(${p.x - 3}px, ${p.y + p.h * 0.2}px)`;
        el.style.width = "3px";
        el.style.height = `${p.h * 0.6}px`;
      } else {
        el.style.transform = `translate(${p.x}px, ${p.y}px)`;
        el.style.width = `${p.l}px`;
        el.style.height = forme === "trait" ? "2px" : `${p.h}px`;
      }
    };

    const p = mesurer();
    if (!p) {
      el.style.opacity = "0";
      return;
    }
    const precedente = groupe ? positions.get(groupe) : undefined;
    const dejaPlace = el.style.opacity === "1";
    if (!dejaPlace && precedente && !reduit) {
      // Arrivée sur une nouvelle page : part de la dernière position connue du groupe.
      appliquer(precedente, false);
      void el.offsetWidth;
      appliquer(p, true);
    } else {
      appliquer(p, dejaPlace);
    }
    if (groupe) positions.set(groupe, p);

    // Recalage sans animation si la géométrie change (fenêtre, polices chargées).
    let derniere = p;
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => {
      const q = mesurer();
      if (q && (q.x !== derniere.x || q.y !== derniere.y || q.l !== derniere.l || q.h !== derniere.h)) {
        derniere = q;
        appliquer(q, false);
        if (groupe) positions.set(groupe, q);
      }
    }) : null;
    ro?.observe(parent);
    return () => ro?.disconnect();
  });

  return (
    <span
      ref={ref}
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute left-0 top-0 -z-10 opacity-0 transition-[transform,width,height,opacity] duration-300 ease-doux motion-reduce:transition-none",
        forme === "fond" && "rounded-lg bg-card shadow-o1",
        forme === "trait" && "rounded-full bg-signal",
        forme === "liseré" && "rounded-r-[3px] bg-signal",
        className,
      )}
    />
  );
}
