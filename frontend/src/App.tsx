import { useState, useEffect, useRef } from 'react';
import { Navbar, type ActiveTab } from './components/Navbar';
import { FileUploadZone } from './components/FileUploadZone';
import { ProgressBar } from './components/ProgressBar';
import { ResultsDashboard } from './components/ResultsDashboard';
import { ErrorAlert } from './components/ErrorAlert';
import { PdfImageExtractor } from './components/PdfImageExtractor';
import { BulkImageResizer } from './components/BulkImageResizer';
import { WatermarkTool } from './components/WatermarkTool';
import type { ExtractionStatus } from './types';

export function App() {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return (
      localStorage.getItem('theme') === 'dark' ||
      (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)
    );
  });

  const [activeTab, setActiveTab] = useState<ActiveTab>('catalogue');

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
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200 font-sans">
      <Navbar
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
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
                  <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                    Automated Parts Extraction Engine
                  </span>
                  <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                    Turn Yamaha Parts PDFs into Clean Excel Sheets
                  </h2>
                  <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">
                    Extracts figure sections, vertical rotated model codes (BGPJ, BGPL, etc.),
                    continuation rows, and descriptions with millimeter precision.
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

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800/80 py-6 text-center text-xs text-slate-500 dark:text-slate-500">
        <p>Document & Image Processing Suite • 100% In-Memory Privacy Guarantee</p>
      </footer>
    </div>
  );
}

export default App;
