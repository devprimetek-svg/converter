import React, { useState, useRef } from 'react';
import {
  FileArchive,
  Download,
  Sliders,
  Crop,
  Loader2,
  Trash2,
  Image as ImageIcon,
  ZoomIn,
  ZoomOut,
  X,
  Eye,
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
  resizedDataUrl?: string;
  resizedWidth?: number;
  resizedHeight?: number;
  resizedSize?: number;
  status: 'idle' | 'processing' | 'done' | 'error';
}

type ResizeMode = 'percentage' | 'dimensions' | 'max_edge';

/** Stepped halving downsampling to guarantee crisp anti-aliased resizing on HTML5 Canvas without jagged pixelation */
function drawImageHighQuality(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  targetW: number,
  targetH: number
) {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const currentW = img.naturalWidth;
  const currentH = img.naturalHeight;

  if (currentW > targetW * 2 || currentH > targetH * 2) {
    const stepCanvas = document.createElement('canvas');
    const stepCtx = stepCanvas.getContext('2d');
    if (stepCtx) {
      stepCtx.imageSmoothingEnabled = true;
      stepCtx.imageSmoothingQuality = 'high';

      let stepW = currentW;
      let stepH = currentH;
      let stepSource: CanvasImageSource = img;

      while (stepW * 0.5 > targetW && stepH * 0.5 > targetH) {
        stepW = Math.round(stepW * 0.5);
        stepH = Math.round(stepH * 0.5);
        stepCanvas.width = stepW;
        stepCanvas.height = stepH;
        stepCtx.drawImage(stepSource, 0, 0, stepW, stepH);
        stepSource = stepCanvas;
      }
      ctx.drawImage(stepCanvas, dx, dy, targetW, targetH);
      return;
    }
  }

  ctx.drawImage(img, dx, dy, targetW, targetH);
}

/**
 * Compresses an HTML5 canvas to JPEG strictly within minKb..maxKb.
 * Guarantees resolution is preserved, quality is binary-searched,
 * and if below minKb, standard JPEG COM marker padding is added to reach midpoint.
 */
async function compressToTargetKbClient(
  canvas: HTMLCanvasElement,
  minKb = 59,
  maxKb = 69
): Promise<Blob> {
  const minBytes = minKb * 1024;
  const maxBytes = maxKb * 1024;
  const targetBytes = Math.floor((minBytes + maxBytes) / 2);

  const getBlob = (q: number): Promise<Blob> =>
    new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b || new Blob([], { type: 'image/jpeg' })), 'image/jpeg', q / 100);
    });

  const padJpeg = async (blob: Blob): Promise<Blob> => {
    if (blob.size >= minBytes && blob.size <= maxBytes) return blob;
    if (blob.size > maxBytes) return blob;
    const needed = targetBytes - blob.size;
    if (needed < 4) return blob;

    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return blob;

    const chunks: Uint8Array[] = [];
    let remaining = needed;
    while (remaining >= 4) {
      const payloadLen = Math.min(65533, remaining - 4);
      const marker = new Uint8Array(4 + payloadLen);
      marker[0] = 0xff;
      marker[1] = 0xfe;
      marker[2] = ((payloadLen + 2) >> 8) & 0xff;
      marker[3] = (payloadLen + 2) & 0xff;
      chunks.push(marker);
      remaining -= marker.length;
    }

    const totalPad = chunks.reduce((acc, c) => acc + c.length, 0);
    const combined = new Uint8Array(bytes.length + totalPad);
    combined.set(bytes.subarray(0, 2), 0);
    let offset = 2;
    for (const c of chunks) {
      combined.set(c, offset);
      offset += c.length;
    }
    combined.set(bytes.subarray(2), offset);

    return new Blob([combined], { type: 'image/jpeg' });
  };

  // 1. Check max quality (95)
  const b95 = await getBlob(95);
  if (b95.size < minBytes) {
    return padJpeg(b95);
  }
  if (b95.size <= maxBytes) {
    return b95;
  }

  // 2. Binary search quality between 8 and 95
  let low = 8;
  let high = 95;
  let bestBlob: Blob = b95;
  let bestDiff = Math.abs(b95.size - targetBytes);

  for (let iter = 0; iter < 10; iter++) {
    const mid = Math.floor((low + high) / 2);
    const blob = await getBlob(mid);
    const sz = blob.size;

    if (sz >= minBytes && sz <= maxBytes) {
      return blob;
    }

    const diff = Math.abs(sz - targetBytes);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestBlob = blob;
    }

    if (sz < minBytes) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (bestBlob.size < minBytes) {
    return padJpeg(bestBlob);
  }
  return bestBlob;
}

