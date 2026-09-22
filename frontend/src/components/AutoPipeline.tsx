import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Crop,
  Droplet,
  Sparkles,
  Sliders,
  RotateCcw,
  FileArchive,
  Image as ImageIcon,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface PipelineStatus {
  job_id: string;
  filename: string;
  status: 'queued' | 'processing' | 'completed' | 'error';
  step_index: number;
  total_steps: number;
  step_name: string;
  progress_pct: number;
  details: string;
  total_pages: number;
  current_page: number;
  total_rows: number;
  model_columns: string[];
  figures_count: number;
  total_images: number;
  images_processed: number;
  excel_ready: boolean;
  zip_ready: boolean;
  zip_filename: string;
  bundle_size_bytes: number;
  processed_thumbnails: Array<{
    id: string;
    filename: string;
    page: number;
    width: number;
    height: number;
    thumbnail_url: string;
    size_bytes: number;
    fig_no?: string;
    fig_name?: string;
  }>;
  rows_sample: Array<Record<string, any>>;
  error?: string;
}

export const AutoPipeline: React.FC = () => {
  // Preset States (Pre-filled exactly per user specifications: Company logo, -30° rotation, 115 padding, 10% size, 15% opacity, tiled)
  const [wmType, setWmType] = useState<'logo' | 'text'>('logo');
  const [wmText, setWmText] = useState<string>('INDIA SPARE');
  const [wmRotation, setWmRotation] = useState<number>(-30);
  const [wmPadding, setWmPadding] = useState<number>(115);
  const [wmSizePct, setWmSizePct] = useState<number>(10);
  const [wmOpacity, setWmOpacity] = useState<number>(15);
  const [wmColor, setWmColor] = useState<string>('#1E3A8A');
  const [wmIsTiled, setWmIsTiled] = useState<boolean>(true);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  const [resizeWidth, setResizeWidth] = useState<number>(1000);
  const [resizeHeight, setResizeHeight] = useState<number>(1200);
  const [resizeQuality, setResizeQuality] = useState<number>(100);

  const [cleanParts, setCleanParts] = useState<boolean>(true);
  const [showPresetSettings, setShowPresetSettings] = useState<boolean>(false);

  // Execution states
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeResultTab, setActiveResultTab] = useState<'images' | 'parts'>('images');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const sseRef = useRef<EventSource | null>(null);
  const pollingRef = useRef<number | null>(null);

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files?.[0]) {
      const dropped = e.dataTransfer.files[0];
      if (dropped.name.toLowerCase().endsWith('.pdf')) {
        setFile(dropped);
        startPipeline(dropped);
      } else {
        alert('Please drop a valid PDF parts catalogue (.pdf).');
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      startPipeline(selected);
    }
  };

  const startPipeline = async (pdfFile: File) => {
    setIsProcessing(true);
    setErrorMessage(null);
    setStatus(null);

    const formData = new FormData();
    formData.append('file', pdfFile);
    formData.append('watermark_type', wmType);
    formData.append('watermark_text', wmText);
    formData.append('watermark_rotation', String(wmRotation));
    formData.append('watermark_angle', String(wmRotation));
    formData.append('watermark_padding', String(wmPadding));
    formData.append('watermark_size_pct', String(wmSizePct));
    formData.append('watermark_opacity', String(wmOpacity / 100));
    formData.append('watermark_color', wmColor);
    formData.append('watermark_is_tiled', String(wmIsTiled));
    if (logoFile) {
      formData.append('watermark_logo', logoFile);
    }

    formData.append('resize_width', String(resizeWidth));
    formData.append('resize_height', String(resizeHeight));
    formData.append('resize_quality', String(resizeQuality));
    formData.append('clean_part_numbers', String(cleanParts));

    try {
      const res = await fetch('/api/pipeline/start', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to start automated pipeline.');
      }

      const { job_id } = await res.json();
      subscribeToProgress(job_id);
    } catch (err: any) {
      setIsProcessing(false);
      setErrorMessage(err.message || 'Pipeline execution failed.');
    }
  };

  const subscribeToProgress = (jobId: string) => {
    try {
      const sse = new EventSource(`/api/pipeline/stream/${jobId}`);
      sseRef.current = sse;

      sse.onmessage = (event) => {
        try {
          const data: PipelineStatus = JSON.parse(event.data);
          setStatus(data);

          if (data.status === 'completed') {
            setIsProcessing(false);
            sse.close();
          } else if (data.status === 'error') {
            setIsProcessing(false);
            setErrorMessage(data.error || 'Pipeline encountered an error.');
            sse.close();
          }
        } catch (e) {
          console.error('Error parsing pipeline event:', e);
        }
      };

      sse.onerror = () => {
        console.warn('SSE stream disconnected, falling back to polling.');
        sse.close();
        startPolling(jobId);
      };
    } catch {
      startPolling(jobId);
    }
  };

  const startPolling = (jobId: string) => {
    if (pollingRef.current) return;
    pollingRef.current = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/pipeline/status/${jobId}`);
        if (!res.ok) throw new Error('Status failed');
        const data: PipelineStatus = await res.json();
        setStatus(data);

        if (data.status === 'completed') {
          setIsProcessing(false);
          if (pollingRef.current) clearInterval(pollingRef.current);
        } else if (data.status === 'error') {
          setIsProcessing(false);
          setErrorMessage(data.error || 'Pipeline execution failed.');
          if (pollingRef.current) clearInterval(pollingRef.current);
        }
      } catch (err: any) {
        setIsProcessing(false);
        setErrorMessage(err.message || 'Lost connection to pipeline server.');
        if (pollingRef.current) clearInterval(pollingRef.current);
      }
    }, 500);
  };

  const downloadMasterZip = () => {
    if (!status?.job_id) return;
    window.location.href = `/api/pipeline/download/${status.job_id}`;
  };

  const downloadExcelOnly = () => {
    if (!status?.job_id) return;
    window.location.href = `/api/pipeline/download-excel/${status.job_id}`;
  };

  const handleReset = () => {
    if (sseRef.current) sseRef.current.close();
    if (pollingRef.current) clearInterval(pollingRef.current);
    setStatus(null);
    setFile(null);
    setIsProcessing(false);
    setErrorMessage(null);
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-8 animate-in fade-in duration-200">
      {/* Hero Header */}
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
          <Sparkles className="w-3.5 h-3.5" />
          All-in-One Automated Pipeline
        </div>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
          Automate Everything from a Single PDF Upload
        </h2>
        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">
          Upload your PDF once: extracts parts into Excel, extracts illustrations, applies your watermark preset, resizes to 1000x1200, and bundles everything into a single downloadable ZIP.
        </p>
      </div>

      {/* Preset Indicator Bar & Toggle */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Active Presets:</span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-semibold border border-blue-200/60 dark:border-blue-900/60">
              <Droplet className="w-3 h-3" />
              {wmType === 'logo'
                ? (logoFile ? `Logo: ${logoFile.name.slice(0, 15)} (Tiled)` : 'Watermark: India Spare Logo (Tiled)')
                : `Watermark: "${wmText}" (Tiled)`} • Rotation: {wmRotation}° • Padding: {wmPadding}px • Size: {wmSizePct}% • Opacity: {wmOpacity}%
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-semibold border border-emerald-200/60 dark:border-emerald-900/60">
              <Crop className="w-3 h-3" />
              Resize: {resizeWidth}x{resizeHeight} • Quality: {resizeQuality}%
            </span>
          </div>

          <button
            onClick={() => setShowPresetSettings(!showPresetSettings)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            <Sliders className="w-3.5 h-3.5" />
            {showPresetSettings ? 'Hide Preset Settings' : 'Customize Presets'}
            {showPresetSettings ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Collapsible Preset Customizer */}
        {showPresetSettings && (
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-top-2 duration-150">
            {/* Watermark Presets */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                  <Droplet className="w-3.5 h-3.5" />
                  Watermark Preset Configuration
                </h4>
                {/* Watermark Type Selector */}
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setWmType('logo')}
                    className={`px-2 py-0.5 rounded-md transition-all ${
                      wmType === 'logo'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    Logo Watermark
                  </button>
                  <button
                    type="button"
                    onClick={() => setWmType('text')}
                    className={`px-2 py-0.5 rounded-md transition-all ${
                      wmType === 'text'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    Text
                  </button>
                </div>
              </div>

              {wmType === 'logo' ? (
                <div className="p-3 rounded-xl border border-blue-100 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      {logoFile ? `Custom Logo: ${logoFile.name}` : 'Default Preset Logo (India Spare)'}
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                      >
                        {logoFile ? 'Change Custom Logo' : 'Upload Custom Logo'}
                      </button>
                      {logoFile && (
                        <button
                          type="button"
                          onClick={() => setLogoFile(null)}
                          className="px-2 py-1 rounded-lg text-[11px] font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50"
                        >
                          Use Default
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Logo Preview */}
                  <div className="h-14 flex items-center justify-center p-2 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800">
                    <img
                      src={logoFile ? URL.createObjectURL(logoFile) : '/default_watermark_logo.png'}
                      alt="Watermark Logo"
                      className="max-h-full object-contain"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-500 font-semibold mb-1">Watermark Text</label>
                    <input
                      type="text"
                      value={wmText}
                      onChange={(e) => setWmText(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 font-semibold mb-1">Watermark Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={wmColor}
                        onChange={(e) => setWmColor(e.target.value)}
                        className="w-8 h-8 rounded border border-slate-300 dark:border-slate-700 cursor-pointer"
                      />
                      <span className="text-slate-600 dark:text-slate-400 font-mono">{wmColor}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Common Watermark Controls */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-500 font-semibold mb-1">Rotation Angle (°)</label>
                  <input
                    type="number"
                    value={wmRotation}
                    onChange={(e) => setWmRotation(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-semibold mb-1">Grid Padding (px)</label>
                  <input
                    type="number"
                    value={wmPadding}
                    onChange={(e) => setWmPadding(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-semibold mb-1">Relative Size (%)</label>
                  <input
                    type="number"
                    value={wmSizePct}
                    min={1}
                    max={100}
                    onChange={(e) => setWmSizePct(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-semibold mb-1">Opacity (%)</label>
                  <input
                    type="number"
                    value={wmOpacity}
                    min={1}
                    max={100}
                    onChange={(e) => setWmOpacity(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono font-bold"
                  />
                </div>

                <div className="col-span-2 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={wmIsTiled}
                      onChange={(e) => setWmIsTiled(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-slate-600 dark:text-slate-400 font-semibold">Tiled Watermark Pattern (Preset)</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Resizer Presets */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <Crop className="w-3.5 h-3.5" />
                Resizer Preset Configuration
              </h4>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-500 font-semibold mb-1">Target Width (px)</label>
                  <input
                    type="number"
                    value={resizeWidth}
                    onChange={(e) => setResizeWidth(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-semibold mb-1">Target Height (px)</label>
                  <input
                    type="number"
                    value={resizeHeight}
                    onChange={(e) => setResizeHeight(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-semibold mb-1">Image Quality (%)</label>
                  <input
                    type="number"
                    value={resizeQuality}
                    min={1}
                    max={100}
                    onChange={(e) => setResizeQuality(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-semibold mb-1">Format</label>
                  <div className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono font-bold">
                    JPEG (.jpg)
                  </div>
                </div>

                <div className="col-span-2 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cleanParts}
                      onChange={(e) => setCleanParts(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-slate-600 dark:text-slate-400 font-semibold">Clean Yamaha Part Numbers (e.g. 950220601000)</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-bold text-red-900 dark:text-red-200">Pipeline Failed</h4>
            <p className="text-xs text-red-700 dark:text-red-300 mt-0.5">{errorMessage}</p>
          </div>
          <button
            onClick={handleReset}
            className="px-3 py-1 rounded-xl bg-red-100 dark:bg-red-900/60 hover:bg-red-200 dark:hover:bg-red-800 text-red-900 dark:text-red-200 text-xs font-bold transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      {/* State 1: Upload Zone (Idle) */}
      {!status && !isProcessing && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleFileDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 rounded-3xl p-10 sm:p-14 text-center cursor-pointer transition-all bg-white/50 dark:bg-slate-900/50 hover:bg-emerald-50/20 dark:hover:bg-emerald-950/10 group shadow-xs"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileSelect}
            className="hidden"
          />

          <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-4 group-hover:scale-105 transition-transform shadow-inner">
            <UploadCloud className="w-8 h-8" />
          </div>

          <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white mb-1">
            Drop your Parts PDF Catalogue here
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-4">
            The automated pipeline will extract all Excel records, apply the watermark preset, resize all images to 1000x1200, and generate the Master ZIP package.
          </p>

          <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold shadow-md shadow-emerald-600/20 transition-all">
            <Sparkles className="w-4 h-4" />
            Select PDF to Run Auto Pipeline
          </span>

          {file && (
            <p className="mt-3 text-xs text-emerald-600 dark:text-emerald-400 font-mono font-bold">
              Selected: {file.name}
            </p>
          )}
        </div>
      )}

      {/* State 2: Processing Progress & Stepper */}
      {status && status.status === 'processing' && (
        <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Automated Processing Active
              </span>
              <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
                {status.filename}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
              <span className="text-lg font-black font-mono text-emerald-600 dark:text-emerald-400">
                {status.progress_pct}%
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-3 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-emerald-500 via-blue-500 to-indigo-600 h-full transition-all duration-300 ease-out"
              style={{ width: `${Math.max(5, status.progress_pct)}%` }}
            />
          </div>

          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-medium">
            {status.details}
          </p>

          {/* Step Badges */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 pt-2">
            {[
              { idx: 1, label: 'Parts Extraction', icon: FileSpreadsheet },
              { idx: 2, label: 'Excel Generation', icon: FileSpreadsheet },
              { idx: 3, label: 'Image Extraction', icon: ImageIcon },
              { idx: 4, label: 'Preset Watermark', icon: Droplet },
              { idx: 5, label: 'Resize & Master ZIP', icon: FileArchive },
            ].map((s) => {
              const Icon = s.icon;
              const isPast = status.step_index > s.idx;
              const isCurrent = status.step_index === s.idx;
              return (
                <div
                  key={s.idx}
                  className={`p-3 rounded-xl border flex items-center gap-2.5 text-xs font-semibold transition-all ${
                    isPast
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                      : isCurrent
                      ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-300 shadow-sm'
                      : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-400'
                  }`}
                >
                  {isPast ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : isCurrent ? (
                    <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
                  ) : (
                    <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                  <span className="truncate">{s.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* State 3: Completed Results Dashboard */}
      {status && status.status === 'completed' && (
        <div className="space-y-6">
          {/* Hero Completion Card */}
          <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-emerald-600 via-teal-700 to-slate-900 text-white shadow-xl space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-bold text-emerald-100">
                  <Check className="w-3.5 h-3.5" />
                  All Modules Processed & Archived Successfully
                </div>
                <h3 className="text-2xl sm:text-3xl font-black tracking-tight">
                  {status.zip_filename}
                </h3>
                <p className="text-xs sm:text-sm text-emerald-100/90 max-w-xl">
                  Generated complete Master ZIP containing the clean Excel catalogue sheet and all watermarked & resized 1000x1200 illustrations.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={downloadMasterZip}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-white hover:bg-slate-100 text-slate-900 font-extrabold text-sm sm:text-base shadow-lg hover:scale-102 active:scale-98 transition-all"
                >
                  <Download className="w-5 h-5 text-emerald-600" />
                  Download Complete Bundle ({formatBytes(status.bundle_size_bytes)})
                </button>
                <button
                  onClick={downloadExcelOnly}
                  className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl bg-white/10 hover:bg-white/20 backdrop-blur-md text-white text-xs sm:text-sm font-bold border border-white/20 transition-all"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
                  Excel Only
                </button>
                <button
                  onClick={handleReset}
                  className="inline-flex items-center gap-1.5 px-4 py-3 rounded-2xl bg-white/10 hover:bg-white/20 backdrop-blur-md text-white text-xs sm:text-sm font-bold border border-white/20 transition-all"
                >
                  <RotateCcw className="w-4 h-4" />
                  New PDF
                </button>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-white/10 text-xs">
              <div>
                <p className="text-emerald-200/70 uppercase font-semibold">Parts Extracted</p>
                <p className="text-xl sm:text-2xl font-black mt-0.5">{status.total_rows}</p>
              </div>
              <div>
                <p className="text-emerald-200/70 uppercase font-semibold">Images Processed</p>
                <p className="text-xl sm:text-2xl font-black mt-0.5">{status.images_processed}</p>
              </div>
              <div>
                <p className="text-emerald-200/70 uppercase font-semibold">Output Dimensions</p>
                <p className="text-xl sm:text-2xl font-black mt-0.5">{resizeWidth}x{resizeHeight} px</p>
              </div>
              <div>
                <p className="text-emerald-200/70 uppercase font-semibold">Watermark Presets</p>
                <p className="text-xl sm:text-2xl font-black mt-0.5">{wmRotation}° / {wmPadding}px</p>
              </div>
            </div>
          </div>

          {/* Results Navigation Tabs */}
          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
            <button
              onClick={() => setActiveResultTab('images')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                activeResultTab === 'images'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <ImageIcon className="w-4 h-4" />
              Processed Images Preview ({status.images_processed})
            </button>
            <button
              onClick={() => setActiveResultTab('parts')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                activeResultTab === 'parts'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              Extracted Parts Preview ({status.total_rows})
            </button>
          </div>

          {/* Processed Images Gallery Tab */}
          {activeResultTab === 'images' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {status.processed_thumbnails && status.processed_thumbnails.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {status.processed_thumbnails.map((img) => (
                    <div
                      key={img.id}
                      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs hover:shadow-md transition-shadow group"
                    >
                      <div className="aspect-[10/12] bg-slate-100 dark:bg-slate-800 relative flex items-center justify-center overflow-hidden">
                        <img
                          src={img.thumbnail_url}
                          alt={img.filename}
                          className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform"
                        />
                        <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-xs text-[10px] font-mono text-white font-bold">
                          {img.width}x{img.height}
                        </span>
                        <span className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-emerald-600/90 backdrop-blur-xs text-[10px] font-mono text-white font-bold">
                          JPG
                        </span>
                        {img.fig_no && (
                          <span className="absolute bottom-2 left-2 right-2 px-2 py-0.5 rounded-md bg-blue-600/90 backdrop-blur-xs text-[10px] font-bold text-white shadow-xs truncate">
                            FIG. {img.fig_no}{img.fig_name ? ` - ${img.fig_name}` : ''}
                          </span>
                        )}
                      </div>
                      <div className="p-3">
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate" title={img.filename}>
                          {img.filename}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Page {img.page} • {formatBytes(img.size_bytes)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-500 text-xs">
                  No images were embedded in this PDF. The Excel parts workbook has been bundled into the Master ZIP archive.
                </div>
              )}
            </div>
          )}

          {/* Parts Sample Table Tab */}
          {activeResultTab === 'parts' && (
            <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Parts Extracted Sample (First {status.rows_sample?.length || 0} of {status.total_rows})
                </h4>
                <button
                  onClick={downloadExcelOnly}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Full Excel ({status.total_rows} rows)
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="p-2.5">Fig</th>
                      <th className="p-2.5">Ref</th>
                      <th className="p-2.5">Part No.</th>
                      <th className="p-2.5">Description</th>
                      {status.model_columns?.map((m) => (
                        <th key={m} className="p-2.5 font-mono text-center text-blue-600 dark:text-blue-400">{m}</th>
                      ))}
                      <th className="p-2.5">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {status.rows_sample?.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="p-2.5 font-semibold text-slate-500">{r.fig_no}</td>
                        <td className="p-2.5 font-mono text-slate-500">{r.ref_no}</td>
                        <td className="p-2.5 font-mono font-bold text-blue-700 dark:text-blue-300">{r.part_no}</td>
                        <td className="p-2.5 text-slate-800 dark:text-slate-200">{r.description}</td>
                        {status.model_columns?.map((m) => (
                          <td key={m} className="p-2.5 font-mono text-center font-bold text-slate-700 dark:text-slate-300">
                            {r[m] || '-'}
                          </td>
                        ))}
                        <td className="p-2.5 text-slate-500">{r.remarks || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
