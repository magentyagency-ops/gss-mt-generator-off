import { Library } from "lucide-react";

export default function BasePage() {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border bg-card px-6 py-4">
        <h1 className="text-xl font-semibold">Base de connaissances</h1>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center text-center p-6">
        <Library className="mb-3 h-10 w-10 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Base de connaissances — SLIDE REP AO</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          118 slides réutilisables, 21 catégories, indexées pour le RAG. Explorateur de la base prévu
          dans une prochaine itération.
        </p>
      </div>
    </div>
  );
}
