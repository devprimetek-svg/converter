import React, { useState, useRef } from 'react';
import {
  FileArchive,
  Download,
  Sliders,
  Crop,
  Loader2,
  Trash2,
  Image as ImageIcon,
} from 'lucide-react';
import JSZip from 'jszip';

interface ImageItem {
  id: string;
  file: File;
  name: string;
  originalWidth: number;
  originalHeight: number;
  originalSize: number;
  dataUrl: string;
  resizedBlob?: Blob;
  resizedWidth?: number;
  resizedHeight?: number;
  resizedSize?: number;
  status: 'idle' | 'processing' | 'done' | 'error';
}

type ResizeMode = 'percentage' | 'dimensions' | 'max_edge';

export const BulkImageResizer: React.FC = () => {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [mode, setMode] = useState<ResizeMode>('percentage');
  const [percentage, setPercentage] = useState<number>(50);
  const [targetWidth, setTargetWidth] = useState<number>(1920);
  const [targetHeight, setTargetHeight] = useState<number>(1080);
  const [maintainAspect, setMaintainAspect] = useState<boolean>(true);
  const [maxEdge, setMaxEdge] = useState<number>(1920);
  const [format, setFormat] = useState<string>('ORIGINAL');
  const [quality, setQuality] = useState<number>(85);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isZipping, setIsZipping] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFilesAdded = async (files: FileList | File[]) => {
    const newItems: ImageItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (!f.type.startsWith('image/')) continue;

      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(f);
      });

      const { width, height } = await new Promise<{ width: number; height: number }>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.src = dataUrl;
      });

      newItems.push({
        id: `img_${Date.now()}_${i}`,
        file: f,
        name: f.name,
        originalWidth: width,
        originalHeight: height,
        originalSize: f.size,
        dataUrl,
        status: 'idle',
      });
    }

    setItems((prev) => [...prev, ...newItems]);
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const calculateNewDimensions = (w: number, h: number): [number, number] => {
    if (mode === 'percentage') {
      const scale = percentage / 100;
      return [Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale))];
    } else if (mode === 'max_edge') {
      if (w >= h) {
        const scale = maxEdge / w;
        return [maxEdge, Math.max(1, Math.round(h * scale))];
      } else {
        const scale = maxEdge / h;
        return [Math.max(1, Math.round(w * scale)), maxEdge];
      }
    } else {
      // Dimensions mode
      if (maintainAspect) {
        const scale = Math.min(targetWidth / w, targetHeight / h);
        return [Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale))];
      }
      return [targetWidth, targetHeight];
    }
  };

  const processBatch = async () => {
    if (items.length === 0) return;
    setIsProcessing(true);

    const updated = [...items];

    for (let i = 0; i < updated.length; i++) {
      const item = updated[i];
      item.status = 'processing';
      setItems([...updated]);

      try {
        const [nw, nh] = calculateNewDimensions(item.originalWidth, item.originalHeight);
        const canvas = document.createElement('canvas');
        canvas.width = nw;
        canvas.height = nh;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas context unavailable');

        const img = new Image();
        await new Promise((resolve) => {
          img.onload = resolve;
          img.src = item.dataUrl;
        });

        ctx.drawImage(img, 0, 0, nw, nh);

        // Determine output mime type
        let mime = item.file.type;
        if (format === 'JPG' || format === 'JPEG') mime = 'image/jpeg';
        else if (format === 'PNG') mime = 'image/png';
        else if (format === 'WEBP') mime = 'image/webp';

        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob(resolve, mime, quality / 100);
        });

        if (!blob) throw new Error('Failed to create image blob');

        item.resizedBlob = blob;
        item.resizedWidth = nw;
        item.resizedHeight = nh;
        item.resizedSize = blob.size;
        item.status = 'done';
      } catch {
        item.status = 'error';
      }

      setItems([...updated]);
    }

    setIsProcessing(false);
  };

  const downloadSingle = (item: ImageItem) => {
    if (!item.resizedBlob) return;
    const url = URL.createObjectURL(item.resizedBlob);
    const a = document.createElement('a');
    a.href = url;
    const ext = format === 'ORIGINAL' ? item.name.split('.').pop() : format.toLowerCase();
    const base = item.name.substring(0, item.name.lastIndexOf('.')) || item.name;
    a.download = `${base}_${item.resizedWidth}x${item.resizedHeight}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadAllZip = async () => {
    setIsZipping(true);
    try {
      const zip = new JSZip();
      for (const item of items) {
        if (!item.resizedBlob) continue;
        const ext = format === 'ORIGINAL' ? item.name.split('.').pop() : format.toLowerCase();
        const base = item.name.substring(0, item.name.lastIndexOf('.')) || item.name;
        const fname = `${base}_${item.resizedWidth}x${item.resizedHeight}.${ext}`;
        zip.file(fname, item.resizedBlob);
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'resized_images.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Failed to build ZIP archive.');
    } finally {
      setIsZipping(false);
    }
  };

  const formatBytes = (bytes?: number) => {
    if (bytes === undefined || bytes === null) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      {/* Upload Zone when empty */}
      {items.length === 0 && (
        <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-300">
          <div className="text-center space-y-2">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900">
              High-Speed Batch Resizer
            </span>
            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Bulk Image Resizer
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Resize dozens of PNG, JPG, and WebP images simultaneously with custom dimensions, scaling, and compression.
            </p>
          </div>

          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files) handleFilesAdded(e.dataTransfer.files);
            }}
            className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 rounded-3xl p-10 text-center cursor-pointer bg-white dark:bg-slate-900/60 hover:bg-emerald-50/20 transition-all shadow-sm"
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleFilesAdded(e.target.files);
              }}
            />
            <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-100 dark:border-emerald-900 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-4">
              <ImageIcon className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">
              Drop multiple images here or click to select
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Supports JPEG, PNG, WebP, GIF, and BMP
            </p>
          </div>
        </div>
      )}

      {/* Main Workspace when images are loaded */}
      {items.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Controls Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-emerald-600" />
                  Resize Options
                </h3>
                <span className="text-xs text-slate-500 font-mono">{items.length} files</span>
              </div>

              {/* Mode Selection */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Resize Mode
                </label>
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-semibold">
                  <button
                    onClick={() => setMode('percentage')}
                    className={`py-1.5 rounded-lg transition-all ${
                      mode === 'percentage'
                        ? 'bg-white dark:bg-slate-900 text-emerald-600 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    Percent
                  </button>
                  <button
                    onClick={() => setMode('dimensions')}
                    className={`py-1.5 rounded-lg transition-all ${
                      mode === 'dimensions'
                        ? 'bg-white dark:bg-slate-900 text-emerald-600 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    Exact
                  </button>
                  <button
                    onClick={() => setMode('max_edge')}
                    className={`py-1.5 rounded-lg transition-all ${
                      mode === 'max_edge'
                        ? 'bg-white dark:bg-slate-900 text-emerald-600 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    Max Edge
                  </button>
                </div>
              </div>

              {/* Percentage Mode Controls */}
              {mode === 'percentage' && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-600 dark:text-slate-400">Scale Ratio:</span>
                    <span className="font-bold font-mono text-emerald-600">{percentage}%</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={200}
                    value={percentage}
                    onChange={(e) => setPercentage(Number(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                  <div className="flex gap-1.5">
                    {[25, 50, 75, 100].map((p) => (
                      <button
                        key={p}
                        onClick={() => setPercentage(p)}
                        className={`flex-1 py-1 rounded-md text-xs font-semibold border ${
                          percentage === p
                            ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {p}%
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Exact Dimensions Mode */}
              {mode === 'dimensions' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-slate-500 font-medium">Width (px)</label>
                      <input
                        type="number"
                        value={targetWidth}
                        onChange={(e) => setTargetWidth(Number(e.target.value))}
                        className="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-500 font-medium">Height (px)</label>
                      <input
                        type="number"
                        value={targetHeight}
                        onChange={(e) => setTargetHeight(Number(e.target.value))}
                        className="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono font-bold"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={maintainAspect}
                      onChange={(e) => setMaintainAspect(e.target.checked)}
                      className="rounded text-emerald-600"
                    />
                    <span>Maintain Aspect Ratio</span>
                  </label>
                </div>
              )}

              {/* Max Edge Mode */}
              {mode === 'max_edge' && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-600 dark:text-slate-400">Longest Edge:</span>
                    <span className="font-bold font-mono text-emerald-600">{maxEdge} px</span>
                  </div>
                  <input
                    type="range"
                    min={400}
                    max={3840}
                    step={100}
                    value={maxEdge}
                    onChange={(e) => setMaxEdge(Number(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                  <div className="flex gap-1.5">
                    {[1080, 1920, 2560].map((res) => (
                      <button
                        key={res}
                        onClick={() => setMaxEdge(res)}
                        className={`flex-1 py-1 rounded-md text-xs font-semibold border ${
                          maxEdge === res
                            ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {res}p
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Format & Quality */}
              <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-slate-500 font-medium">Format</label>
                    <select
                      value={format}
                      onChange={(e) => setFormat(e.target.value)}
                      className="w-full mt-1 px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium"
                    >
                      <option value="ORIGINAL">Keep Original</option>
                      <option value="JPG">JPG / JPEG</option>
                      <option value="PNG">PNG</option>
                      <option value="WEBP">WebP</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 font-medium">
                      Quality ({quality}%)
                    </label>
                    <input
                      type="range"
                      min={20}
                      max={100}
                      value={quality}
                      onChange={(e) => setQuality(Number(e.target.value))}
                      className="w-full mt-2 accent-emerald-600"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-3">
                <button
                  onClick={processBatch}
                  disabled={isProcessing}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing Images...
                    </>
                  ) : (
                    <>
                      <Crop className="w-4 h-4" />
                      Apply Resize to All
                    </>
                  )}
                </button>

                {items.some((it) => it.resizedBlob) && (
                  <button
                    onClick={downloadAllZip}
                    disabled={isZipping}
                    className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-2 transition-colors"
                  >
                    <FileArchive className="w-4 h-4" />
                    {isZipping ? 'Creating ZIP...' : 'Download All as ZIP'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Table / Grid of Images */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                Loaded Images ({items.length})
              </h4>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  + Add More
                </button>
                <button
                  onClick={() => setItems([])}
                  className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                >
                  Clear All
                </button>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleFilesAdded(e.target.files);
              }}
            />

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[600px] overflow-y-auto">
                {items.map((it) => {
                  const [calcW, calcH] = calculateNewDimensions(
                    it.originalWidth,
                    it.originalHeight
                  );
                  return (
                    <div
                      key={it.id}
                      className="p-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={it.dataUrl}
                          alt={it.name}
                          className="w-12 h-12 rounded-lg object-cover bg-slate-100 dark:bg-slate-800 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                            {it.name}
                          </p>
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono mt-0.5">
                            <span>
                              Orig: {it.originalWidth}×{it.originalHeight} ({formatBytes(it.originalSize)})
                            </span>
                            <span>&rarr;</span>
                            <span className="text-emerald-600 font-semibold">
                              New: {it.resizedWidth || calcW}×{it.resizedHeight || calcH}
                              {it.resizedSize ? ` (${formatBytes(it.resizedSize)})` : ''}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {it.status === 'done' && (
                          <button
                            onClick={() => downloadSingle(it)}
                            className="p-2 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 transition-colors"
                            title="Download Resized"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => removeItem(it.id)}
                          className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          title="Remove"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
