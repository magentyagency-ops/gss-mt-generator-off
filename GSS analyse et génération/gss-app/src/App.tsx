import { useState, useEffect } from 'react';
import { 
  CheckCircle2, 
  AlertTriangle, 
  FileText, 
  Key, 
  RefreshCw, 
  Play, 
  Building, 
  Layers, 
  Shield, 
  FileSpreadsheet,
  AlertCircle,
  Pencil
} from 'lucide-react';

interface FileInfo {
  name: string;
  relative: string;
  category: string;
  size: number;
  ext: string;
}

interface Checklist {
  hasCCTP: boolean;
  hasRC: boolean;
  hasVisitReport: boolean;
  hasBPU: boolean;
  hasTemplateClient: boolean;
  templateName: string | null;
}

interface ScanResponse {
  workspacePath: string;
  files: FileInfo[];
  checklist: Checklist;
}

interface SiteInfo {
  name: string;
  requirements: string;
}

interface OperationalSummary {
  agentProfiles: string;
  totalAgentsRequired: string;
  uniforms: string;
  equipment: string;
  qualityControls: string;
}

interface AnalysisData {
  clientName: string;
  projectTitle: string;
  duration: string;
  visitMandatory: boolean;
  visitDetails: string;
  sites: SiteInfo[];
  operationalSummary: OperationalSummary;
  legalRequirements: string;
  keyRisks: string[];
  proposalStrengths: string[];
  anticipatedIssues?: string[];
}

