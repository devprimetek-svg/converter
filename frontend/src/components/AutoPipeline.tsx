import React, { useState, useRef, useMemo } from 'react';
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
    models?: string[];
  }>;
  rows_sample: Array<Record<string, any>>;
  rows?: Array<Record<string, any>>;
  figures?: Array<{ fig_no: string; fig_name: string; first_page?: number }>;
  model_folders?: Array<{
    model_code: string;
    parts_count: number;
    excel_filename: string;
    zip_filename: string;
    images_count: number;
  }>;
  error?: string;
}

export interface AutoPipelineProps {
  onJobCompleted?: (data: {
    jobId: string;
    rows: any[];
    figures: any[];
    modelColumns: string[];
    filename: string;
  }) => void;
}

export const AutoPipeline: React.FC<AutoPipelineProps> = ({ onJobCompleted }) => {
  // Preset States (Pre-filled exactly per user specifications: Company logo, -30° rotation, 115 padding, 25% scale, 10% opacity, tiled)
  const [wmType, setWmType] = useState<'logo' | 'text'>('logo');
  const [wmText, setWmText] = useState<string>('IndiaSpare');
  const [wmRotation, setWmRotation] = useState<number>(-30);
  const [wmPadding, setWmPadding] = useState<number>(115);
  const [wmSizePct, setWmSizePct] = useState<number>(25);
  const [wmOpacity, setWmOpacity] = useState<number>(10);
  const [wmColor, setWmColor] = useState<string>('#1E3A8A');
  const [wmIsTiled, setWmIsTiled] = useState<boolean>(true);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  const [resizeWidth, setResizeWidth] = useState<number>(1000);
  const [resizeHeight, setResizeHeight] = useState<number>(1200);
  const resizeQuality = 100;
  const [targetMinKb, setTargetMinKb] = useState<number>(59);
  const [targetMaxKb, setTargetMaxKb] = useState<number>(69);

  const [cleanParts, setCleanParts] = useState<boolean>(true);
  const [showPresetSettings, setShowPresetSettings] = useState<boolean>(false);

  // Execution states
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeResultTab, setActiveResultTab] = useState<'images' | 'parts'>('images');
  const [selectedModelFilter, setSelectedModelFilter] = useState<string>('ALL');

  const visibleThumbnails = useMemo(() => {
    if (!status?.processed_thumbnails) return [];
    if (selectedModelFilter === 'ALL') return status.processed_thumbnails;
    return status.processed_thumbnails.filter((t) => !t.models || t.models.includes(selectedModelFilter));
  }, [status?.processed_thumbnails, selectedModelFilter]);

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
    formData.append('watermark_rotation', String(wmRotation ?? -30));
    formData.append('watermark_angle', String(wmRotation ?? -30));
    formData.append('watermark_padding', String(wmPadding ?? 115));
    formData.append('watermark_size_pct', String(wmSizePct || 25));
    formData.append('watermark_opacity', String((wmOpacity || 10) / 100));
    formData.append('watermark_color', wmColor || '#1E3A8A');
    formData.append('watermark_is_tiled', String(wmIsTiled ?? true));
    if (logoFile) {
      formData.append('watermark_logo', logoFile);
    }

    formData.append('resize_width', String(resizeWidth));
    formData.append('resize_height', String(resizeHeight));
    formData.append('resize_quality', String(resizeQuality));
    formData.append('target_min_kb', String(targetMinKb || 59));
    formData.append('target_max_kb', String(targetMaxKb || 69));
    formData.append('clean_part_numbers', String(cleanParts));

    try {
      if (onJobCompleted) {
        onJobCompleted({
          jobId: '',
          rows: [],
          figures: [],
          modelColumns: [],
          filename: pdfFile.name.replace(/\.pdf$/i, ''),
        });
      }

      const res = await fetch('/api/pipeline/start', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to start automated pipeline.');
      }

      const { job_id } = await res.json();
      if (onJobCompleted) {
        onJobCompleted({
          jobId: job_id,
          rows: [],
          figures: [],
          modelColumns: [],
          filename: pdfFile.name.replace(/\.pdf$/i, ''),
        });
      }
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

          // As soon as catalogue rows are extracted, sync immediately to SEO & Metadata module
          if (data.rows && data.rows.length > 0 && onJobCompleted) {
            onJobCompleted({
              jobId: data.job_id,
              rows: data.rows,
              figures: data.figures || [],
              modelColumns: data.model_columns || [],
              filename: data.filename?.replace(/\.pdf$/i, '') || 'catalogue',
            });
          }

          if (data.status === 'completed') {
            setIsProcessing(false);
            if (onJobCompleted) {
              onJobCompleted({
                jobId: data.job_id,
                rows: data.rows || data.rows_sample || [],
                figures: data.figures || [],
                modelColumns: data.model_columns || [],
                filename: data.filename?.replace(/\.pdf$/i, '') || 'catalogue',
              });
            }
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

        // Sync catalogue rows immediately once extracted
        if (data.rows && data.rows.length > 0 && onJobCompleted) {
          onJobCompleted({
            jobId: data.job_id,
            rows: data.rows,
            figures: data.figures || [],
            modelColumns: data.model_columns || [],
            filename: data.filename?.replace(/\.pdf$/i, '') || 'catalogue',
          });
        }

        if (data.status === 'completed') {
          setIsProcessing(false);
          if (onJobCompleted) {
            onJobCompleted({
              jobId: data.job_id,
              rows: data.rows || data.rows_sample || [],
              figures: data.figures || [],
              modelColumns: data.model_columns || [],
              filename: data.filename?.replace(/\.pdf$/i, '') || 'catalogue',
            });
          }
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

  const downloadModelZip = (model: string) => {
    if (!status?.job_id) return;
    window.location.href = `/api/pipeline/download/${status.job_id}?model=${encodeURIComponent(model)}`;
  };

  const downloadModelExcel = (model: string) => {
    if (!status?.job_id) return;
    window.location.href = `/api/pipeline/download-excel/${status.job_id}?model=${encodeURIComponent(model)}`;
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
    <div className="w-full max-w-7xl mx-auto space-y-6 sm:space-y-8 animate-in fade-in duration-200">
      {/* Minimalist Hero Header */}
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-mono font-medium bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 uppercase tracking-widest">
          <Sparkles className="w-3.5 h-3.5 text-zinc-800 dark:text-white" />
          Autonomous Pipeline
        </div>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-zinc-900 dark:text-white tracking-tight uppercase">
          Automate Everything from One PDF
        </h2>
        <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400 font-normal">
          Upload catalogue once: extracts parts into Excel, detects figure diagrams, applies IndiaSpare watermark preset, resizes to 1000x1200, and bundles Master ZIP.
        </p>
      </div>

      {/* Preset Indicator Bar & Toggle */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/90 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Active Presets:
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-300 text-xs font-mono font-medium border border-zinc-200 dark:border-zinc-800">
              <Droplet className="w-3 h-3 text-zinc-800 dark:text-white" />
              {wmType === 'logo'
                ? (logoFile ? `Logo: ${logoFile.name.slice(0, 15)} (Tiled)` : 'Watermark: IndiaSpare Logo (Tiled)')
                : `Watermark: "${wmText}" (Tiled)`} • {wmRotation}° • {wmPadding}px • {wmSizePct}% Scale • {wmOpacity}% Opacity
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-300 text-xs font-mono font-medium border border-zinc-200 dark:border-zinc-800">
              <Crop className="w-3 h-3 text-zinc-800 dark:text-white" />
              {resizeWidth}x{resizeHeight} px • {targetMinKb}–{targetMaxKb} KB
            </span>
          </div>

          <button
            onClick={() => setShowPresetSettings(!showPresetSettings)}
            className="inline-flex items-center gap-1.5 text-xs font-mono font-medium text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
          >
            <Sliders className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
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
                      {logoFile ? `Custom Logo: ${logoFile.name}` : 'Default Preset Logo (IndiaSpare)'}
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

            {/* Resizer & Target Size Presets */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <Crop className="w-3.5 h-3.5" />
                Resizer & Target Size Preset
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
                  <label className="block text-slate-500 font-semibold mb-1">Min Target Size (KB)</label>
                  <input
                    type="number"
                    value={targetMinKb}
                    min={10}
                    max={500}
                    onChange={(e) => setTargetMinKb(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 font-semibold mb-1">Max Target Size (KB)</label>
                  <input
                    type="number"
                    value={targetMaxKb}
                    min={10}
                    max={500}
                    onChange={(e) => setTargetMaxKb(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono font-bold"
                  />
                </div>

                <div className="col-span-2 p-2.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60 text-[11px] text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
                  <span>Target Range Preset: <strong>{targetMinKb}–{targetMaxKb} KB</strong> (~{Math.round((targetMinKb + targetMaxKb) / 2)} KB ideal sweet spot)</span>
                  {(targetMinKb !== 59 || targetMaxKb !== 69) && (
                    <button
                      type="button"
                      onClick={() => {
                        setTargetMinKb(59);
                        setTargetMaxKb(69);
                      }}
                      className="text-[10px] font-bold underline hover:text-emerald-900 dark:hover:text-emerald-100 ml-2 cursor-pointer"
                    >
                      Reset to 59–69 KB
                    </button>
                  )}
                </div>

                <div className="col-span-2 pt-1">
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
          className="relative group border-2 border-dashed border-zinc-300 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-500 rounded-3xl p-8 sm:p-14 text-center cursor-pointer transition-all bg-white dark:bg-zinc-950/60 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 shadow-sm overflow-hidden"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileSelect}
            className="hidden"
          />

          <div className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-900 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-800 flex items-center justify-center mx-auto mb-4 group-hover:scale-105 transition-transform shadow-sm">
            <UploadCloud className="w-7 h-7 text-zinc-800 dark:text-white" />
          </div>

          <h3 className="text-lg sm:text-2xl font-bold text-zinc-900 dark:text-white mb-2 tracking-tight">
            Drop Parts Catalogue PDF
          </h3>
          <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 max-w-md mx-auto mb-5 font-normal">
            Extract parts into Excel, detect diagram figures, apply watermark preset, resize to 1000x1200, and generate Master ZIP package.
          </p>

          <span className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-black hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black text-xs sm:text-sm font-bold uppercase tracking-wider transition-all shadow-sm">
            <Sparkles className="w-4 h-4 text-white dark:text-black" />
            Start Autonomous Pipeline
          </span>

          {file && (
            <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-300 font-mono font-medium">
              Selected: {file.name}
            </p>
          )}
        </div>
      )}

      {/* State 2: Processing Progress & Stepper */}
      {status && status.status === 'processing' && (
        <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-mono font-medium uppercase tracking-widest text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-900 dark:bg-white animate-pulse" />
                Pipeline Active
              </span>
              <h3 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white font-mono truncate max-w-md">
                {status.filename}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 text-zinc-800 dark:text-white animate-spin" />
              <span className="text-xl font-bold font-mono text-zinc-900 dark:text-white">
                {status.progress_pct}%
              </span>
            </div>
          </div>

          {/* Minimalist Progress Bar */}
          <div className="w-full bg-zinc-100 dark:bg-zinc-900 h-2 rounded-full overflow-hidden border border-zinc-200 dark:border-zinc-800">
            <div
              className="bg-black dark:bg-white h-full transition-all duration-300 ease-out"
              style={{ width: `${Math.max(5, status.progress_pct)}%` }}
            />
          </div>

          <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 font-mono">
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
                  className={`p-3 rounded-xl border flex items-center gap-2.5 text-xs font-medium transition-all ${
                    isPast
                      ? 'bg-zinc-100 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white'
                      : isCurrent
                      ? 'bg-zinc-200 dark:bg-zinc-800 border-zinc-400 dark:border-zinc-600 text-zinc-900 dark:text-white shadow-xs font-bold'
                      : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800/80 text-zinc-400 dark:text-zinc-500'
                  }`}
                >
                  {isPast ? (
                    <CheckCircle2 className="w-4 h-4 text-zinc-900 dark:text-white shrink-0" />
                  ) : isCurrent ? (
                    <Loader2 className="w-4 h-4 text-zinc-900 dark:text-white animate-spin shrink-0" />
                  ) : (
                    <Icon className="w-4 h-4 text-zinc-400 dark:text-zinc-500 shrink-0" />
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
          {/* Minimalist Completion Card */}
          <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white shadow-sm space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-mono font-medium text-zinc-700 dark:text-zinc-300 uppercase tracking-widest">
                  <Check className="w-3.5 h-3.5 text-zinc-800 dark:text-white" />
                  Execution Complete • Package Ready
                </div>
                <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
                  {status.zip_filename}
                </h3>
                <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 max-w-xl font-normal">
                  Autonomous pipeline finished: Clean Yamaha parts Excel database and all watermarked & resized 1000x1200 JPEG diagrams bundled.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={downloadMasterZip}
                  title={
                    status.model_columns && status.model_columns.length >= 1
                      ? `Master ZIP contains folder(s): ${status.model_columns.join(', ')}`
                      : 'Download Master ZIP'
                  }
                  className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-full bg-black hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black font-bold text-sm uppercase tracking-wider transition-all shadow-sm active:scale-95 cursor-pointer"
                >
                  <Download className="w-4 h-4 text-white dark:text-black" />
                  Download Master ZIP ({formatBytes(status.bundle_size_bytes)})
                </button>
                <button
                  onClick={downloadExcelOnly}
                  className="inline-flex items-center gap-2 px-4 py-3 rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:text-black dark:hover:text-white text-xs sm:text-sm font-semibold border border-zinc-200 dark:border-zinc-800 transition-all font-mono cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 text-zinc-700 dark:text-white" />
                  Excel Only
                </button>
                <button
                  onClick={handleReset}
                  className="inline-flex items-center gap-1.5 px-4 py-3 rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white text-xs sm:text-sm font-semibold border border-zinc-200 dark:border-zinc-800 transition-all font-mono cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  New PDF
                </button>
              </div>
            </div>

            {/* Detected Model Folder(s) Banner */}
            {status.model_columns && status.model_columns.length >= 1 && (
              <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50/80 to-indigo-50/80 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-900/50 text-xs space-y-3">
                <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                  <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span>
                    {status.model_columns.length === 1
                      ? `1 Model Code Detected (${status.model_columns[0]}) • Packaged in ${status.model_columns[0]}/ Folder`
                      : `${status.model_columns.length} Model Codes Detected • Extracted into Separate Folders`}
                  </span>
                </div>
                <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  {status.model_columns.length === 1
                    ? `Dedicated standalone folder created for model ${status.model_columns[0]} with individual parts Excel database and diagrams. Download individually or as part of the Master ZIP package:`
                    : `This catalogue covers multiple model codes. The Master ZIP bundle automatically compiles individual standalone folders with dedicated Excel workbooks and diagrams for each model:`}
                </p>
                <div className="flex flex-wrap gap-2.5 pt-1">
                  {status.model_columns.map((m) => {
                    const folderInfo = status.model_folders?.find((f) => f.model_code === m);
                    return (
                      <div
                        key={m}
                        className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-blue-200 dark:border-blue-800 font-mono text-xs shadow-xs"
                      >
                        <span className="font-bold text-blue-600 dark:text-blue-400 font-mono text-xs">{m}/</span>
                        {folderInfo && (
                          <span className="text-[11px] text-zinc-500 font-sans">
                            ({folderInfo.parts_count} parts • {folderInfo.images_count} diagrams)
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => downloadModelExcel(m)}
                          className="px-2 py-1 rounded-md bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 text-[10px] font-bold text-zinc-800 dark:text-zinc-200 cursor-pointer"
                          title={`Download ${m} Excel sheet only`}
                        >
                          Excel
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadModelZip(m)}
                          className="px-2 py-1 rounded-md bg-black hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black text-[10px] font-bold cursor-pointer"
                          title={`Download ${m} standalone ZIP folder`}
                        >
                          ZIP
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-800/80 font-mono text-xs">
              <div>
                <p className="text-zinc-500 uppercase font-medium">Parts Extracted</p>
                <p className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white mt-0.5">{status.total_rows}</p>
              </div>
              <div>
                <p className="text-zinc-500 uppercase font-medium">Images Processed</p>
                <p className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white mt-0.5">{status.images_processed}</p>
              </div>
              <div>
                <p className="text-zinc-500 uppercase font-medium">Dimensions</p>
                <p className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white mt-0.5">{resizeWidth}x{resizeHeight} px</p>
              </div>
              <div>
                <p className="text-zinc-500 uppercase font-medium">Watermark Presets</p>
                <p className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white mt-0.5">{wmRotation}° / {wmPadding}px</p>
              </div>
            </div>
          </div>

          {/* Results Navigation Tabs */}
          <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3">
            <button
              onClick={() => setActiveResultTab('images')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                activeResultTab === 'images'
                  ? 'bg-black text-white dark:bg-white dark:text-black font-bold shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900'
              }`}
            >
              <ImageIcon className={`w-4 h-4 ${activeResultTab === 'images' ? 'text-white dark:text-black' : 'text-zinc-500 dark:text-zinc-400'}`} />
              Diagram Gallery ({status.images_processed})
            </button>
            <button
              onClick={() => setActiveResultTab('parts')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                activeResultTab === 'parts'
                  ? 'bg-black text-white dark:bg-white dark:text-black font-bold shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900'
              }`}
            >
              <FileSpreadsheet className={`w-4 h-4 ${activeResultTab === 'parts' ? 'text-white dark:text-black' : 'text-zinc-500 dark:text-zinc-400'}`} />
              Catalogue Records ({status.total_rows})
            </button>
          </div>

          {/* Processed Images Gallery Tab */}
          {activeResultTab === 'images' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Filter by Model if multiple models exist */}
              {status.model_columns && status.model_columns.length >= 2 && (
                <div className="flex items-center gap-2 pb-1 overflow-x-auto">
                  <span className="text-xs font-mono uppercase text-zinc-500 font-semibold mr-1 shrink-0">Filter Diagrams:</span>
                  <button
                    type="button"
                    onClick={() => setSelectedModelFilter('ALL')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold font-mono transition-all cursor-pointer ${
                      selectedModelFilter === 'ALL'
                        ? 'bg-black text-white dark:bg-white dark:text-black shadow-xs font-bold'
                        : 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    All Diagrams ({status.processed_thumbnails?.length || 0})
                  </button>
                  {status.model_columns.map((m) => {
                    const count = status.processed_thumbnails?.filter((t) => !t.models || t.models.includes(m)).length || 0;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setSelectedModelFilter(m)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold font-mono transition-all cursor-pointer ${
                          selectedModelFilter === m
                            ? 'bg-blue-600 text-white shadow-xs font-bold'
                            : 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                        }`}
                      >
                        {m} ({count})
                      </button>
                    );
                  })}
                </div>
              )}

              {visibleThumbnails && visibleThumbnails.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {visibleThumbnails.map((img) => (
                    <div
                      key={img.id}
                      className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden shadow-sm hover:border-zinc-400 dark:hover:border-zinc-700 transition-all group"
                    >
                      <div className="aspect-[10/12] bg-zinc-50 dark:bg-zinc-900/60 relative flex items-center justify-center overflow-hidden">
                        <img
                          src={img.thumbnail_url}
                          alt={img.filename}
                          className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform"
                        />
                        <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-xs text-[10px] font-mono text-zinc-300 font-medium">
                          {img.width}x{img.height}
                        </span>
                        <span className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-zinc-900/90 backdrop-blur-xs text-[10px] font-mono text-emerald-400 font-semibold border border-zinc-700">
                          {formatBytes(img.size_bytes)}
                        </span>
                        {img.fig_no && (
                          <span className="absolute bottom-2 left-2 right-2 px-2 py-0.5 rounded-md bg-black/90 backdrop-blur-xs text-[10px] font-medium text-zinc-300 border border-zinc-800 truncate">
                            FIG. {img.fig_no}{img.fig_name ? ` - ${img.fig_name}` : ''}
                          </span>
                        )}
                      </div>
                      <div className="p-3 space-y-1">
                        <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate" title={img.filename}>
                          {img.filename}
                        </p>
                        <div className="flex items-center justify-between text-[11px] text-zinc-500">
                          <span>Page {img.page}</span>
                          <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 text-[10px]">
                            {formatBytes(img.size_bytes)}
                          </span>
                        </div>
                        {img.models && img.models.length > 0 && status.model_columns && status.model_columns.length >= 1 && (
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {img.models.map((m) => (
                              <span
                                key={m}
                                className="px-1.5 py-0.2 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900 text-[9px] font-mono font-bold"
                              >
                                {m}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center bg-white dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-zinc-500 text-xs">
                  {selectedModelFilter !== 'ALL'
                    ? `No diagrams found specifically mapped to model ${selectedModelFilter}.`
                    : 'No images were embedded in this PDF. The Excel parts workbook has been bundled into the Master ZIP archive.'}
                </div>
              )}
            </div>
          )}

          {/* Parts Sample Table Tab */}
          {activeResultTab === 'parts' && (
            <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3 animate-in fade-in duration-150">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  Parts Extracted Sample (First {status.rows_sample?.length || 0} of {status.total_rows})
                </h4>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={downloadExcelOnly}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white transition-colors cursor-pointer border border-zinc-200 dark:border-zinc-800 font-mono"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Master Excel
                  </button>
                  {status.model_columns && status.model_columns.length >= 1 && status.model_columns.map((m) => (
                    <button
                      key={m}
                      onClick={() => downloadModelExcel(m)}
                      className="inline-flex items-center gap-1 text-xs font-mono font-semibold px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-900 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 cursor-pointer shadow-xs"
                      title={`Download Excel filtered specifically for model ${m}`}
                    >
                      <FileSpreadsheet className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                      {m} Excel
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
                <table className="w-full text-xs text-left">
                  <thead className="bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 font-semibold border-b border-zinc-200 dark:border-zinc-800">
                    <tr>
                      <th className="p-2.5">Fig</th>
                      <th className="p-2.5">Parts Name</th>
                      <th className="p-2.5">Catalogue Code</th>
                      <th className="p-2.5">Pic</th>
                      <th className="p-2.5">Ref</th>
                      <th className="p-2.5">Part No.</th>
                      <th className="p-2.5">Description</th>
                      {status.model_columns?.map((m) => (
                        <th key={m} className="p-2.5 font-mono text-center text-zinc-900 dark:text-white">{m}</th>
                      ))}
                      <th className="p-2.5">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/80">
                    {status.rows_sample?.map((r, i) => {
                      const isFirstOfFig = i === 0 || (status.rows_sample![i - 1].fig_no !== r.fig_no) || (status.rows_sample![i - 1].fig_name !== r.fig_name);
                      const cleanFig = (r.fig_name || 'PARTS').replace(/[^A-Za-z0-9]+/g, ' ').trim().toUpperCase();
                      const mc = status.model_columns && status.model_columns.length > 0 ? status.model_columns[0] : 'MODEL';
                      const catCode = (r as any).catalogue_code || `YAM_${mc}_${cleanFig}`;
                      const picVal = (r as any).pic || (r as any).image || (catCode ? `${catCode}.jpeg` : '');

                      return (
                        <tr key={i} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                          <td className="p-2.5 font-semibold text-zinc-500">{isFirstOfFig ? r.fig_no : ''}</td>
                          <td className="p-2.5 text-zinc-700 dark:text-zinc-300 font-medium">{isFirstOfFig ? (r.fig_name || '-') : ''}</td>
                          <td className="p-2.5 font-mono font-bold text-zinc-700 dark:text-zinc-300">{isFirstOfFig ? catCode : ''}</td>
                          <td className="p-2.5 font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                            {isFirstOfFig && picVal ? (
                              <div className="flex items-center gap-1 font-medium text-blue-600 dark:text-blue-400">
                                <ImageIcon className="w-3 h-3 shrink-0" />
                                <span className="truncate max-w-[140px]" title={picVal}>{picVal}</span>
                              </div>
                            ) : ''}
                          </td>
                          <td className="p-2.5 font-mono text-zinc-500">{r.ref_no}</td>
                          <td className="p-2.5 font-mono font-bold text-zinc-900 dark:text-white">{r.part_no}</td>
                          <td className="p-2.5 text-zinc-800 dark:text-zinc-200">{r.description}</td>
                          {status.model_columns?.map((m) => (
                            <td key={m} className="p-2.5 font-mono text-center font-bold text-zinc-800 dark:text-zinc-200">
                              {r[m] || '-'}
                            </td>
                          ))}
                          <td className="p-2.5 text-zinc-500">{r.remarks || '-'}</td>
                        </tr>
                      );
                    })}
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
