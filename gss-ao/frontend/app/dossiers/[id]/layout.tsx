"use client";

import { DossierProvider } from "./dossier-context";
import { use } from "react";

/** Layout partagé de tous les onglets d'un dossier (/synthese, /memoire, /conformite…).
 *  Charge les données du dossier UNE SEULE FOIS et les partage via DossierContext. */
export default function DossierLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const id = params.id;
  return <DossierProvider id={id}>{children}</DossierProvider>;
}
