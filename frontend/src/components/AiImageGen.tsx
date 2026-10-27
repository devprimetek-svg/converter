import React, { useState, useRef } from 'react';
import {
  Sparkles,
  Wand2,
  Upload,
  X,
  Download,
  Copy,
  Maximize2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Zap,
  Layers,
  Cpu,
  FileCheck2,
  SlidersHorizontal,
  Archive,
  Trash2,
  Plus,
  RotateCcw,
  StopCircle,
} from 'lucide-react';
import JSZip from 'jszip';

interface GenerationHistoryItem {
  id: string;
  url: string;
  referenceUrl?: string;
  prompt: string;
  aspectRatio: string;
  engine: string;
  seed?: number;
  timestamp: number;
}

export interface BatchItem {
  id: string;
  file: File;
  name: string;
  size: number;
  previewUrl: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  result?: GenerationHistoryItem;
}

const DEFAULT_PROMPT =
  'A photorealistic 3D exploded technical assembly view of the uploaded schematic diagram, high-precision engineering render. Maintain the exact spatial arrangement, exploded axes, and reference index numbers with leader lines exactly as shown in the source schematic—do not alter, remove, or reposition any reference numbers. Each mechanical component must show its authentic physical material finish and OEM color: cast aluminum with fine matte texture, CNC machined steel, polished chrome, zinc-plated fasteners, black vulcanized rubber seals/gaskets, and semi-gloss black injection-molded plastics. Studio technical lighting, crisp shadows, ultra-detailed textures, white isolated background, 8k resolution, CAD industrial product rendering style.';

const ASPECT_RATIOS = [
  { id: '3:4', label: '3:4 Catalogue', sub: '768×1024', width: 768, height: 1024 },
  { id: '1:1', label: '1:1 Square', sub: '1024×1024', width: 1024, height: 1024 },
  { id: '9:16', label: '9:16 Portrait', sub: '576×1024', width: 576, height: 1024 },
  { id: '16:9', label: '16:9 Landscape', sub: '1024×576', width: 1024, height: 576 },
];

