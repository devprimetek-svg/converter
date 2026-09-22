import { useState, useEffect, useRef } from 'react';
import { Navbar, type ActiveTab } from './components/Navbar';
import { SplashScreen } from './components/SplashScreen';
import { FileUploadZone } from './components/FileUploadZone';
import { ProgressBar } from './components/ProgressBar';
import { ResultsDashboard } from './components/ResultsDashboard';
import { ErrorAlert } from './components/ErrorAlert';
import { PdfImageExtractor } from './components/PdfImageExtractor';
import { BulkImageResizer } from './components/BulkImageResizer';
import { WatermarkTool } from './components/WatermarkTool';
import { AutoPipeline } from './components/AutoPipeline';
import type { ExtractionStatus } from './types';

export function App() {
  const [showSplash, setShowSplash] = useState<boolean>(true);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return (
      localStorage.getItem('theme') === 'dark' ||
      (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)
    );
  });

  const [activeTab, setActiveTab] = useState<ActiveTab>('auto-pipeline');

  // Catalogue conversion state
  const [status, setStatus] = useState<ExtractionStatus | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const pollingTimerRef = useRef<number | null>(null);

  // Sync dark mode class
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  // Clean up any SSE or polling on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
      }
    };
  }, []);

  const handleReset = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
    setStatus(null);
    setIsUploading(false);
    setIsExporting(false);
    setErrorMessage(null);
  };

  const handleFileSelect = async (file: File) => {
    handleReset();
    setIsUploading(true);
    setErrorMessage(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/extract', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.detail || `Upload failed with HTTP ${response.status}`);
      }

      const initialJob = await response.json();
      const jobId = initialJob.job_id;

      setStatus({
        job_id: jobId,
        filename: file.name,
        status: 'processing',
        current_page: 0,
        total_pages: 0,
        current_fig_no: '',
        current_fig_name: '',
        model_columns: [],
        total_rows: 0,
        figures: [],
      });

      // Start SSE stream for real-time progress updates
      startStream(jobId);
    } catch (err: any) {
      setIsUploading(false);
      setErrorMessage(err.message || 'Failed to start PDF processing.');
    }
  };

  const startStream = (jobId: string) => {
    try {
      const sse = new EventSource(`/api/extract/stream/${jobId}`);
      eventSourceRef.current = sse;

      sse.onmessage = (event) => {
        try {
          const data: ExtractionStatus = JSON.parse(event.data);
          setStatus(data);

          if (data.status === 'completed') {
            setIsUploading(false);
            sse.close();
          } else if (data.status === 'error') {
            setIsUploading(false);
            setErrorMessage(data.error || 'Extraction encountered an error.');
            sse.close();
          }
        } catch (parseErr) {
          console.error('Error parsing SSE event:', parseErr);
        }
      };

      sse.onerror = () => {
        // If SSE fails or drops, gracefully fall back to polling
        console.warn('SSE stream disconnected, switching to polling fallback.');
        sse.close();
        startPolling(jobId);
      };
    } catch {
      startPolling(jobId);
    }
  };

  const startPolling = (jobId: string) => {
    if (pollingTimerRef.current) return;

    pollingTimerRef.current = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/extract/status/${jobId}`);
        if (!res.ok) throw new Error('Status check failed');

        const data: ExtractionStatus = await res.json();
        setStatus(data);

        if (data.status === 'completed') {
          setIsUploading(false);
          if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
        } else if (data.status === 'error') {
          setIsUploading(false);
          setErrorMessage(data.error || 'Extraction failed.');
          if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
        }
      } catch (pollErr: any) {
        setIsUploading(false);
        setErrorMessage(pollErr.message || 'Lost connection to extraction server.');
        if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
      }
    }, 500);
  };

  const handleExport = async (cleanParts: boolean, targetModel?: string) => {
    if (!status || !status.rows || status.rows.length === 0) return;

    setIsExporting(true);
    try {
      const isValidQty = (val: any): boolean => {
        if (val === null || val === undefined) return false;
        const s = String(val).trim();
        if (
          s === '' ||
          s === '-' ||
          s === '0' ||
          s === '*' ||
          s.toLowerCase() === 'none' ||
          s.toLowerCase() === 'null'
        ) {
          return false;
        }
        return true;
      };

      let rowsToExport = status.rows;
      if (targetModel) {
        rowsToExport = status.rows.filter((r) => isValidQty(r[targetModel]));
      } else if (status.model_columns && status.model_columns.length >= 2) {
        rowsToExport = status.rows.filter((r) =>
          status.model_columns.some((m) => isValidQty(r[m]))
        );
      }

      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: status.filename,
          clean_part_numbers: cleanParts,
          model_columns: targetModel ? [targetModel] : status.model_columns,
          target_model: targetModel,
          rows: rowsToExport,
        }),
      });

      if (!res.ok) {
        throw new Error('Export request failed.');
      }

      const blob = await res.blob();
      const contentDisposition = res.headers.get('Content-Disposition');
      let downloadName = `${status.filename.replace(/\.pdf$/i, '')}_Parts.xlsx`;

      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^";]+)"?/);
        if (match && match[1]) {
          downloadName = match[1];
        }
      }

      // Trigger browser download
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = downloadName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Export error: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col bg-black bg-minimal-pattern text-white transition-colors duration-200 font-sans">
      {/* Minimalist Monochrome Startup Splash Screen */}
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}

      <Navbar
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onReplaySplash={() => setShowSplash(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-8">
        {/* Tab 0: Automated End-to-End Pipeline */}
        {activeTab === 'auto-pipeline' && (
          <div className="animate-in fade-in duration-200">
            <AutoPipeline />
          </div>
        )}

        {/* Tab 1: Parts to Excel Catalogue Converter */}
        {activeTab === 'catalogue' && (
          <div className="space-y-8 animate-in fade-in duration-200">
            {/* Error State */}
            {errorMessage && (
              <div className="mb-8">
                <ErrorAlert message={errorMessage} onRetry={handleReset} />
              </div>
            )}

            {/* Upload State */}
            {!status && !errorMessage && (
              <div className="space-y-8">
                <div className="text-center max-w-2xl mx-auto space-y-3">
                  <span className="inline-block px-3 py-1 rounded-full text-xs font-mono font-medium bg-zinc-900 text-zinc-300 border border-zinc-800 uppercase tracking-widest">
                    Venture Intelligence
                  </span>
                  <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                    Extract Parts Catalogues to Excel
                  </h2>
                  <p className="text-sm sm:text-base text-zinc-400 font-normal">
                    Precision extraction of figure diagrams, vertical rotated model codes (BGPJ, BGPL),
                    part descriptions, and remark columns.
                  </p>
                </div>

                <FileUploadZone onFileSelect={handleFileSelect} isUploading={isUploading} />
              </div>
            )}

            {/* Processing State with Live Progress */}
            {status && status.status === 'processing' && (
              <div className="py-12 animate-in fade-in duration-300">
                <ProgressBar status={status} />
              </div>
            )}

            {/* Results State (Completed) */}
            {status && status.status === 'completed' && (
              <div className="animate-in fade-in duration-300">
                <ResultsDashboard
                  status={status}
                  onReset={handleReset}
                  onExport={handleExport}
                  isExporting={isExporting}
                />
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Extract Images from PDF */}
        {activeTab === 'pdf-images' && (
          <div className="animate-in fade-in duration-200">
            <PdfImageExtractor />
          </div>
        )}

        {/* Tab 3: Bulk Image Resizer */}
        {activeTab === 'resizer' && (
          <div className="animate-in fade-in duration-200">
            <BulkImageResizer />
          </div>
        )}

        {/* Tab 4: Image Watermark Tool */}
        {activeTab === 'watermark' && (
          <div className="animate-in fade-in duration-200">
            <WatermarkTool />
          </div>
        )}
      </main>

      {/* Minimalist Monochrome Footer */}
      <footer className="border-t border-zinc-800/80 bg-black py-5 text-xs font-mono text-zinc-500 safe-bottom">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-white" />
            <span className="font-semibold tracking-wider text-zinc-300 uppercase">
              Venture Automation • Extract and Build
            </span>
          </div>
          <p className="text-zinc-500">Document & Image Intelligence Matrix • 100% In-Memory Privacy</p>
          <span className="text-zinc-400 font-medium text-[11px]">ACTIVE [OK]</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
