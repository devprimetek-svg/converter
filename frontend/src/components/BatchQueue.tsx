import React, { useState, useRef, useEffect } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileArchive,
  Layers,
  Trash2,
  Eye,
  Play,
  X,
} from 'lucide-react';
import { PartsTable } from './PartsTable';
import type { PartRow } from '../types';

export interface BatchQueueItem {
  id: string;
  file: File;
  status: 'queued' | 'processing' | 'completed' | 'error';
  job_id: string | null;
  progress_pct: number;
  details: string;
  step_name: string;
  model_code: string | null;
  model_columns: string[];
  total_rows: number;
  images_count: number;
  excel_filename?: string;
  zip_filename?: string;
  rows?: PartRow[];
  error?: string;
}

export const BatchQueue: React.FC = () => {
  const [queue, setQueue] = useState<BatchQueueItem[]>([]);
  const [isProcessingBatch, setIsProcessingBatch] = useState<boolean>(false);
  const [cleanParts, setCleanParts] = useState<boolean>(true);

  // Watermark presets (matching standard specifications)
  const [wmText] = useState<string>('IndiaSpare');
  const [wmRotation] = useState<number>(-30);
  const [wmPadding] = useState<number>(115);
  const [wmOpacity] = useState<number>(10);
  const [wmColor] = useState<string>('#1E3A8A');

  // Resizer presets
  const [resizeWidth] = useState<number>(1000);
  const [resizeHeight] = useState<number>(1200);

  // Batch download loading states
  const [isDownloadingConsolidated, setIsDownloadingConsolidated] = useState<boolean>(false);
  const [isDownloadingBatchZip, setIsDownloadingBatchZip] = useState<boolean>(false);

  // Inspection modal
  const [inspectingItem, setInspectingItem] = useState<BatchQueueItem | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeSseConnections = useRef<Map<string, EventSource>>(new Map());

  // Cleanup SSE connections on unmount
  useEffect(() => {
    return () => {
      activeSseConnections.current.forEach((sse) => sse.close());
      activeSseConnections.current.clear();
    };
  }, []);

  const addFilesToQueue = (files: FileList | File[]) => {
    const newItems: BatchQueueItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.name.toLowerCase().endsWith('.pdf')) {
        newItems.push({
          id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          file,
          status: 'queued',
          job_id: null,
          progress_pct: 0,
          details: 'Waiting in queue...',
          step_name: 'Queued',
          model_code: null,
          model_columns: [],
          total_rows: 0,
          images_count: 0,
        });
      }
    }
    if (newItems.length > 0) {
      setQueue((prev) => [...prev, ...newItems]);
    }
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFilesToQueue(e.dataTransfer.files);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFilesToQueue(e.target.files);
      e.target.value = '';
    }
  };

  const removeItem = (id: string) => {
    const sse = activeSseConnections.current.get(id);
    if (sse) {
      sse.close();
      activeSseConnections.current.delete(id);
    }
    setQueue((prev) => prev.filter((item) => item.id !== id));
  };

  const clearCompleted = () => {
    setQueue((prev) => prev.filter((item) => item.status !== 'completed'));
  };

  const clearAll = () => {
    activeSseConnections.current.forEach((sse) => sse.close());
    activeSseConnections.current.clear();
    setQueue([]);
    setIsProcessingBatch(false);
  };

  // Process a single file item with auto_proceed=true
  const processItem = async (item: BatchQueueItem): Promise<void> => {
    const updateItem = (fields: Partial<BatchQueueItem>) => {
      setQueue((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, ...fields } : it))
      );
    };

    updateItem({ status: 'processing', details: 'Uploading and parsing PDF...', progress_pct: 5 });

    const formData = new FormData();
    formData.append('file', item.file);
    formData.append('watermark_type', 'text');
    formData.append('watermark_text', wmText);
    formData.append('watermark_rotation', String(wmRotation));
    formData.append('watermark_padding', String(wmPadding));
    formData.append('watermark_size_pct', '25');
    formData.append('watermark_opacity', String(wmOpacity / 100));
    formData.append('watermark_color', wmColor);
    formData.append('watermark_is_tiled', 'true');
    formData.append('auto_proceed', 'true');
    formData.append('resize_width', String(resizeWidth));
    formData.append('resize_height', String(resizeHeight));
    formData.append('resize_quality', '100');
    formData.append('target_min_kb', '59');
    formData.append('target_max_kb', '69');
    formData.append('clean_part_numbers', String(cleanParts));

    try {
      const startRes = await fetch('/api/pipeline/start', {
        method: 'POST',
        body: formData,
      });

      if (!startRes.ok) {
        const err = await startRes.json().catch(() => ({}));
        throw new Error(err.detail || `Upload failed with status ${startRes.status}`);
      }

      const { job_id } = await startRes.json();
      updateItem({ job_id, details: 'Processing pipeline...', progress_pct: 15 });

      // Connect SSE
      await new Promise<void>((resolve, reject) => {
        let isDone = false;
        const sse = new EventSource(`/api/pipeline/stream/${job_id}`);
        activeSseConnections.current.set(item.id, sse);

        const timeout = setTimeout(() => {
          if (!isDone) {
            sse.close();
            activeSseConnections.current.delete(item.id);
            reject(new Error('Processing timed out after 300 seconds'));
          }
        }, 300000);

        sse.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const mCode = data.model_columns?.[0] || null;

            updateItem({
              progress_pct: data.progress_pct ?? 20,
              details: data.details || 'Processing...',
              step_name: data.step_name || 'Working',
              model_code: mCode,
              model_columns: data.model_columns || [],
              total_rows: data.total_rows || 0,
              images_count: data.images_processed || data.total_images || 0,
              rows: data.rows || undefined,
            });

            if (data.status === 'completed') {
              isDone = true;
              clearTimeout(timeout);
              sse.close();
              activeSseConnections.current.delete(item.id);
              updateItem({
                status: 'completed',
                progress_pct: 100,
                details: `Extracted ${data.total_rows} parts & ${data.images_processed} diagrams`,
                step_name: 'Done',
                model_code: mCode,
                model_columns: data.model_columns || [],
                total_rows: data.total_rows || 0,
                images_count: data.images_processed || 0,
                excel_filename: data.excel_filename,
                zip_filename: data.zip_filename,
                rows: data.rows || undefined,
              });
              resolve();
            } else if (data.status === 'error') {
              isDone = true;
              clearTimeout(timeout);
              sse.close();
              activeSseConnections.current.delete(item.id);
              updateItem({
                status: 'error',
                error: data.error || 'Pipeline processing failed',
                details: data.error || 'Pipeline processing failed',
              });
              reject(new Error(data.error || 'Pipeline processing failed'));
            }
          } catch {
            // Ignore parse errors on heartbeat
          }
        };

        sse.onerror = () => {
          // Fallback to polling status if SSE closes unexpectedly
          fetch(`/api/pipeline/status/${job_id}`)
            .then((r) => r.json())
            .then((st) => {
              if (st.status === 'completed') {
                isDone = true;
                clearTimeout(timeout);
                sse.close();
                activeSseConnections.current.delete(item.id);
                updateItem({
                  status: 'completed',
                  progress_pct: 100,
                  details: `Extracted ${st.total_rows} parts & ${st.images_processed} diagrams`,
                  step_name: 'Done',
                  model_code: st.model_columns?.[0] || null,
                  model_columns: st.model_columns || [],
                  total_rows: st.total_rows || 0,
                  images_count: st.images_processed || 0,
                  rows: st.rows || undefined,
                });
                resolve();
              }
            })
            .catch(() => {});
        };
      });
    } catch (err: any) {
      updateItem({
        status: 'error',
        error: err.message || 'Error occurred during processing',
        details: err.message || 'Error occurred during processing',
      });
    }
  };

  // Start processing all queued items sequentially (or 2 concurrent)
  const startBatch = async () => {
    setIsProcessingBatch(true);
    const queuedItems = queue.filter((it) => it.status === 'queued');

    for (const item of queuedItems) {
      await processItem(item);
    }

    setIsProcessingBatch(false);
  };

  // Download Consolidated Master Excel combining all completed jobs
  const handleDownloadConsolidatedExcel = async () => {
    const completedJobIds = queue
      .filter((it) => it.status === 'completed' && it.job_id)
      .map((it) => it.job_id as string);

    if (completedJobIds.length === 0) return;

    setIsDownloadingConsolidated(true);
    try {
      const res = await fetch('/api/pipeline/batch-consolidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_ids: completedJobIds,
          clean_parts: cleanParts,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to generate Consolidated Master Excel.');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Consolidated_Master_Parts_Catalogue.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err: any) {
      alert(`Error generating Consolidated Excel: ${err.message}`);
    } finally {
      setIsDownloadingConsolidated(false);
    }
  };

  // Download Master ZIP containing all excels, images, and master workbook
  const handleDownloadBatchMasterZip = async () => {
    const completedJobIds = queue
      .filter((it) => it.status === 'completed' && it.job_id)
      .map((it) => it.job_id as string);

    if (completedJobIds.length === 0) return;

    setIsDownloadingBatchZip(true);
    try {
      const res = await fetch('/api/pipeline/batch-download-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_ids: completedJobIds,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to compile Batch Master ZIP.');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ConverterStudio_Batch_Master_Bundle.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err: any) {
      alert(`Error compiling Batch Master ZIP: ${err.message}`);
    } finally {
      setIsDownloadingBatchZip(false);
    }
  };

  const completedCount = queue.filter((it) => it.status === 'completed').length;
  const totalPartsExtracted = queue.reduce((acc, it) => acc + (it.total_rows || 0), 0);
  const totalImagesExtracted = queue.reduce((acc, it) => acc + (it.images_count || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header & Metric Banner */}
      <div className="p-6 rounded-3xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
              <Layers className="w-3.5 h-3.5 text-blue-600" />
              Upgrade 1: Multi-PDF Batch Processing
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
              Bulk Catalogue Processing Queue
            </h2>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
              Queue 10+ catalogue PDFs simultaneously. Auto-extract parts, watermarked 1000x1200 diagrams, and download a single multi-sheet <strong>Consolidated Master Excel</strong>.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <input
                type="checkbox"
                checked={cleanParts}
                onChange={(e) => setCleanParts(e.target.checked)}
                className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-zinc-700 dark:text-zinc-300 font-medium">Clean Part No (12 Char)</span>
            </label>
          </div>
        </div>

        {/* Global Batch Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-850">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={startBatch}
              disabled={isProcessingBatch || queue.filter((it) => it.status === 'queued').length === 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none text-white text-xs sm:text-sm font-bold shadow-sm transition-all cursor-pointer"
            >
              {isProcessingBatch ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing Batch ({queue.filter((it) => it.status === 'processing').length} active)...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Process All Queued ({queue.filter((it) => it.status === 'queued').length})
                </>
              )}
            </button>

            {completedCount > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleDownloadConsolidatedExcel}
                  disabled={isDownloadingConsolidated}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs sm:text-sm font-bold shadow-sm transition-all cursor-pointer"
                  title="Download a single Excel file with Consolidated_Master and individual sheets for each model"
                >
                  {isDownloadingConsolidated ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="w-4 h-4" />
                  )}
                  Consolidated Master Excel ({completedCount})
                </button>

                <button
                  type="button"
                  onClick={handleDownloadBatchMasterZip}
                  disabled={isDownloadingBatchZip}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-black dark:bg-white dark:hover:bg-zinc-200 dark:text-zinc-900 text-white text-xs sm:text-sm font-bold shadow-sm transition-all cursor-pointer"
                  title="Download all Excels + Images + Master Workbook in one ZIP bundle"
                >
                  {isDownloadingBatchZip ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white dark:text-zinc-900" />
                  ) : (
                    <FileArchive className="w-4 h-4" />
                  )}
                  Batch Master ZIP Bundle
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {completedCount > 0 && (
              <button
                type="button"
                onClick={clearCompleted}
                className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 text-xs font-semibold cursor-pointer"
              >
                Clear Finished
              </button>
            )}
            {queue.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-semibold cursor-pointer"
              >
                Clear All
              </button>
            )}
          </div>
        </div>

        {/* Aggregate Stats */}
        {queue.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-850 font-mono text-xs">
            <div>
              <p className="text-zinc-400 uppercase text-[10px]">Total Files</p>
              <p className="text-lg font-bold text-zinc-900 dark:text-white">{queue.length}</p>
            </div>
            <div>
              <p className="text-zinc-400 uppercase text-[10px]">Completed</p>
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{completedCount} / {queue.length}</p>
            </div>
            <div>
              <p className="text-zinc-400 uppercase text-[10px]">Total Parts</p>
              <p className="text-lg font-bold text-zinc-900 dark:text-white">{totalPartsExtracted}</p>
            </div>
            <div>
              <p className="text-zinc-400 uppercase text-[10px]">Total Diagrams</p>
              <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{totalImagesExtracted}</p>
            </div>
          </div>
        )}
      </div>

      {/* Multi-file Drag & Drop Zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleFileDrop}
        onClick={() => fileInputRef.current?.click()}
        className="group relative border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-blue-500 dark:hover:border-blue-400 rounded-3xl p-8 text-center bg-white/50 dark:bg-zinc-950/50 hover:bg-blue-50/20 dark:hover:bg-blue-950/10 transition-all cursor-pointer"
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf"
          onChange={handleFileInputChange}
          className="hidden"
        />
        <div className="flex flex-col items-center justify-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:scale-105 transition-transform shadow-xs">
            <UploadCloud className="w-7 h-7" />
          </div>
          <div>
            <p className="text-sm sm:text-base font-bold text-zinc-900 dark:text-white">
              Drop multiple Catalogue PDFs here or click to browse
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Select 5, 10, or 20+ PDF catalogues. They will be added to the bulk queue.
            </p>
          </div>
        </div>
      </div>

      {/* Queue Items Table / Cards */}
      {queue.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-bold font-mono text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
              Batch Queue ({queue.length} files)
            </h3>
          </div>

          <div className="space-y-2.5">
            {queue.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all"
              >
                {/* Left: File Info & Progress */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-sm text-zinc-900 dark:text-white font-mono truncate max-w-xs sm:max-w-md">
                      {item.file.name}
                    </span>
                    <span className="text-[11px] text-zinc-400 font-mono">
                      ({(item.file.size / (1024 * 1024)).toFixed(2)} MB)
                    </span>

                    {/* Status badge */}
                    {item.status === 'queued' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        Queued
                      </span>
                    )}
                    {item.status === 'processing' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {item.progress_pct}%
                      </span>
                    )}
                    {item.status === 'completed' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                        <CheckCircle2 className="w-3 h-3" />
                        Completed
                      </span>
                    )}
                    {item.status === 'error' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                        <AlertCircle className="w-3 h-3" />
                        Error
                      </span>
                    )}

                    {/* Model badge */}
                    {item.model_code && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-extrabold bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                        Model: {item.model_code}
                      </span>
                    )}
                  </div>

                  {/* Progress bar */}
                  {item.status === 'processing' && (
                    <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${item.progress_pct}%` }}
                      />
                    </div>
                  )}

                  <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono truncate">
                    {item.details}
                  </p>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {item.status === 'completed' && item.job_id && (
                    <>
                      {item.rows && item.rows.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setInspectingItem(item)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-semibold cursor-pointer"
                          title="Inspect & Edit Parts Table"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Inspect</span>
                        </button>
                      )}

                      <a
                        href={`/api/pipeline/download-excel/${item.job_id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs font-semibold border border-blue-200 dark:border-blue-800 cursor-pointer"
                        title="Download individual model Excel"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        <span>Excel</span>
                      </a>

                      <a
                        href={`/api/pipeline/download/${item.job_id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-semibold cursor-pointer"
                        title="Download individual model ZIP package"
                      >
                        <FileArchive className="w-3.5 h-3.5" />
                        <span>ZIP</span>
                      </a>
                    </>
                  )}

                  {item.status === 'queued' && !isProcessingBatch && (
                    <button
                      type="button"
                      onClick={() => processItem(item)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                    >
                      <Play className="w-3 h-3" />
                      <span>Process</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                    title="Remove from queue"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inspect & Edit Modal */}
      {inspectingItem && inspectingItem.rows && (
        <div
          onClick={() => setInspectingItem(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-6xl max-h-[92vh] bg-white dark:bg-zinc-900 rounded-3xl overflow-hidden shadow-2xl flex flex-col border border-zinc-200 dark:border-zinc-800"
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-zinc-900 dark:text-white font-mono flex items-center gap-2">
                  <span>{inspectingItem.file.name}</span>
                  {inspectingItem.model_code && (
                    <span className="px-2 py-0.5 rounded text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                      {inspectingItem.model_code}
                    </span>
                  )}
                </h3>
                <p className="text-xs text-zinc-500 font-mono">
                  {inspectingItem.total_rows} parts • In-app editable grid with live validation
                </p>
              </div>

              <button
                type="button"
                onClick={() => setInspectingItem(null)}
                className="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              <PartsTable
                rows={inspectingItem.rows}
                modelColumns={inspectingItem.model_columns}
                cleanParts={cleanParts}
                onRowsUpdate={(updatedRows) => {
                  setQueue((prev) =>
                    prev.map((it) =>
                      it.id === inspectingItem.id
                        ? { ...it, rows: updatedRows, total_rows: updatedRows.length }
                        : it
                    )
                  );
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
