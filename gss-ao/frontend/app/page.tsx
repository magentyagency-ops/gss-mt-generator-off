"use client";

import { useState } from 'react';

export default function Home() {
  const [dossierId, setDossierId] = useState('rouen');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const generateMemoire = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`http://localhost:8000/api/dce/${dossierId}/memoire`, {
        method: 'POST',
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur inconnue');
      
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ fontFamily: "system-ui", padding: 40, maxWidth: 800, margin: '0 auto' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '1rem', color: '#1a1a1a' }}>
        GSS-AO — Générateur de Mémoire Technique
      </h1>
      <p style={{ color: '#666', marginBottom: '2rem' }}>
        Cet outil utilise l'IA pour personnaliser automatiquement votre modèle générique selon le contexte du DCE (CCTP, RC). Il remplit également les cases à cocher et les tableaux.
      </p>

      <form onSubmit={generateMemoire} style={{ display: 'flex', gap: '10px', marginBottom: '2rem' }}>
        <input 
          type="text" 
          value={dossierId}
          onChange={(e) => setDossierId(e.target.value)}
          placeholder="ID du dossier (ex: rouen)"
          style={{ padding: '10px', fontSize: '1rem', border: '1px solid #ccc', borderRadius: '4px', flex: 1 }}
          required
        />
        <button 
          type="submit" 
          disabled={loading}
          style={{ 
            padding: '10px 20px', fontSize: '1rem', 
            backgroundColor: loading ? '#ccc' : '#0070f3', 
            color: 'white', border: 'none', borderRadius: '4px', cursor: loading ? 'not-allowed' : 'pointer' 
          }}
        >
          {loading ? 'Génération en cours...' : 'Générer le document'}
        </button>
      </form>

      {error && (
        <div style={{ padding: '15px', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '4px', marginBottom: '2rem' }}>
          <strong>Erreur:</strong> {error}
        </div>
      )}

      {result && (
        <div style={{ padding: '20px', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#f9fafb' }}>
          <h2 style={{ fontSize: '1.2rem', color: '#047857', marginBottom: '10px' }}>✅ {result.message}</h2>
          <p style={{ marginBottom: '15px' }}>
            <strong>Fichier enregistré dans :</strong> <br/>
            <code style={{ backgroundColor: '#e5e7eb', padding: '2px 6px', borderRadius: '4px' }}>{result.file_path}</code>
          </p>
          
          <h3 style={{ fontSize: '1rem', marginBottom: '10px' }}>Rapport de personnalisation de l'IA :</h3>
          <ul style={{ marginBottom: '15px', paddingLeft: '20px' }}>
            <li>Modifications suggérées par l'IA : <strong>{result.data_generee_par_ia.total_suggestions}</strong></li>
            <li>Modifications injectées avec succès : <strong>{result.data_generee_par_ia.modifications_reussies}</strong></li>
          </ul>

          <details>
            <summary style={{ cursor: 'pointer', color: '#0070f3' }}>Voir les détails des remplacements (JSON)</summary>
            <pre style={{ backgroundColor: '#1f2937', color: '#f3f4f6', padding: '15px', borderRadius: '4px', marginTop: '10px', overflowX: 'auto', fontSize: '0.85rem' }}>
              {JSON.stringify(JSON.parse(result.data_generee_par_ia.details), null, 2)}
            </pre>
          </details>
        </div>
      )}
    </main>
  );
}
