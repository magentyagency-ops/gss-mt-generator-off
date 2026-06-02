// Page d'accueil — scaffold non fonctionnel (itération 1).
// Le workflow guidé (upload -> synthèse -> check-list -> mémoire -> BPU -> export)
// du brief §8.3 sera implémenté lors d'une itération ultérieure.

export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui", padding: 32, maxWidth: 720 }}>
      <h1>GSS-AO — Automatisation appels d&apos;offres</h1>
      <p>
        Scaffold front-end (itération 1). Le backend expose les parseurs RC/CCTP
        et l&apos;ingestion RAG ; l&apos;interface guidée arrive ensuite.
      </p>
      <ol>
        <li>Upload DCE</li>
        <li>Fiche de synthèse</li>
        <li>Check-list de conformité</li>
        <li>Génération mémoire technique</li>
        <li>BPU (assistant)</li>
        <li>Export DOCX / PDF</li>
      </ol>
    </main>
  );
}
