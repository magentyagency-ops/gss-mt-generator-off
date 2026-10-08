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
    <div className="relative w-full rounded-xl border border-border bg-secondary mt-6 shadow-inner">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/90 z-10 rounded-xl">
          <div className="flex flex-col items-center text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mb-4" />
            <p>Rendu du document Word en cours...</p>
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