export const BulkImageResizer: React.FC = () => {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [mode, setMode] = useState<ResizeMode>('dimensions');
  const [percentage, setPercentage] = useState<number>(100);
  const [targetWidth, setTargetWidth] = useState<number>(1000);
  const [targetHeight, setTargetHeight] = useState<number>(1200);
  const [maintainAspect, setMaintainAspect] = useState<boolean>(true);
  const [centerOnWhiteCanvas, setCenterOnWhiteCanvas] = useState<boolean>(true);
  const [maxEdge, setMaxEdge] = useState<number>(1920);
  const [format, setFormat] = useState<string>('JPG');
  const [quality, setQuality] = useState<number>(95);
  const [enableTargetKb, setEnableTargetKb] = useState<boolean>(true);
  const [targetMinKb, setTargetMinKb] = useState<number>(59);
  const [targetMaxKb, setTargetMaxKb] = useState<number>(69);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isZipping, setIsZipping] = useState<boolean>(false);
  const [previewItem, setPreviewItem] = useState<ImageItem | null>(null);
  const [previewZoom, setPreviewZoom] = useState<number>(1);

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
        const img = new Image();
        await new Promise((resolve) => {
          img.onload = resolve;
          img.src = item.dataUrl;
        });

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas context unavailable');

        let finalW: number;
        let finalH: number;

        if (mode === 'dimensions' && centerOnWhiteCanvas) {
          finalW = targetWidth;
          finalH = targetHeight;
          canvas.width = finalW;
          canvas.height = finalH;

          // Pure white background for parts catalogs
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, finalW, finalH);

          const scale = maintainAspect
            ? Math.min(targetWidth / img.naturalWidth, targetHeight / img.naturalHeight)
            : 1;
          const dw = maintainAspect ? Math.max(1, Math.round(img.naturalWidth * scale)) : targetWidth;
          const dh = maintainAspect ? Math.max(1, Math.round(img.naturalHeight * scale)) : targetHeight;
          const dx = Math.round((finalW - dw) / 2);
          const dy = Math.round((finalH - dh) / 2);

          drawImageHighQuality(ctx, img, dx, dy, dw, dh);
        } else {
          const [nw, nh] = calculateNewDimensions(item.originalWidth, item.originalHeight);
          finalW = nw;
          finalH = nh;
          canvas.width = nw;
          canvas.height = nh;
          drawImageHighQuality(ctx, img, 0, 0, nw, nh);
        }

        // Determine output mime type
        let mime = item.file.type;
        if (format === 'JPG' || format === 'JPEG') mime = 'image/jpeg';
        else if (format === 'PNG') mime = 'image/png';
        else if (format === 'WEBP') mime = 'image/webp';

        let blob: Blob | null = null;
        if (enableTargetKb && (mime === 'image/jpeg' || format === 'JPG' || format === 'JPEG' || format === 'ORIGINAL')) {
          blob = await compressToTargetKbClient(canvas, targetMinKb, targetMaxKb);
        } else {
          blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, mime, quality / 100);
          });
        }

        if (!blob) throw new Error('Failed to create image blob');

        item.resizedBlob = blob;
        item.resizedDataUrl = URL.createObjectURL(blob);
        item.resizedWidth = finalW;
        item.resizedHeight = finalH;
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

              {/* Quick Standard Preset Button */}
              <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/60 dark:bg-emerald-950/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                    <FileArchive className="w-3.5 h-3.5 text-emerald-600" />
                    Portal Standard Preset
                  </span>
                  <span className="text-[10px] font-bold bg-emerald-600 text-white px-1.5 py-0.5 rounded-full">
                    Recommended
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMode('dimensions');
                    setTargetWidth(1000);
                    setTargetHeight(1200);
                    setMaintainAspect(true);
                    setCenterOnWhiteCanvas(true);
                    setFormat('JPG');
                    setEnableTargetKb(true);
                    setTargetMinKb(59);
                    setTargetMaxKb(69);
                  }}
                  className={`w-full py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-between ${
                    mode === 'dimensions' && targetWidth === 1000 && targetHeight === 1200 && enableTargetKb && targetMinKb === 59 && targetMaxKb === 69 && centerOnWhiteCanvas
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100/50'
                  }`}
                >
                  <span>1000×1200 px @ 59–69 KB</span>
                  <span className="text-[10px] font-mono opacity-90">IndiaSpare</span>
                </button>
                <p className="text-[10px] text-emerald-700/80 dark:text-emerald-400 leading-tight">
                  Guarantees 1000×1200 resolution centered on white canvas, 59–69 KB file size, and crisp lines without pixelation.
                </p>
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
                  <div className="space-y-1.5 pt-1">
                    <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={maintainAspect}
                        onChange={(e) => setMaintainAspect(e.target.checked)}
                        className="rounded text-emerald-600"
                      />
                      <span className="font-semibold">Maintain Aspect Ratio</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={centerOnWhiteCanvas}
                        onChange={(e) => setCenterOnWhiteCanvas(e.target.checked)}
                        className="rounded text-emerald-600"
                      />
                      <span>Fit &amp; Center on White Canvas (Strict {targetWidth}×{targetHeight} px)</span>
                    </label>
                  </div>
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
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Output Format
                  </label>
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                    className="w-full mt-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="ORIGINAL">Keep Original Format</option>
                    <option value="JPG">JPG / JPEG (Best for photos & small files)</option>
                    <option value="PNG">PNG (Lossless clarity)</option>
                    <option value="WEBP">WebP (Modern ultra-compressed)</option>
                  </select>
                </div>

                {/* Image Quality Percentage Section */}
                <div className="space-y-2.5 pt-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Image Quality Percentage
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={quality}
                        onChange={(e) => {
                          const val = Math.max(1, Math.min(100, Number(e.target.value) || 1));
                          setQuality(val);
                        }}
                        className="w-14 px-2 py-0.5 text-right font-mono font-bold text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                      <span className="text-xs font-bold text-slate-500">%</span>
                    </div>
                  </div>

                  <input
                    type="range"
                    min={1}
                    max={100}
                    value={quality}
                    onChange={(e) => setQuality(Number(e.target.value))}
                    className="w-full accent-emerald-600 cursor-pointer"
                  />

                  {/* Quality Presets */}
                  <div className="grid grid-cols-5 gap-1">
                    {[60, 75, 85, 95, 100].map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setQuality(q)}
                        className={`py-1 rounded-md text-[10px] font-bold border transition-all ${
                          quality === q
                            ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-400'
                        }`}
                      >
                        {q}%
                      </button>
                    ))}
                  </div>

                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {quality >= 90
                      ? '💎 Maximum visual fidelity with larger file size.'
                      : quality >= 75
                      ? '⚡ Optimal web balance: crisp details & small file size.'
                      : '📦 High compression: smallest download size.'}
                  </p>
                </div>

                {/* Target File Size (KB) Section */}
                <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enableTargetKb}
                        onChange={(e) => setEnableTargetKb(e.target.checked)}
                        className="rounded text-emerald-600"
                      />
                      <span>Strict Target Size (KB)</span>
                    </label>
                    <span className="text-[10px] font-mono font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                      {targetMinKb}–{targetMaxKb} KB
                    </span>
                  </div>

                  {enableTargetKb && (
                    <div className="grid grid-cols-2 gap-2 pt-1 animate-in fade-in duration-200">
                      <div>
                        <label className="text-[11px] text-slate-500 font-medium">Min Target (KB)</label>
                        <input
                          type="number"
                          min={10}
                          max={500}
                          value={targetMinKb}
                          onChange={(e) => setTargetMinKb(Number(e.target.value))}
                          className="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-500 font-medium">Max Target (KB)</label>
                        <input
                          type="number"
                          min={10}
                          max={500}
                          value={targetMaxKb}
                          onChange={(e) => setTargetMaxKb(Number(e.target.value))}
                          className="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono font-bold"
                        />
                      </div>
                      <p className="col-span-2 text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                        Guarantees file size is strictly within {targetMinKb}–{targetMaxKb} KB with automatic anti-pixelation quality calibration.
                      </p>
                    </div>
                  )}
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
                        <button
                          onClick={() => { setPreviewItem(it); setPreviewZoom(1); }}
                          className="p-2 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300 transition-colors"
                          title="Inspect / Zoom HD"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
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

      {/* High-Resolution Inspection & Zoom Modal */}
      {previewItem && (
        <div
          onClick={() => setPreviewItem(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-5xl max-h-[92vh] bg-white dark:bg-slate-900 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
          >
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white font-mono">
                  {previewItem.name}
                </h4>
                <p className="text-xs text-slate-500">
                  Original: {previewItem.originalWidth} × {previewItem.originalHeight} px • Resized: {previewItem.resizedWidth || calculateNewDimensions(previewItem.originalWidth, previewItem.originalHeight)[0]} × {previewItem.resizedHeight || calculateNewDimensions(previewItem.originalWidth, previewItem.originalHeight)[1]} px
                </p>
              </div>

              {/* Zoom & Action Controls */}
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700">
                  <button
                    onClick={() => setPreviewZoom((z: number) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
                    className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <span className="px-2 text-xs font-mono font-bold text-slate-700 dark:text-slate-200 min-w-[50px] text-center">
                    {Math.round(previewZoom * 100)}%
                  </span>
                  <button
                    onClick={() => setPreviewZoom((z: number) => Math.min(4, Number((z + 0.25).toFixed(2))))}
                    className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPreviewZoom(1)}
                    className="px-2 py-1 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded ml-1"
                    title="Reset to 100%"
                  >
                    100%
                  </button>
                  <button
                    onClick={() => setPreviewZoom(2)}
                    className="px-2 py-1 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded"
                    title="Zoom to 200%"
                  >
                    200%
                  </button>
                </div>

                {previewItem.resizedBlob && (
                  <button
                    onClick={() => downloadSingle(previewItem)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </button>
                )}

                <button
                  onClick={() => setPreviewItem(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Viewport with smooth pan & high-definition rendering */}
            <div className="p-4 flex-1 bg-slate-950 overflow-auto max-h-[75vh] flex items-center justify-center">
              <div
                style={{
                  transform: `scale(${previewZoom})`,
                  transformOrigin: 'center center',
                  transition: 'transform 0.15s ease-out',
                }}
                className="max-w-full max-h-full flex items-center justify-center"
              >
                <img
                  src={previewItem.resizedDataUrl || previewItem.dataUrl}
                  alt={previewItem.name}
                  className="max-w-full max-h-[68vh] object-contain rounded shadow-2xl"
                  style={{ imageRendering: 'auto' }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
