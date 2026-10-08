"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import * as docx from "docx-preview";

export function DocxPreviewViewer({
  fileUrl,
  onRendered,
}: {
  fileUrl: string;
  /** Optionnel : appelé une fois le document rendu (ex. rendre cliquables les « [À COMPLÉTER] »). */
  onRendered?: (container: HTMLDivElement) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    
    async function loadDocx() {
      try {
        setLoading(true);
        setError("");
        
        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error("Failed to fetch document");
        
        const blob = await response.blob();
        
        if (containerRef.current && isMounted) {
          await docx.renderAsync(blob, containerRef.current, undefined, {
            className: "docx-preview-rendered",
            inWrapper: true,
            ignoreWidth: false,
            ignoreHeight: false,
            ignoreFonts: false,
            breakPages: true,
            useBase64URL: true,
          });
          if (isMounted && onRendered && containerRef.current) onRendered(containerRef.current);
        }
      } catch (err: any) {
        if (isMounted) setError(err.message || "An error occurred");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadDocx();

    return () => {
      isMounted = false;
    };
  }, [fileUrl]);

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-border bg-secondary mt-6 shadow-inner">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-secondary/95 z-10 rounded-xl">
          {/* Page fantôme (décorative) pendant le rendu ; le texte existant reste affiché. */}
          <div aria-hidden="true" className="absolute inset-x-0 top-8 mx-auto h-[600px] w-[min(520px,85%)] space-y-3 rounded-md bg-card p-8 shadow-o2">
            <div className="squelette h-5 w-1/2" />
            <div className="squelette h-3 w-full" />
            <div className="squelette h-3 w-11/12" />
            <div className="squelette h-3 w-4/5" />
            <div className="squelette mt-6 h-24 w-full rounded-lg" />
            <div className="squelette h-3 w-full" />
            <div className="squelette h-3 w-3/4" />
          </div>
          <div className="relative flex flex-col items-center rounded-xl bg-card/95 px-6 py-4 text-muted-foreground shadow-o1">
            <Loader2 className="h-7 w-7 animate-spin mb-3 text-primary" />
            <p className="text-sm font-medium">Rendu du document Word en cours...</p>
          </div>
        </div>
      )}
      
      {error && (
        <div className="absolute inset-0 flex animate-apparaitre items-center justify-center bg-destructive-soft text-destructive p-6 z-10 text-center rounded-xl border border-[#F2C3C8]">
          <p><strong>Erreur de prévisualisation :</strong> {error}</p>
        </div>
      )}
      
      <div 
        ref={containerRef} 
        className="w-full h-[700px] overflow-auto px-4 py-8"
        style={{
          /* Style tweaks for docx-preview to make it look like a page */
          display: "flex",
          flexDirection: "column",
          alignItems: "center"
        }}
      />
    </div>
  );
}