export default function App() {
  // Config & API
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('openai_api_key') || '');
  const [showKey, setShowKey] = useState<boolean>(false);
  
  // Workspace files & checklist
  const [workspacePath, setWorkspacePath] = useState<string>('');
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [checklist, setChecklist] = useState<Checklist>({
    hasCCTP: false,
    hasRC: false,
    hasVisitReport: false,
    hasBPU: false,
    hasTemplateClient: false,
    templateName: null
  });
  const [isScanning, setIsScanning] = useState<boolean>(false);

  // States for flow
  const [step, setStep] = useState<number>(1);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisData | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationResult, setGenerationResult] = useState<{
    success: boolean;
    outputPath: string;
    filename: string;
    format: string;
  } | null>(null);

  // Custom report name
  const [customReportName, setCustomReportName] = useState<string>('');
  const [editingReportName, setEditingReportName] = useState<boolean>(false);
  
  // Slides selection states
  const [isAnalyzingSlides, setIsAnalyzingSlides] = useState<boolean>(false);
  const [slides, setSlides] = useState<any[]>([]);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [slideChapterFilter, setSlideChapterFilter] = useState<string>('all');
  const [slideSearchQuery, setSlideSearchQuery] = useState<string>('');

  const [error, setError] = useState<string | null>(null);

  // Auto scan on load
  useEffect(() => {
    scanWorkspace();
  }, []);

  // Auto-fill report name when analysis is done
  useEffect(() => {
    if (analysisResult) {
      const today = new Date().toLocaleDateString('fr-FR').replace(/\//g, '-');
      const cleanName = (analysisResult.clientName || 'Client')
        .replace(/[<>:"/\\|?*\s]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
      setCustomReportName(`Memoire_Technique_${cleanName}_${today}`);
    }
  }, [analysisResult]);

  // Save API key
  const handleSaveApiKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem('openai_api_key', key);
    setError(null);
  };

  const scanWorkspace = async () => {
    setIsScanning(true);
    setError(null);
    try {
      const res = await fetch('/api/scan');
      if (!res.ok) throw new Error('Erreur lors du scan du dossier');
      const data: ScanResponse = await res.json();
      setWorkspacePath(data.workspacePath);
      setFiles(data.files);
      setChecklist(data.checklist);
      
      if (data.checklist.hasCCTP) {
        setStep(2);
      } else {
        setStep(1);
      }
    } catch (err: any) {
      setError(err.message || 'Impossible de se connecter au serveur backend');
    } finally {
      setIsScanning(false);
    }
  };

  const startAnalysis = async () => {
    if (!apiKey) {
      setError('Veuillez saisir votre clé API OpenAI dans la zone de configuration.');
      return;
    }
    setIsAnalyzing(true);
    setError(null);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "L'analyse a échoué");
      setAnalysisResult(data);
      setStep(3);

      // Trigger slide analysis if we are in slide PDF generation mode (Cas B)
      if (!data.checklist?.hasTemplateClient && !checklist.hasTemplateClient) {
        setIsAnalyzingSlides(true);
        try {
          const resSlides = await fetch('/api/analyze-slides', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey, analysisData: data })
          });
          const dataSlides = await resSlides.json();
          if (resSlides.ok) {
            setSlides(dataSlides.slides || []);
            // Pre-select recommended slides
            const preselected = (dataSlides.slides || [])
              .filter((s: any) => s.recommendation === 'keep' || s.recommendation === 'modify')
              .map((s: any) => s.pageNumber);
            setSelectedPages(preselected);
          }
        } catch (err: any) {
          console.error("Erreur lors de l'analyse des diapos:", err);
        } finally {
          setIsAnalyzingSlides(false);
        }
      }
    } catch (err: any) {
      setError(err.message || "Une erreur est survenue lors de l'analyse");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const triggerGeneration = async () => {
    if (!apiKey || !analysisResult) return;
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          apiKey, 
          analysisData: analysisResult, 
          customReportName,
          selectedPages: checklist.hasTemplateClient ? undefined : selectedPages
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'La génération a échoué');
      setGenerationResult(data);
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue lors de la génération');
    } finally {
      setIsGenerating(false);
    }
  };

  const resetAll = () => {
    setAnalysisResult(null);
    setGenerationResult(null);
    setCustomReportName('');
    setEditingReportName(false);
    setSlides([]);
    setSelectedPages([]);
    setSlideChapterFilter('all');
    setSlideSearchQuery('');
    setError(null);
    scanWorkspace();
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="app-wrapper">
      {/* Header */}
      <header>
        <div className="logo-container">
          <span className="logo-main">GSS</span>
          <span className="logo-sub">Sécurité Privée</span>
        </div>
        <h1>Générateur de Mémoire Technique</h1>
        <div className="step-container" style={{ width: '250px', marginBottom: 0 }}>
          <div className={`step ${step >= 1 ? 'active' : ''}`}>
            <span className="step-num">1</span> Dossier
          </div>
          <div className={`step ${step >= 2 ? 'active' : ''}`}>
            <span className="step-num">2</span> Analyse
          </div>
          <div className={`step ${step >= 3 ? 'active' : ''}`}>
            <span className="step-num">3</span> Mémoire
          </div>
        </div>
      </header>

      {/* OpenAI Configuration */}
      <section className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Key className="dropzone-icon" size={20} />
            <div>
              <h3 style={{ fontSize: '1rem' }}>Configuration OpenAI GPT</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Saisissez votre clé API pour activer la rédaction automatique et l'analyse de documents.
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flex: 1, maxWidth: '500px' }}>
            <input 
              type={showKey ? 'text' : 'password'}
              placeholder="sk-..." 
              value={apiKey}
              onChange={(e) => handleSaveApiKey(e.target.value)}
              style={{ padding: '0.5rem 0.75rem', fontSize: '0.9rem' }}
            />
            <button 
              className="btn btn-secondary"
              onClick={() => setShowKey(!showKey)}
              style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
            >
              {showKey ? 'Masquer' : 'Afficher'}
            </button>
          </div>
        </div>
      </section>

      {/* Error Alert */}
      {error && (
        <div className="card" style={{ borderLeft: '4px solid var(--state-error)', background: 'rgba(239, 68, 68, 0.08)', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <AlertCircle style={{ color: 'var(--state-error)' }} size={24} />
          <div style={{ color: 'var(--text-bright)' }}>{error}</div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid-2">
        
        {/* Left Column: Checklist & Files */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2>Checklist d'Audit GIS</h2>
            <button 
              className="btn btn-secondary" 
              onClick={scanWorkspace}
              disabled={isScanning}
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
            >
              <RefreshCw size={14} className={isScanning ? 'pulse' : ''} /> Actualiser
            </button>
          </div>

          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.75rem 1rem' }}>
            Dossier d'entrée : <code style={{ wordBreak: 'break-all' }}>{workspacePath || 'Chargement...'}</code>
          </div>

          {/* Checklist Statuses */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <div className={`checklist-item ${checklist.hasCCTP ? 'present' : 'missing'}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Shield size={18} style={{ color: checklist.hasCCTP ? 'var(--state-success)' : 'var(--state-error)' }} />
                <span>CCTP / CCP (Exigences techniques)</span>
              </div>
              <span className={`badge ${checklist.hasCCTP ? 'badge-success' : 'badge-error'}`}>
                {checklist.hasCCTP ? 'Présent' : 'Requis'}
              </span>
            </div>

            <div className={`checklist-item ${checklist.hasRC ? 'present' : 'missing'}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <FileText size={18} style={{ color: checklist.hasRC ? 'var(--state-success)' : 'var(--state-error)' }} />
                <span>Règlement de Consultation (RC)</span>
              </div>
              <span className={`badge ${checklist.hasRC ? 'badge-success' : 'badge-error'}`}>
                {checklist.hasRC ? 'Présent' : 'Requis'}
              </span>
            </div>

            <div className={`checklist-item ${checklist.hasVisitReport ? 'present' : 'missing'}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Building size={18} style={{ color: checklist.hasVisitReport ? 'var(--state-success)' : 'var(--state-warning)' }} />
                <span>Rapport de Visite de Sacha</span>
              </div>
              <span className={`badge ${checklist.hasVisitReport ? 'badge-success' : 'badge-warning'}`}>
                {checklist.hasVisitReport ? 'Présent' : 'Recommandé (60% valeur)'}
              </span>
            </div>

            <div className={`checklist-item ${checklist.hasBPU ? 'present' : 'missing'}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <FileSpreadsheet size={18} style={{ color: checklist.hasBPU ? 'var(--state-success)' : 'var(--state-warning)' }} />
                <span>BPU / DPGF (Chiffrage)</span>
              </div>
              <span className={`badge ${checklist.hasBPU ? 'badge-success' : 'badge-warning'}`}>
                {checklist.hasBPU ? 'Présent' : 'Recommandé'}
              </span>
            </div>

            {/* Template Client — enriched display */}
            <div
              className="checklist-item"
              style={{
                borderLeft: `4px solid ${checklist.hasTemplateClient ? 'var(--state-success)' : 'var(--accent-blue)'}`,
                background: checklist.hasTemplateClient ? 'rgba(34,197,94,0.05)' : undefined
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                <Layers size={18} style={{ color: checklist.hasTemplateClient ? 'var(--state-success)' : 'var(--accent-blue)' }} />
                <div>
                  <span>Template Mémoire Client (.docx)</span>
                  {checklist.hasTemplateClient && checklist.templateName && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      📄 {checklist.templateName}
                    </div>
                  )}
                </div>
              </div>
              <span
                className="badge"
                style={{
                  background: checklist.hasTemplateClient ? 'rgba(34,197,94,0.15)' : 'rgba(59,130,246,0.15)',
                  color: checklist.hasTemplateClient ? 'var(--state-success)' : 'var(--accent-blue)'
                }}
              >
                {checklist.hasTemplateClient ? '✓ Détecté – Mode Word A-Z' : 'Absent – Mode Slides GSS'}
              </span>
            </div>
          </div>

          {/* Files List */}
          <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: 'var(--text-bright)' }}>Fichiers scannés dans le dossier</h3>
            <div className="file-list">
              {files.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Aucun fichier trouvé. Veuillez déposer vos documents d'appel d'offres dans le dossier de l'application.
                </div>
              ) : (
                files.map((file, idx) => (
                  <div key={idx} className="file-item">
                    <span className="file-name">{file.name}</span>
                    <div className="file-meta">
                      <span style={{ color: 'var(--accent-gold)' }}>{file.category}</span>
                      <span>{formatSize(file.size)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Steps Execution */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {step === 1 && (
            <div style={{ textAlign: 'center', padding: '3rem 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
              <AlertTriangle className="dropzone-icon" size={60} style={{ color: 'var(--state-error)' }} />
              <div>
                <h2>Fichier CCTP manquant</h2>
                <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                  Pour commencer l'analyse, veuillez placer au moins le fichier CCTP (format .docx ou .pdf) dans votre dossier d'appel d'offres :
                  <br />
                  <code>c:\Users\linal\Downloads\GSS analyse et génération</code>
                </p>
              </div>
              <button className="btn btn-primary" onClick={scanWorkspace}>
                <RefreshCw size={18} /> Vérifier à nouveau
              </button>
            </div>
          )}

          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', height: '100%', justifyContent: 'center' }}>
              {!isAnalyzing ? (
                <div style={{ textAlign: 'center', padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
                  <CheckCircle2 className="dropzone-icon" size={60} style={{ color: 'var(--state-success)' }} />
                  <div>
                    <h2>Dossier Prêt pour l'Analyse</h2>
                    <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                      Le CCTP et le règlement de consultation ont été détectés. L'IA va extraire toutes les contraintes opérationnelles, les profils d'agents, le matériel requis, les plannings et les risques spécifiques du site.
                    </p>
                  </div>

                  {/* Mode indicator */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    background: checklist.hasTemplateClient ? 'rgba(34,197,94,0.08)' : 'rgba(59,130,246,0.08)',
                    border: `1px solid ${checklist.hasTemplateClient ? 'rgba(34,197,94,0.3)' : 'rgba(59,130,246,0.3)'}`,
                    borderRadius: '10px', padding: '0.75rem 1.25rem', width: '100%', maxWidth: '480px'
                  }}>
                    <Layers size={20} style={{ color: checklist.hasTemplateClient ? 'var(--state-success)' : 'var(--accent-blue)', flexShrink: 0 }} />
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-bright)' }}>
                        {checklist.hasTemplateClient
                          ? `Mode : Remplissage Word A-Z`
                          : 'Mode : Génération Slides GSS'}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {checklist.hasTemplateClient
                          ? `Template détecté : ${checklist.templateName} — GPT-4o va remplir chaque section de A à Z`
                          : 'GPT-4o va créer des slides personnalisées agents + matériel + contexte'}
                      </div>
                    </div>
                  </div>

                  <button className="btn btn-primary btn-lg" onClick={startAnalysis} style={{ padding: '1rem 2rem', fontSize: '1.1rem' }}>
                    <Play size={18} /> Lancer l'analyse IA
                  </button>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '4rem 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
                  <div className="loader-spinner" style={{ width: '48px', height: '48px' }}></div>
                  <div className="pulse">
                    <h2>Analyse intelligente en cours...</h2>
                    <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                      GPT-4o-mini parcourt le CCTP, le RC, le rapport de visite et le BPU.
                      <br />
                      Extraction des profils agents, matériels et contraintes opérationnelles...
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 3 && analysisResult && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              {!isGenerating && !generationResult && (
                <>
                  <h2>Synthèse Opérationnelle & Rédaction</h2>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '500px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                    
                    <div className="form-group">
                      <label>Nom du Client (Donneur d'Ordre)</label>
                      <input 
                        type="text" 
                        value={analysisResult.clientName} 
                        onChange={(e) => setAnalysisResult({ ...analysisResult, clientName: e.target.value })} 
                      />
                    </div>

                    <div className="form-group">
                      <label>Intitulé du Marché public</label>
                      <input 
                        type="text" 
                        value={analysisResult.projectTitle} 
                        onChange={(e) => setAnalysisResult({ ...analysisResult, projectTitle: e.target.value })} 
                      />
                    </div>

                    <div className="grid-2" style={{ gap: '1rem' }}>
                      <div className="form-group">
                        <label>Durée du Marché</label>
                        <input 
                          type="text" 
                          value={analysisResult.duration} 
                          onChange={(e) => setAnalysisResult({ ...analysisResult, duration: e.target.value })} 
                        />
                      </div>
                      <div className="form-group">
                        <label>Visite Obligatoire</label>
                        <select 
                          value={analysisResult.visitMandatory ? 'yes' : 'no'} 
                          onChange={(e) => setAnalysisResult({ ...analysisResult, visitMandatory: e.target.value === 'yes' })}
                        >
                          <option value="yes">Oui</option>
                          <option value="no">Non</option>
                        </select>
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Observations Terrain & Visite</label>
                      <textarea 
                        rows={3}
                        value={analysisResult.visitDetails} 
                        onChange={(e) => setAnalysisResult({ ...analysisResult, visitDetails: e.target.value })} 
                      />
                    </div>

                    <div className="form-group">
                      <label>Profils d'Agents requis (CQP/SSIAP/Effectif total)</label>
                      <input 
                        type="text" 
                        value={analysisResult.operationalSummary.agentProfiles} 
                        onChange={(e) => setAnalysisResult({ 
                          ...analysisResult, 
                          operationalSummary: { ...analysisResult.operationalSummary, agentProfiles: e.target.value } 
                        })} 
                      />
                    </div>

                    <div className="form-group">
                      <label>Équipements & Moyens Techniques (PTI, Contrôle de rondes, Radios…)</label>
                      <textarea 
                        rows={2}
                        value={analysisResult.operationalSummary.equipment} 
                        onChange={(e) => setAnalysisResult({ 
                          ...analysisResult, 
                          operationalSummary: { ...analysisResult.operationalSummary, equipment: e.target.value } 
                        })} 
                      />
                    </div>

                    <div className="form-group">
                      <label>Exigences légales & formations requises</label>
                      <input 
                        type="text" 
                        value={analysisResult.legalRequirements || ''} 
                        onChange={(e) => setAnalysisResult({ ...analysisResult, legalRequirements: e.target.value })} 
                      />
                    </div>

                    <div className="form-group">
                      <label>Arguments Différenciants GIS (Un par ligne)</label>
                      <textarea 
                        rows={3}
                        value={analysisResult.proposalStrengths ? analysisResult.proposalStrengths.join('\n') : ''} 
                        onChange={(e) => setAnalysisResult({ 
                          ...analysisResult, 
                          proposalStrengths: e.target.value.split('\n')
                        })} 
                      />
                    </div>

                    <div className="form-group">
                      <label>Problématiques Terrain Anticipées (Une par ligne)</label>
                      <textarea 
                        rows={3}
                        value={analysisResult.anticipatedIssues ? analysisResult.anticipatedIssues.join('\n') : ''} 
                        onChange={(e) => setAnalysisResult({ 
                          ...analysisResult, 
                          anticipatedIssues: e.target.value.split('\n')
                        })} 
                      />
                    </div>
                  </div>

                  {/* Diapositives Selection Panel for PDF mode (Cas B) */}
                  {!checklist.hasTemplateClient && (
                    <div className="slides-panel">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                        <div>
                          <h3 style={{ fontSize: '1.1rem', color: 'var(--text-bright)' }}>Sélecteur et Personnalisation des Diapositives GSS</h3>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Sélectionnez et personnalisez individuellement les pages du mémoire technique maître.
                          </p>
                        </div>
                        {isAnalyzingSlides && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div className="loader-spinner" style={{ width: '16px', height: '16px' }}></div>
                            <span style={{ fontSize: '0.8rem', color: 'var(--accent-gold)' }} className="pulse">Analyse des diapos par l'IA...</span>
                          </div>
                        )}
                      </div>

                      {/* Chapter Tabs */}
                      <div className="slides-tabs">
                        <button 
                          className={`slide-tab ${slideChapterFilter === 'all' ? 'active' : ''}`}
                          onClick={() => setSlideChapterFilter('all')}
                        >
                          Toutes ({slides.length})
                        </button>
                        <button 
                          className={`slide-tab ${slideChapterFilter === 'I' ? 'active' : ''}`}
                          onClick={() => setSlideChapterFilter('I')}
                        >
                          Ch. I : Présentation ({slides.filter(s => s.pageNumber <= 30).length})
                        </button>
                        <button 
                          className={`slide-tab ${slideChapterFilter === 'II' ? 'active' : ''}`}
                          onClick={() => setSlideChapterFilter('II')}
                        >
                          Ch. II : Moyens Humains ({slides.filter(s => s.pageNumber > 30 && s.pageNumber <= 68).length})
                        </button>
                        <button 
                          className={`slide-tab ${slideChapterFilter === 'III' ? 'active' : ''}`}
                          onClick={() => setSlideChapterFilter('III')}
                        >
                          Ch. III : Moyens Opérationnels ({slides.filter(s => s.pageNumber > 68 && s.pageNumber <= 91).length})
                        </button>
                        <button 
                          className={`slide-tab ${slideChapterFilter === 'IV' ? 'active' : ''}`}
                          onClick={() => setSlideChapterFilter('IV')}
                        >
                          Ch. IV : Moyens Organisationnels ({slides.filter(s => s.pageNumber > 91).length})
                        </button>
                      </div>

                      {/* Search Bar */}
                      <div className="slides-search-bar">
                        <input 
                          type="text"
                          placeholder="Rechercher une diapositive par mot-clé (ex: écologique, rondes)..."
                          value={slideSearchQuery}
                          onChange={(e) => setSlideSearchQuery(e.target.value)}
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                        />
                        {slideSearchQuery && (
                          <button 
                            className="btn btn-secondary"
                            onClick={() => setSlideSearchQuery('')}
                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                          >
                            Effacer
                          </button>
                        )}
                      </div>

                      {/* Slides list */}
                      <div className="slides-list-container">
                        {slides.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            {isAnalyzingSlides ? "Analyse en cours..." : "Lancez l'analyse IA ci-dessus pour obtenir les recommandations de diapositives."}
                          </div>
                        ) : (
                          slides
                            .filter(slide => {
                              // Chapter Filter
                              if (slideChapterFilter === 'I' && slide.pageNumber > 30) return false;
                              if (slideChapterFilter === 'II' && (slide.pageNumber <= 30 || slide.pageNumber > 68)) return false;
                              if (slideChapterFilter === 'III' && (slide.pageNumber <= 68 || slide.pageNumber > 91)) return false;
                              if (slideChapterFilter === 'IV' && slide.pageNumber <= 91) return false;
                              
                              // Search Filter
                              if (slideSearchQuery) {
                                const q = slideSearchQuery.toLowerCase();
                                return slide.title.toLowerCase().includes(q) || slide.snippet.toLowerCase().includes(q);
                              }
                              return true;
                            })
                            .map((slide) => {
                              const isChecked = selectedPages.includes(slide.pageNumber);
                              const handleToggle = (e: any) => {
                                e.preventDefault();
                                if (isChecked) {
                                  setSelectedPages(selectedPages.filter(p => p !== slide.pageNumber));
                                } else {
                                  setSelectedPages([...selectedPages, slide.pageNumber].sort((a, b) => a - b));
                                }
                              };

                              let badgeClass = 'badge-success';
                              let badgeText = 'Conservé';
                              if (slide.recommendation === 'delete') {
                                badgeClass = 'badge-error';
                                badgeText = 'Exclu';
                              } else if (slide.recommendation === 'modify') {
                                badgeClass = 'badge-warning';
                                badgeText = 'Personnalisé';
                              }

                              return (
                                <div key={slide.pageNumber} className="slide-item-card" onClick={handleToggle} style={{ cursor: 'pointer' }}>
                                  <input 
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {}} // Handled by card click
                                    className="slide-item-checkbox"
                                    onClick={(e) => e.stopPropagation()} // Prevent double trigger
                                  />
                                  <div className="slide-item-content">
                                    <div className="slide-item-header">
                                      <span className="slide-item-num">Diapo {slide.pageNumber}</span>
                                      <span className="slide-item-title">{slide.title}</span>
                                      <span className={`badge ${badgeClass}`}>{badgeText}</span>
                                    </div>
                                    {slide.reason && (
                                      <div className="slide-item-reason">
                                        💡 {slide.reason}
                                      </div>
                                    )}
                                    <div className="slide-item-snippet">
                                      {slide.snippet}
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                        )}
                      </div>
                      
                      {/* Selection Summary */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                        <span>Diapositives sélectionnées : <strong>{selectedPages.length} / {slides.length}</strong></span>
                        <button 
                          className="btn btn-secondary"
                          onClick={(e) => {
                            e.preventDefault();
                            if (selectedPages.length === slides.length) {
                              setSelectedPages([]);
                            } else {
                              setSelectedPages(slides.map(s => s.pageNumber));
                            }
                          }}
                          style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                        >
                          {selectedPages.length === slides.length ? "Tout désélectionner" : "Tout sélectionner"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Custom Report Name */}
                  <div style={{
                    background: 'rgba(217, 171, 51, 0.05)',
                    border: '1px solid var(--border-glow)',
                    borderRadius: '12px',
                    padding: '1.25rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                      <Pencil style={{ color: 'var(--accent-gold)' }} size={18} />
                      <h3 style={{ fontSize: '0.95rem' }}>Nom personnalisé du rapport</h3>
                    </div>

                    {editingReportName ? (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input
                          type="text"
                          value={customReportName}
                          onChange={(e) => setCustomReportName(e.target.value)}
                          placeholder="Ex : Memoire_Technique_Client_2026"
                          style={{ flex: 1, fontSize: '0.9rem' }}
                          autoFocus
                        />
                        <button
                          className="btn btn-secondary"
                          onClick={() => setEditingReportName(false)}
                          style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                        >
                          ✓ OK
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={() => setEditingReportName(true)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.75rem',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px dashed var(--border-color)',
                          borderRadius: '8px',
                          padding: '0.6rem 1rem',
                          cursor: 'pointer',
                          transition: 'border-color 0.2s'
                        }}
                        title="Cliquez pour modifier le nom"
                      >
                        <code style={{ fontSize: '0.88rem', color: 'var(--text-bright)', flex: 1 }}>
                          {customReportName || 'Memoire_Technique_...'}
                          .{checklist.hasTemplateClient ? 'docx' : 'pdf'}
                        </code>
                        <Pencil size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                      </div>
                    )}
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                      Cliquez sur le nom pour le modifier. Le fichier sera enregistré dans le dossier <code>Reponse/</code>.
                    </p>
                  </div>

                  {/* Generation Card Panel */}
                  <div style={{ background: 'rgba(217, 171, 51, 0.05)', border: '1px solid var(--border-glow)', borderRadius: '12px', padding: '1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                      <FileText style={{ color: 'var(--accent-gold)' }} size={24} />
                      <div>
                        <h3 style={{ fontSize: '1rem' }}>
                          Format de sortie : {checklist.hasTemplateClient ? `Document Word (.docx) — Template "${checklist.templateName}"` : 'Slides de réponse (.pdf) GSS'}
                        </h3>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {checklist.hasTemplateClient 
                            ? 'GPT-4o va remplir chaque section du template de A à Z avec les données réelles du dossier (agents, matériel, sites, risques).' 
                            : 'GPT-4o va créer des slides personnalisées (Dispositif Humain, Moyens Matériels, Risques) et les assembler avec les slides GSS standard.'
                          }
                        </p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                      <button className="btn btn-primary" onClick={triggerGeneration} style={{ flex: 1 }}>
                        <Play size={16} /> Générer la Mémoire Technique
                      </button>
                      <button className="btn btn-secondary" onClick={resetAll}>
                        Recommencer
                      </button>
                    </div>
                  </div>
                </>
              )}

              {isGenerating && (
                <div style={{ textAlign: 'center', padding: '5rem 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
                  <div className="loader-spinner" style={{ width: '48px', height: '48px' }}></div>
                  <div className="pulse">
                    <h2>Rédaction et Assemblage en cours...</h2>
                    <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                      {checklist.hasTemplateClient 
                        ? `GPT-4o rédige chaque section de "${checklist.templateName}" de A à Z avec les données réelles du dossier...` 
                        : 'Création des slides Dispositif Humain, Moyens Matériels et Analyse des Risques... Assemblage avec les slides GSS...'
                      }
                    </p>
                  </div>
                </div>
              )}

              {generationResult && (
                <div style={{ textAlign: 'center', padding: '3rem 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
                  <CheckCircle2 size={64} style={{ color: 'var(--state-success)' }} />
                  <div>
                    <h2>Mémoire Technique Générée !</h2>
                    <p style={{ color: 'var(--text-bright)', fontWeight: 600, fontSize: '1.1rem', marginTop: '0.5rem' }}>
                      {generationResult.filename}
                    </p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                      Le fichier a été enregistré avec succès dans le dossier <strong>"Reponse"</strong> de votre appel d'offres.
                      Vous pouvez y accéder directement depuis votre explorateur de fichiers Windows.
                    </p>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.75rem 1rem', width: '100%', wordBreak: 'break-all' }}>
                    Chemin complet : <br />
                    <code>{generationResult.outputPath}</code>
                  </div>
                  <button className="btn btn-primary" onClick={resetAll}>
                    Nouveau Dossier
                  </button>
                </div>
              )}

            </div>
          )}

        </div>
      </div>
    </div>
  );
}
