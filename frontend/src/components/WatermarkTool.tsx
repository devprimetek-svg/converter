import React, { useState, useRef, useEffect } from 'react';
import {
  FileArchive,
  Download,
  Sliders,
  Type,
  Image as ImageIcon,
  CheckCircle2,
  Loader2,
  Sparkles,
  Droplet,
} from 'lucide-react';
import JSZip from 'jszip';

interface WatermarkItem {
  id: string;
  file: File;
  name: string;
  dataUrl: string;
  watermarkedBlob?: Blob;
  status: 'idle' | 'processing' | 'done' | 'error';
}

type WatermarkType = 'text' | 'image';
type Position =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export const WatermarkTool: React.FC = () => {
  const [items, setItems] = useState<WatermarkItem[]>([]);
  const [activeIdx, setActiveIdx] = useState<number>(0);
  const [wmType, setWmType] = useState<WatermarkType>('image');

  // Text watermark state
  const [text, setText] = useState<string>('INDIA SPARE');
  const [fontSize, setFontSize] = useState<number>(48);
  const [color, setColor] = useState<string>('#FFFFFF');
  const [opacity, setOpacity] = useState<number>(15);
  const [rotation, setRotation] = useState<number>(-30);
  const [position, setPosition] = useState<Position>('center');
  const [isTiled, setIsTiled] = useState<boolean>(true);

  // Logo watermark state (Pre-set with India Spare logo)
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>('/default_watermark_logo.png');
  const [logoScale, setLogoScale] = useState<number>(10); // 10% preset scale

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isZipping, setIsZipping] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  const handleFilesAdded = async (files: FileList | File[]) => {
    const newItems: WatermarkItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (!f.type.startsWith('image/')) continue;

      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(f);
      });

      newItems.push({
        id: `wm_${Date.now()}_${i}`,
        file: f,
        name: f.name,
        dataUrl,
        status: 'idle',
      });
    }

    setItems((prev) => [...prev, ...newItems]);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const f = e.target.files[0];
      setLogoFile(f);
      const reader = new FileReader();
      reader.onload = (ev) => setLogoDataUrl(ev.target?.result as string);
      reader.readAsDataURL(f);
    }
  };

  // Render watermark on a specific canvas
  const drawWatermark = async (
    canvas: HTMLCanvasElement,
    baseDataUrl: string
  ): Promise<void> => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const baseImg = new Image();
    await new Promise((resolve) => {
      baseImg.onload = resolve;
      baseImg.src = baseDataUrl;
    });

    canvas.width = baseImg.naturalWidth;
    canvas.height = baseImg.naturalHeight;

    // Draw base image
    ctx.drawImage(baseImg, 0, 0);

    const w = canvas.width;
    const h = canvas.height;

    ctx.save();
    ctx.globalAlpha = opacity / 100;

    if (wmType === 'text') {
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.fillStyle = color;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';

      if (isTiled) {
        // Full diagonal span guarantees seamless tiled coverage under any rotation angle (e.g. 30°, 45°)
        const rad = (rotation * Math.PI) / 180;
        const diag = Math.hypot(w, h);
        const stepX = Math.max(160, fontSize * 6);
        const stepY = Math.max(90, fontSize * 3.5);

        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.rotate(rad);

        for (let y = -diag; y <= diag; y += stepY) {
          for (let x = -diag; x <= diag; x += stepX) {
            ctx.fillText(text, x, y);
          }
        }
        ctx.restore();
      } else {
        // Position on 9-point grid
        const metrics = ctx.measureText(text);
        const textW = metrics.width;
        const textH = fontSize;

        let posX = w / 2;
        let posY = h / 2;

        const margin = 50;
        if (position.includes('left')) posX = margin + textW / 2;
        else if (position.includes('right')) posX = w - margin - textW / 2;

        if (position.includes('top')) posY = margin + textH / 2;
        else if (position.includes('bottom')) posY = h - margin - textH / 2;

        ctx.translate(posX, posY);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.fillText(text, 0, 0);
      }
    } else if (wmType === 'image' && logoDataUrl) {
      const logoImg = new Image();
      await new Promise((resolve) => {
        logoImg.onload = resolve;
        logoImg.src = logoDataUrl;
      });

      const targetLogoW = (w * logoScale) / 100;
      const targetLogoH = (targetLogoW / logoImg.naturalWidth) * logoImg.naturalHeight;

      if (isTiled) {
        const rad = (rotation * Math.PI) / 180;
        const diag = Math.hypot(w, h);
        const stepX = targetLogoW * 2.2;
        const stepY = targetLogoH * 2.2;

        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.rotate(rad);

        for (let y = -diag; y <= diag; y += stepY) {
          for (let x = -diag; x <= diag; x += stepX) {
            ctx.drawImage(logoImg, x - targetLogoW / 2, y - targetLogoH / 2, targetLogoW, targetLogoH);
          }
        }
        ctx.restore();
      } else {
        let posX = (w - targetLogoW) / 2;
        let posY = (h - targetLogoH) / 2;
        const margin = 40;

        if (position.includes('left')) posX = margin;
        else if (position.includes('right')) posX = w - targetLogoW - margin;

        if (position.includes('top')) posY = margin;
        else if (position.includes('bottom')) posY = h - targetLogoH - margin;

        ctx.save();
        ctx.translate(posX + targetLogoW / 2, posY + targetLogoH / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.drawImage(logoImg, -targetLogoW / 2, -targetLogoH / 2, targetLogoW, targetLogoH);
        ctx.restore();
      }
    }

    ctx.restore();
  };

  // Update live preview whenever settings or active image change
  useEffect(() => {
    if (items.length > 0 && previewCanvasRef.current) {
      const activeItem = items[activeIdx] || items[0];
      drawWatermark(previewCanvasRef.current, activeItem.dataUrl);
    }
  }, [
    items,
    activeIdx,
    wmType,
    text,
    fontSize,
    color,
    opacity,
    rotation,
    position,
    isTiled,
    logoDataUrl,
    logoScale,
  ]);

  const applyToAll = async () => {
    if (items.length === 0) return;
    setIsProcessing(true);

    const updated = [...items];

    for (let i = 0; i < updated.length; i++) {
      const item = updated[i];
      item.status = 'processing';
      setItems([...updated]);

      try {
        const offscreen = document.createElement('canvas');
        await drawWatermark(offscreen, item.dataUrl);

        const blob = await new Promise<Blob | null>((resolve) => {
          offscreen.toBlob(resolve, 'image/jpeg', 0.92);
        });

        if (!blob) throw new Error('Blob error');
        item.watermarkedBlob = blob;
        item.status = 'done';
      } catch {
        item.status = 'error';
      }

      setItems([...updated]);
    }

    setIsProcessing(false);
  };

  const downloadAllZip = async () => {
    setIsZipping(true);
    try {
      const zip = new JSZip();
      for (const item of items) {
        if (!item.watermarkedBlob) continue;
        const base = item.name.substring(0, item.name.lastIndexOf('.')) || item.name;
        zip.file(`${base}_watermarked.jpg`, item.watermarkedBlob);
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'watermarked_images.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert('Failed to build ZIP.');
    } finally {
      setIsZipping(false);
    }
  };

  const downloadSingle = (item: WatermarkItem) => {
    if (!item.watermarkedBlob) return;
    const url = URL.createObjectURL(item.watermarkedBlob);
    const a = document.createElement('a');
    a.href = url;
    const base = item.name.substring(0, item.name.lastIndexOf('.')) || item.name;
    a.download = `${base}_watermarked.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      {/* Upload zone when empty */}
      {items.length === 0 && (
        <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-300">
          <div className="text-center space-y-2">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
              Bulk Watermark Engine
            </span>
            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Image Watermark Tool
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Stamp single or bulk images with custom copyright text, confidential marks, or brand logos with live preview.
            </p>
          </div>

          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files) handleFilesAdded(e.dataTransfer.files);
            }}
            className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 rounded-3xl p-10 text-center cursor-pointer bg-white dark:bg-slate-900/60 hover:bg-blue-50/20 transition-all shadow-sm"
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
            <div className="w-16 h-16 mx-auto rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 mb-4">
              <Droplet className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">
              Drop images to watermark or click to browse
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Supports JPEG, PNG, WebP, GIF
            </p>
          </div>
        </div>
      )}

      {/* Main Workspace when images are loaded */}
      {items.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Controls Sidebar */}
          <div className="lg:col-span-4 space-y-5">
            <div className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-blue-600" />
                  Watermark Settings
                </h3>
                <span className="text-xs text-slate-500 font-mono">{items.length} images</span>
              </div>

              {/* Watermark Type Toggle */}
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-semibold">
                <button
                  onClick={() => setWmType('text')}
                  className={`py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                    wmType === 'text'
                      ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  <Type className="w-3.5 h-3.5" />
                  Text Stamp
                </button>
                <button
                  onClick={() => setWmType('image')}
                  className={`py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                    wmType === 'image'
                      ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  Logo Stamp
                </button>
              </div>

              {/* Text Watermark Controls */}
              {wmType === 'text' && (
                <div className="space-y-3.5">
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Watermark Text
                    </label>
                    <input
                      type="text"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="Enter watermark text..."
                      className="w-full mt-1 px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-slate-500 font-medium">
                        Size ({fontSize}px)
                      </label>
                      <input
                        type="range"
                        min={14}
                        max={140}
                        value={fontSize}
                        onChange={(e) => setFontSize(Number(e.target.value))}
                        className="w-full mt-1.5 accent-blue-600"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-500 font-medium">Color</label>
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="color"
                          value={color}
                          onChange={(e) => setColor(e.target.value)}
                          className="w-7 h-7 rounded border border-slate-300 cursor-pointer p-0"
                        />
                        <span className="text-xs font-mono">{color}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center text-[11px] text-slate-500 font-medium">
                      <span>Opacity</span>
                      <span className="font-bold text-blue-600 font-mono">{opacity}%</span>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={100}
                      value={opacity}
                      onChange={(e) => setOpacity(Number(e.target.value))}
                      className="w-full mt-1.5 accent-blue-600"
                    />
                  </div>
                </div>
              )}

              {/* Logo Watermark Controls */}
              {wmType === 'image' && (
                <div className="space-y-3.5">
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Watermark Logo
                      </label>
                      {logoFile && (
                        <button
                          type="button"
                          onClick={() => {
                            setLogoFile(null);
                            setLogoDataUrl('/default_watermark_logo.png');
                          }}
                          className="text-[10px] text-blue-600 hover:underline font-semibold"
                        >
                          Reset to India Spare Logo
                        </button>
                      )}
                    </div>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoUpload}
                    />
                    <div className="mt-1 p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between gap-2">
                      <div className="h-8 max-w-[140px] flex items-center bg-white dark:bg-slate-900 px-2 py-1 rounded border border-slate-200 dark:border-slate-700">
                        <img
                          src={logoDataUrl || '/default_watermark_logo.png'}
                          alt="Logo"
                          className="max-h-full object-contain"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        className="py-1 px-2.5 rounded-lg border border-slate-300 dark:border-slate-600 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                      >
                        {logoFile ? 'Change Logo' : 'Upload Custom'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-slate-500 font-medium">
                        Scale ({logoScale}%)
                      </label>
                      <input
                        type="range"
                        min={5}
                        max={80}
                        value={logoScale}
                        onChange={(e) => setLogoScale(Number(e.target.value))}
                        className="w-full mt-1.5 accent-blue-600"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-500 font-medium">
                        Opacity ({opacity}%)
                      </label>
                      <input
                        type="range"
                        min={5}
                        max={100}
                        value={opacity}
                        onChange={(e) => setOpacity(Number(e.target.value))}
                        className="w-full mt-1.5 accent-blue-600"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Layout & Placement Grid */}
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Placement
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isTiled}
                      onChange={(e) => setIsTiled(e.target.checked)}
                      className="rounded text-blue-600"
                    />
                    <span>Tiled / Repeated</span>
                  </label>
                </div>

                {!isTiled && (
                  <div className="grid grid-cols-3 gap-1.5 w-36 mx-auto p-1.5 bg-slate-100 dark:bg-slate-800 rounded-xl">
                    {(
                      [
                        'top-left',
                        'top-center',
                        'top-right',
                        'center-left',
                        'center',
                        'center-right',
                        'bottom-left',
                        'bottom-center',
                        'bottom-right',
                      ] as Position[]
                    ).map((pos) => (
                      <button
                        key={pos}
                        onClick={() => setPosition(pos)}
                        className={`h-7 rounded-md text-[10px] font-bold transition-all ${
                          position === pos
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-white dark:bg-slate-900 text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        •
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Rotation Angle Controls (Tile angle, 30° preset, custom degrees) */}
              <div className="space-y-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    {isTiled ? 'Tile Rotation Angle' : 'Watermark Rotation'}
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={-180}
                      max={180}
                      value={rotation}
                      onChange={(e) => setRotation(Number(e.target.value))}
                      className="w-14 px-2 py-0.5 text-right font-mono font-bold text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="text-xs font-bold text-slate-500">°</span>
                  </div>
                </div>

                <input
                  type="range"
                  min={-180}
                  max={180}
                  step={1}
                  value={rotation}
                  onChange={(e) => setRotation(Number(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer"
                />

                {/* Quick Angle Preset Buttons including 30° */}
                <div className="grid grid-cols-6 gap-1">
                  {[0, 30, 45, -30, -45, 90].map((deg) => (
                    <button
                      key={deg}
                      type="button"
                      onClick={() => setRotation(deg)}
                      className={`py-1 rounded-md text-[10px] font-bold border transition-all ${
                        rotation === deg
                          ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-400'
                      }`}
                    >
                      {deg === 30 ? '30° ★' : `${deg > 0 ? `+${deg}` : deg}°`}
                    </button>
                  ))}
                </div>

                {isTiled && (
                  <div className="p-2 rounded-lg bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-900/40 text-[11px] text-blue-700 dark:text-blue-300">
                    <span className="font-bold">Active Tile Angle:</span> Tiles repeat seamlessly tilted at <strong className="font-mono">{rotation}°</strong> across the whole canvas.
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-3">
                <button
                  onClick={applyToAll}
                  disabled={isProcessing}
                  className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/20 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Watermarking All...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Apply to All ({items.length})
                    </>
                  )}
                </button>

                {items.some((it) => it.watermarkedBlob) && (
                  <button
                    onClick={downloadAllZip}
                    disabled={isZipping}
                    className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-2 transition-colors"
                  >
                    <FileArchive className="w-4 h-4" />
                    {isZipping ? 'Archiving...' : 'Download All as ZIP'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Live Interactive Preview Center */}
          <div className="lg:col-span-8 space-y-4">
            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Live Watermark Canvas Preview
                </h4>
                <p className="text-xs text-slate-800 dark:text-slate-200 font-semibold font-mono mt-0.5">
                  {items[activeIdx]?.name}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {items[activeIdx]?.watermarkedBlob && (
                  <button
                    onClick={() => downloadSingle(items[activeIdx])}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors shadow-xs"
                    title="Download Active Watermarked Image"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Save Active
                  </button>
                )}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  + Add Images
                </button>
                <button
                  onClick={() => setItems([])}
                  className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900 text-xs font-semibold text-red-600 hover:bg-red-50"
                >
                  Clear
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

            {/* Canvas Container */}
            <div className="relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-950/90 p-4 flex items-center justify-center min-h-[420px] max-h-[560px] overflow-auto shadow-inner">
              <canvas
                ref={previewCanvasRef}
                className="max-w-full max-h-[500px] object-contain rounded-lg shadow-xl"
              />
            </div>

            {/* Thumbnails strip for switching active preview image */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
              {items.map((it, idx) => (
                <div
                  key={it.id}
                  onClick={() => setActiveIdx(idx)}
                  className={`relative w-16 h-16 rounded-xl overflow-hidden border-2 cursor-pointer shrink-0 transition-all ${
                    activeIdx === idx
                      ? 'border-blue-600 ring-2 ring-blue-600/20 scale-105'
                      : 'border-slate-200 dark:border-slate-800 opacity-70 hover:opacity-100'
                  }`}
                >
                  <img src={it.dataUrl} alt={it.name} className="w-full h-full object-cover" />
                  {it.status === 'done' && (
                    <div className="absolute bottom-1 right-1 bg-blue-600 text-white rounded-full p-0.5">
                      <CheckCircle2 className="w-3 h-3" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