export const AiImageGen: React.FC = () => {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [aspectRatio, setAspectRatio] = useState('3:4');

  // Single or Batch Schematics Queue
  const [batchFiles, setBatchFiles] = useState<BatchItem[]>([]);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

  // Optional Leonardo.ai API Key
  const [leonardoApiKey, setLeonardoApiKey] = useState<string>(() => localStorage.getItem('leonardo_api_key') || '');
  const [showApiSettings, setShowApiSettings] = useState(false);

  // Generation status
  const [isGenerating, setIsGenerating] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [generationStep, setGenerationStep] = useState<string>('');
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; percent: number; currentName: string }>({
    current: 0,
    total: 0,
    percent: 0,
    currentName: '',
  });

  const [currentResult, setCurrentResult] = useState<GenerationHistoryItem | null>(null);
  const [history, setHistory] = useState<GenerationHistoryItem[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'render' | 'schematic'>('render');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortBatchRef = useRef<boolean>(false);

  // Helper to add files into batch
  const addFilesToBatch = (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const newItems: BatchItem[] = [];
    let hasInvalid = false;

    fileArray.forEach((file) => {
      if (!file.type.startsWith('image/') && !file.name.match(/\.(jpg|jpeg|png|webp|bmp|tif|tiff)$/i)) {
        hasInvalid = true;
        return;
      }
      const id = Math.random().toString(36).substring(7);
      const previewUrl = URL.createObjectURL(file);
      newItems.push({
        id,
        file,
        name: file.name,
        size: file.size,
        previewUrl,
        status: 'pending',
      });
    });

    if (hasInvalid) {
      setErrorMsg('Some non-image files were skipped. Please upload JPG, PNG, or WebP diagrams.');
    } else {
      setErrorMsg(null);
    }

    if (newItems.length > 0) {
      setBatchFiles((prev) => {
        const updated = [...prev, ...newItems];
        if (!activeItemId) {
          setActiveItemId(newItems[0].id);
        }
        return updated;
      });
    }
  };

  const handleLoadSample = async () => {
    try {
      setErrorMsg(null);
      const res = await fetch('/sample_isometric_diagram.jpg');
      if (!res.ok) throw new Error('Sample not found');
      const blob = await res.blob();
      const file = new File([blob], 'yamaha_b971470_disc_brake_schematic.jpg', { type: 'image/jpeg' });
      addFilesToBatch([file]);
    } catch {
      setErrorMsg('Could not load sample. Please upload your own schematic image.');
    }
  };

  const handleRemoveFile = (idToRemove: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setBatchFiles((prev) => {
      const remaining = prev.filter((item) => item.id !== idToRemove);
      if (activeItemId === idToRemove) {
        setActiveItemId(remaining.length > 0 ? remaining[0].id : null);
        const itemResult = remaining.find((r) => r.result)?.result || null;
        setCurrentResult(itemResult);
      }
      return remaining;
    });
  };

  const handleClearAll = () => {
    if (isGenerating) {
      abortBatchRef.current = true;
    }
    setBatchFiles([]);
    setActiveItemId(null);
    setCurrentResult(null);
    setErrorMsg(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleResetPrompt = () => {
    setPrompt(DEFAULT_PROMPT);
  };

  // Run Batch or Single Generation
  const handleGenerate = async () => {
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) {
      setErrorMsg('Please enter or verify the prompt instructions.');
      return;
    }

    if (batchFiles.length === 0) {
      setErrorMsg('Isometric schematic diagram is mandatory! Please upload single or multiple diagrams.');
      return;
    }

    const itemsToProcess = batchFiles.filter((item) => item.status !== 'completed');
    if (itemsToProcess.length === 0) {
      setErrorMsg('All diagrams in the current queue are already completed. Add more or clear queue to re-run.');
      return;
    }

    setIsGenerating(true);
    setErrorMsg(null);
    abortBatchRef.current = false;

    const total = itemsToProcess.length;
    let processedCount = 0;

    for (let i = 0; i < batchFiles.length; i++) {
      const item = batchFiles[i];
      if (item.status === 'completed') continue;

      if (abortBatchRef.current) {
        setGenerationStep('Batch generation stopped by user.');
        break;
      }

      processedCount++;
      const currentPercent = Math.round(((processedCount - 1) / total) * 100);
      setBatchProgress({
        current: processedCount,
        total,
        percent: currentPercent,
        currentName: item.name,
      });

      const activeEngine = leonardoApiKey.trim() ? 'Leonardo.ai ControlNet' : 'FLUX.1 3D CAD Engine';
      setGenerationStep(`[${processedCount}/${total}] Rendering "${item.name}" via ${activeEngine}...`);

      // Set item status to processing
      setBatchFiles((prev) =>
        prev.map((f) => (f.id === item.id ? { ...f, status: 'processing', error: undefined } : f))
      );
      setActiveItemId(item.id);

      const seed = Math.floor(Math.random() * 999999999) + 1;
      let imageUrl: string | null = null;
      let engineName = activeEngine;

      try {
        const formData = new FormData();
        formData.append('prompt', cleanPrompt);
        formData.append('aspect_ratio', aspectRatio);
        formData.append('seed', seed.toString());
        formData.append('reference_image', item.file);
        if (leonardoApiKey.trim()) {
          formData.append('leonardo_api_key', leonardoApiKey.trim());
        }

        const res = await fetch('/api/ai/generate-image', {
          method: 'POST',
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          if (data.image_url) {
            imageUrl = data.image_url;
            engineName = data.engine || engineName;
          } else {
            throw new Error('No image returned from engine.');
          }
        } else {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.detail || `Engine error (${res.status}): Generation failed.`);
        }

        if (!imageUrl) {
          throw new Error('No image returned from engine.');
        }

        const newItem: GenerationHistoryItem = {
          id: Math.random().toString(36).substring(7),
          url: imageUrl,
          referenceUrl: item.previewUrl,
          prompt: cleanPrompt,
          aspectRatio,
          engine: engineName,
          seed,
          timestamp: Date.now(),
        };

        setBatchFiles((prev) =>
          prev.map((f) => (f.id === item.id ? { ...f, status: 'completed', result: newItem } : f))
        );
        setCurrentResult(newItem);
        setHistory((prev) => [newItem, ...prev.slice(0, 19)]);
        setViewMode('render');
      } catch (backendErr: any) {
        setBatchFiles((prev) =>
          prev.map((f) =>
            f.id === item.id
              ? { ...f, status: 'failed', error: backendErr.message || 'Generation failed. Retry available.' }
              : f
          )
        );
        // Continue processing next items in batch
      }

      // Small delay between calls to let UI update and protect rate limits
      if (i < batchFiles.length - 1 && !abortBatchRef.current) {
        await new Promise((r) => setTimeout(r, 600));
      }
    }

    setBatchProgress((prev) => ({ ...prev, percent: 100 }));
    setIsGenerating(false);
    setGenerationStep('');
  };

  // Retry single failed item
  const handleRetryItem = async (itemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const target = batchFiles.find((f) => f.id === itemId);
    if (!target) return;

    setIsGenerating(true);
    setGenerationStep(`Retrying "${target.name}"...`);
    setBatchFiles((prev) =>
      prev.map((f) => (f.id === itemId ? { ...f, status: 'processing', error: undefined } : f))
    );
    setActiveItemId(itemId);

    const seed = Math.floor(Math.random() * 999999999) + 1;
    try {
      const formData = new FormData();
      formData.append('prompt', prompt.trim() || DEFAULT_PROMPT);
      formData.append('aspect_ratio', aspectRatio);
      formData.append('seed', seed.toString());
      formData.append('reference_image', target.file);
      if (leonardoApiKey.trim()) {
        formData.append('leonardo_api_key', leonardoApiKey.trim());
      }

      const res = await fetch('/api/ai/generate-image', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        const newItem: GenerationHistoryItem = {
          id: Math.random().toString(36).substring(7),
          url: data.image_url,
          referenceUrl: target.previewUrl,
          prompt: prompt.trim() || DEFAULT_PROMPT,
          aspectRatio,
          engine: data.engine || (leonardoApiKey.trim() ? 'Leonardo.ai ControlNet' : 'FLUX.1 3D CAD Engine'),
          seed,
          timestamp: Date.now(),
        };

        setBatchFiles((prev) =>
          prev.map((f) => (f.id === itemId ? { ...f, status: 'completed', result: newItem } : f))
        );
        setCurrentResult(newItem);
        setHistory((prev) => [newItem, ...prev.slice(0, 19)]);
      } else {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || 'Retry failed');
      }
    } catch (err: any) {
      setBatchFiles((prev) =>
        prev.map((f) => (f.id === itemId ? { ...f, status: 'failed', error: err.message || 'Retry failed' } : f))
      );
    } finally {
      setIsGenerating(false);
      setGenerationStep('');
    }
  };

  // Download single image
  const handleDownload = async (item: GenerationHistoryItem) => {
    try {
      const res = await fetch(item.url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `CAD_3D_Render_${item.id}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(item.url, '_blank');
    }
  };

  // Download ALL Completed Batch Renders as ZIP
  const handleDownloadAllZip = async () => {
    const completed = batchFiles.filter((b) => b.status === 'completed' && b.result?.url);
    if (completed.length === 0) {
      setErrorMsg('No completed renders to download in ZIP.');
      return;
    }

    setIsZipping(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder('CAD_3D_Exploded_Renders');

      for (let idx = 0; idx < completed.length; idx++) {
        const item = completed[idx];
        const res = await fetch(item.result!.url);
        const blob = await res.blob();
        const baseName = item.name.substring(0, item.name.lastIndexOf('.')) || item.name;
        const cleanBase = baseName.replace(/[^a-zA-Z0-9_-]/g, '_');
        const filename = `${String(idx + 1).padStart(2, '0')}_${cleanBase}_3D_CAD.jpg`;
        folder?.file(filename, blob);
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const blobUrl = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `Batch_3D_CAD_Renders_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err: any) {
      setErrorMsg('Failed to build ZIP archive: ' + (err.message || 'Unknown error'));
    } finally {
      setIsZipping(false);
    }
  };

  const handleCopy = async (item: GenerationHistoryItem) => {
    try {
      const res = await fetch(item.url);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      navigator.clipboard.writeText(item.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const completedCount = batchFiles.filter((f) => f.status === 'completed').length;
  const pendingCount = batchFiles.filter((f) => f.status === 'pending').length;
  const failedCount = batchFiles.filter((f) => f.status === 'failed').length;
  const activeItem = batchFiles.find((f) => f.id === activeItemId) || batchFiles[0] || null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-zinc-900 text-white dark:bg-zinc-950 border border-zinc-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-white text-black flex items-center justify-center font-bold shadow-md shrink-0">
            <Cpu className="w-6 h-6 text-zinc-900" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight font-sans">
                Isometric Schematic to 3D CAD Render
              </h2>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30 flex items-center gap-1">
                <Zap className="w-3 h-3 text-emerald-400" />
                {leonardoApiKey.trim() ? 'Leonardo.ai ControlNet (Active)' : 'FLUX.1 3D CAD Engine'}
              </span>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-semibold border border-blue-500/30 flex items-center gap-1">
                <Layers className="w-3 h-3 text-blue-400" />
                Batch & Single Supported
              </span>
            </div>
            <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
              Transform single or bulk 2D isometric exploded diagrams into photorealistic 3D engineering CAD assemblies with OEM materials & preserved index callouts.
            </p>
          </div>
        </div>
      </div>

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Manual Controls & Schematics Upload (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Schematic Diagram Upload & Batch Queue Card */}
          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-950 border-2 border-zinc-900/20 dark:border-zinc-100/20 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-zinc-900 dark:text-zinc-100" />
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100 font-mono">
                  Isometric Schematics <span className="text-red-500 font-bold">* (MANDATORY)</span>
                </span>
                {batchFiles.length > 0 && (
                  <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                    {batchFiles.length} {batchFiles.length === 1 ? 'file' : 'files in queue'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {batchFiles.length === 0 && (
                  <button
                    type="button"
                    onClick={handleLoadSample}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-mono flex items-center gap-1 cursor-pointer"
                  >
                    <FileCheck2 className="w-3.5 h-3.5" />
                    Load Sample (Yamaha Disc Brake)
                  </button>
                )}
                {batchFiles.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer font-mono"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add More
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAll}
                      className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 cursor-pointer font-mono"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Clear All
                    </button>
                  </>
                )}
              </div>
            </div>

            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Upload 1 single schematic or multiple diagrams at once. Leonardo.ai will process them sequentially with Line Art ControlNet and output photorealistic 3D CAD assemblies.
            </p>

            {/* Dropzone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  addFilesToBatch(e.dataTransfer.files);
                }
              }}
              className="border-2 border-dashed border-zinc-300 dark:border-zinc-800 hover:border-black dark:hover:border-white rounded-xl p-5 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors text-center bg-zinc-50/70 dark:bg-zinc-900/30 group"
            >
              <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Upload className="w-5 h-5 text-zinc-600 dark:text-zinc-300" />
              </div>
              <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                Click or Drag & Drop <span className="underline">Single or Multiple</span> Schematic Diagrams
              </div>
              <div className="text-[11px] text-zinc-500">
                Select 1 or bulk select 5–20+ files (PNG, JPG, WebP)
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  addFilesToBatch(e.target.files);
                }
              }}
            />

            {/* Schematics Queue List / Grid */}
            {batchFiles.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500">
                  <span>Queued Schematics ({batchFiles.length})</span>
                  <div className="flex items-center gap-2">
                    {completedCount > 0 && (
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                        ✓ {completedCount} Done
                      </span>
                    )}
                    {pendingCount > 0 && <span>• {pendingCount} Pending</span>}
                    {failedCount > 0 && <span className="text-red-500 font-semibold">• {failedCount} Failed</span>}
                  </div>
                </div>

                <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                  {batchFiles.map((item, idx) => {
                    const isSelected = activeItemId === item.id;
                    return (
                      <div
                        key={item.id}
                        onClick={() => {
                          setActiveItemId(item.id);
                          if (item.result) {
                            setCurrentResult(item.result);
                            setViewMode('render');
                          }
                        }}
                        className={`flex items-center justify-between p-2 rounded-xl border text-xs cursor-pointer transition-all ${
                          isSelected
                            ? 'border-black dark:border-white bg-zinc-100 dark:bg-zinc-900 ring-1 ring-black dark:ring-white'
                            : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900/40'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-[10px] font-mono font-bold text-zinc-400 w-4 text-center">
                            #{idx + 1}
                          </span>
                          <img
                            src={item.previewUrl}
                            alt={item.name}
                            className="w-10 h-10 object-contain rounded bg-zinc-100 dark:bg-zinc-800 shrink-0 border border-zinc-200 dark:border-zinc-700"
                          />
                          <div className="truncate">
                            <div className="font-semibold text-zinc-800 dark:text-zinc-200 truncate max-w-[200px] sm:max-w-xs">
                              {item.name}
                            </div>
                            <div className="text-[10px] text-zinc-400 font-mono">
                              {(item.size / 1024).toFixed(0)} KB
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {item.status === 'pending' && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                              Waiting
                            </span>
                          )}
                          {item.status === 'processing' && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center gap-1 font-semibold animate-pulse">
                              <RefreshCw className="w-3 h-3 animate-spin" /> Rendering...
                            </span>
                          )}
                          {item.status === 'completed' && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-semibold">
                              <CheckCircle2 className="w-3 h-3" /> Done
                            </span>
                          )}
                          {item.status === 'failed' && (
                            <button
                              type="button"
                              onClick={(e) => handleRetryItem(item.id, e)}
                              className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 flex items-center gap-1 font-semibold cursor-pointer"
                              title={item.error}
                            >
                              <RotateCcw className="w-3 h-3" /> Retry
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={(e) => handleRemoveFile(item.id, e)}
                            className="p-1 text-zinc-400 hover:text-red-500 cursor-pointer rounded"
                            title="Remove from batch"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Batch Progress Bar during Generation */}
            {isGenerating && batchFiles.length > 1 && (
              <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 space-y-2 animate-in fade-in">
                <div className="flex items-center justify-between text-xs font-mono text-blue-900 dark:text-blue-200 font-semibold">
                  <span>
                    Batch Progress: {batchProgress.current} / {batchProgress.total} Schematics
                  </span>
                  <span>{batchProgress.percent}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-blue-200 dark:bg-blue-900/60 overflow-hidden">
                  <div
                    className="h-full bg-blue-600 dark:bg-blue-400 transition-all duration-300"
                    style={{ width: `${batchProgress.percent}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-blue-700 dark:text-blue-300">
                  <span className="truncate max-w-xs">{batchProgress.currentName}</span>
                  <button
                    type="button"
                    onClick={() => {
                      abortBatchRef.current = true;
                    }}
                    className="text-red-600 dark:text-red-400 hover:underline flex items-center gap-1 cursor-pointer font-semibold shrink-0"
                  >
                    <StopCircle className="w-3 h-3" /> Stop Batch
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Technical Engineering Prompt Card */}
          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 font-mono flex items-center gap-2">
                <Wand2 className="w-4 h-4 text-zinc-900 dark:text-zinc-100" />
                <span>Engineering Render Prompt (Applied to All)</span>
              </label>
              <button
                type="button"
                onClick={handleResetPrompt}
                className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-mono cursor-pointer"
              >
                Reset to Standard Prompt
              </button>
            </div>

            <textarea
              rows={5}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Engineering prompt describing exact material shaders and assembly rendering..."
              className="w-full p-4 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white resize-y font-mono transition-all leading-relaxed"
            />

            <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span>Specifies cast aluminum, CNC steel, polished chrome, zinc bolts, rubber seals & preserved callout indices.</span>
            </div>
          </div>

          {/* Engine & Leonardo Configuration */}
          <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 font-mono">
                  Engine: {leonardoApiKey.trim() ? 'Leonardo.ai ControlNet (API Key Configured)' : 'Built-in Free ControlNet LineArt (FLUX.1)'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowApiSettings(!showApiSettings)}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-mono cursor-pointer flex items-center gap-1"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                {showApiSettings ? 'Hide Leonardo Settings' : 'Configure Leonardo API'}
              </button>
            </div>

            {showApiSettings && (
              <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-2 animate-in fade-in">
                <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono">
                  <span>Leonardo.ai API Key:</span>
                  <a
                    href="https://app.leonardo.ai/api-access"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Get Key from Leonardo →
                  </a>
                </div>
                <input
                  type="password"
                  value={leonardoApiKey}
                  onChange={(e) => {
                    setLeonardoApiKey(e.target.value);
                    localStorage.setItem('leonardo_api_key', e.target.value);
                  }}
                  placeholder="Paste Leonardo API Key here (or leave empty to use 100% Free Engine)"
                  className="w-full p-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-xs font-mono text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white"
                />
                <p className="text-[10px] text-zinc-400">
                  Key saved locally. When provided, batch requests run via Leonardo's Line Art ControlNet API with preserved callout numbers.
                </p>
                <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
                  <span className="text-zinc-600 dark:text-zinc-400 text-[11px]">Don't have an API key because of card verification?</span>
                  <a
                    href="https://app.leonardo.ai"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium flex items-center gap-1 cursor-pointer text-xs shrink-0"
                  >
                    Open Leonardo Web (150 Free Tokens) →
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Aspect Ratio Selector */}
          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 font-mono flex items-center gap-2">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Aspect Ratio (Recommended: 3:4 Catalogue)</span>
              </label>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {ASPECT_RATIOS.map((ar) => {
                const isSelected = aspectRatio === ar.id;
                return (
                  <button
                    key={ar.id}
                    type="button"
                    onClick={() => setAspectRatio(ar.id)}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                      isSelected
                        ? 'border-black bg-zinc-100 text-black dark:border-white dark:bg-zinc-900 dark:text-white ring-1 ring-black dark:ring-white font-semibold'
                        : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900/50'
                    }`}
                  >
                    <div className="text-xs">{ar.label}</div>
                    <div className="text-[10px] text-zinc-500 font-mono mt-0.5">{ar.sub}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Error Alert */}
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 text-xs flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Primary Action Button */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || batchFiles.length === 0}
            className="w-full py-4 px-6 rounded-2xl bg-zinc-900 text-white hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-100 font-bold text-sm tracking-wide shadow-xl flex items-center justify-center gap-2.5 transition-all transform active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>{generationStep || 'Processing 3D CAD Renders...'}</span>
              </>
            ) : batchFiles.length === 0 ? (
              <>
                <Upload className="w-5 h-5" />
                <span>Upload Schematic Diagram(s) to Enable 3D Render</span>
              </>
            ) : batchFiles.length === 1 ? (
              <>
                <Sparkles className="w-5 h-5 text-amber-400 dark:text-amber-500" />
                <span>Analyse Schematic & Generate 3D CAD Render</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5 text-amber-400 dark:text-amber-500" />
                <span>Start Batch 3D CAD Render ({batchFiles.length} Schematics)</span>
              </>
            )}
          </button>
        </div>

        {/* Right Column: Output Canvas & Batch Gallery (5 cols) */}
        <div className="lg:col-span-5 space-y-5 sticky top-20">
          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 font-mono">
                  3D CAD Output
                </span>
                {currentResult && currentResult.referenceUrl && (
                  <div className="flex items-center rounded-lg bg-zinc-100 dark:bg-zinc-900 p-0.5 border border-zinc-200 dark:border-zinc-800 text-[10px] font-mono">
                    <button
                      onClick={() => setViewMode('render')}
                      className={`px-2 py-0.5 rounded cursor-pointer ${
                        viewMode === 'render' ? 'bg-black text-white dark:bg-white dark:text-black font-semibold' : 'text-zinc-500'
                      }`}
                    >
                      3D Render
                    </button>
                    <button
                      onClick={() => setViewMode('schematic')}
                      className={`px-2 py-0.5 rounded cursor-pointer ${
                        viewMode === 'schematic' ? 'bg-black text-white dark:bg-white dark:text-black font-semibold' : 'text-zinc-500'
                      }`}
                    >
                      Original
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {/* Download All as ZIP button when multiple completed */}
                {completedCount >= 1 && (
                  <button
                    onClick={handleDownloadAllZip}
                    disabled={isZipping}
                    title="Download all generated renders in a ZIP file"
                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-all cursor-pointer text-xs font-semibold flex items-center gap-1 shadow-sm disabled:opacity-50"
                  >
                    {isZipping ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
                    <span>{isZipping ? 'Zipping...' : `Download ZIP (${completedCount})`}</span>
                  </button>
                )}

                {currentResult && (
                  <>
                    <button
                      onClick={() => handleCopy(currentResult)}
                      title="Copy image"
                      className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-600 dark:text-zinc-300 transition-colors cursor-pointer text-xs flex items-center gap-1"
                    >
                      {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'Copied!' : 'Copy'}</span>
                    </button>
                    <button
                      onClick={() => setFullscreenImage(currentResult.url)}
                      title="Fullscreen inspector"
                      className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-600 dark:text-zinc-300 transition-colors cursor-pointer"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDownload(currentResult)}
                      title="Download High-Res CAD Render"
                      className="p-1.5 rounded-lg bg-black text-white dark:bg-white dark:text-black hover:opacity-90 transition-all cursor-pointer text-xs font-semibold flex items-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Image Canvas Container */}
            <div className="relative w-full aspect-[3/4] rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-center">
              {isGenerating ? (
                <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
                  <div className="relative w-14 h-14">
                    <div className="absolute inset-0 rounded-full border-2 border-zinc-300 dark:border-zinc-700 animate-ping opacity-30" />
                    <div className="w-14 h-14 rounded-full border-2 border-black dark:border-white border-t-transparent animate-spin" />
                  </div>
                  <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 font-mono">
                    {generationStep || 'Processing 3D CAD Assembly...'}
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400 max-w-xs">
                    Synthesizing cast aluminum, brushed steel & chrome shaders along exploded axes...
                  </div>
                </div>
              ) : currentResult ? (
                <div className="w-full h-full relative flex items-center justify-center p-2">
                  <img
                    src={viewMode === 'schematic' && currentResult.referenceUrl ? currentResult.referenceUrl : currentResult.url}
                    alt={currentResult.prompt}
                    className="max-w-full max-h-full object-contain cursor-zoom-in"
                    onClick={() =>
                      setFullscreenImage(
                        viewMode === 'schematic' && currentResult.referenceUrl ? currentResult.referenceUrl : currentResult.url
                      )
                    }
                  />
                  <div className="absolute top-3 left-3 px-2 py-0.5 rounded bg-black/75 backdrop-blur-sm text-white text-[10px] font-mono">
                    {viewMode === 'schematic' ? '2D Schematic Diagram' : '3D Photorealistic Render'}
                  </div>
                </div>
              ) : activeItem ? (
                <div className="w-full h-full relative flex flex-col items-center justify-center p-4">
                  <img
                    src={activeItem.previewUrl}
                    alt={activeItem.name}
                    className="max-w-full max-h-[75%] object-contain rounded opacity-90"
                  />
                  <div className="mt-3 text-xs font-semibold text-zinc-700 dark:text-zinc-300 font-mono">
                    {activeItem.name}
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    Schematic loaded. Click "Start 3D CAD Render" to generate.
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 p-8 text-center text-zinc-400 dark:text-zinc-600">
                  <Cpu className="w-12 h-12 stroke-[1.5]" />
                  <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    No 3D CAD Render Generated Yet
                  </div>
                  <div className="text-[11px] max-w-xs text-zinc-500">
                    Upload schematic diagram(s) on the left and click "Analyse Schematic & Generate 3D CAD Render".
                  </div>
                </div>
              )}
            </div>

            {/* Prompt Meta Display */}
            {currentResult && (
              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 text-xs space-y-2 font-mono">
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Schematic Rendered Successfully</span>
                </div>
                <div className="text-zinc-700 dark:text-zinc-300 font-sans text-xs line-clamp-2">
                  {currentResult.prompt}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-500 dark:text-zinc-400 pt-1.5 border-t border-zinc-200 dark:border-zinc-800">
                  <span>Engine: {currentResult.engine}</span>
                  <span>•</span>
                  <span>Ratio: {currentResult.aspectRatio}</span>
                  {currentResult.seed && (
                    <>
                      <span>•</span>
                      <span>Seed: {currentResult.seed}</span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Batch Carousel / History Gallery */}
          {history.length > 0 && (
            <div className="p-5 rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 font-mono">
                <span>Recent 3D CAD Renders ({history.length})</span>
                <button
                  onClick={() => setHistory([])}
                  className="text-[10px] text-zinc-400 hover:text-red-500 cursor-pointer"
                >
                  Clear History
                </button>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {history.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setCurrentResult(item);
                      setViewMode('render');
                    }}
                    className={`aspect-[3/4] rounded-lg overflow-hidden border transition-all cursor-pointer ${
                      currentResult?.id === item.id
                        ? 'border-black dark:border-white ring-2 ring-black dark:ring-white scale-95'
                        : 'border-zinc-200 dark:border-zinc-800 hover:opacity-80'
                    }`}
                  >
                    <img src={item.url} alt={item.prompt} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen Lightbox Modal */}
      {fullscreenImage && (
        <div
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setFullscreenImage(null)}
        >
          <div className="relative max-w-5xl max-h-[92vh] flex flex-col items-center">
            <button
              onClick={() => setFullscreenImage(null)}
              className="absolute -top-10 right-0 text-white/80 hover:text-white p-2 cursor-pointer"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={fullscreenImage}
              alt="Fullscreen 3D CAD Preview"
              className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl bg-white"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
};
