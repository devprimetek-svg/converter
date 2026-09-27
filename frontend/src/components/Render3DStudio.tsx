import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  Sparkles,
  Download,
  AlertCircle,
  Eye,
  Sliders,
  Palette,
  Layers3,
  Box,
  RotateCcw,
  Copy,
  Check,
} from 'lucide-react';

const DEFAULT_AI_PROMPT =
  'A high-definition, photorealistic 3D rendering of the exploded parts view diagram seen in image_0.png. The composition, perspective, parts, callout numbers, and leader lines must be identical to image_0.png. All individual parts are transformed from line art into detailed, textured objects.';

interface RenderResult {
  success: boolean;
  elapsed_ms: number;
  preset_used: string;
  dimensions: { width: number; height: number };
  render_image_base64: string;
  clean_render_base64: string;
  annotations_mask_base64: string;
  depth_preview_base64: string;
}

export const Render3DStudio: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<RenderResult | null>(null);

  // Configuration options
  const [presetId, setPresetId] = useState<string>('scooter-seat');
  const [accentColor, setAccentColor] = useState<string>('#C31E23');
  const [overlayCallouts, setOverlayCallouts] = useState<boolean>(true);
  const [apiKey, setApiKey] = useState<string>('');
  const [customPrompt, setCustomPrompt] = useState<string>(DEFAULT_AI_PROMPT);
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  // Viewer options
  const [activeLayerTab, setActiveLayerTab] = useState<'composite' | 'clean' | 'annotations' | 'depth'>('composite');
  const [splitSliderPos, setSplitSliderPos] = useState<number>(50); // percentage 0-100
  const isDraggingSlider = useRef(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const presets = [
    {
      id: 'scooter-seat',
      name: 'Scooter Seat & Bodywork',
      desc: 'Black leather seat, glossy candy red grab rail, matte ABS box, chrome hardware',
      color: '#C31E23',
      icon: '💺',
    },
    {
      id: 'engine',
      name: 'Engine & Mechanical',
      desc: 'Cast aluminum casings, machined steel gears, copper/brass gaskets',
      color: '#A0A8B2',
      icon: '⚙️',
    },
    {
      id: 'chassis',
      name: 'Chassis & Suspension',
      desc: 'Gloss powder-coated frame, chrome stanchions, vibrant coil springs',
      color: '#E11D48',
      icon: '🏍️',
    },
    {
      id: 'studio-clay',
      name: 'Studio Design Clay',
      desc: 'Industrial design matte clay with soft ambient occlusion and studio lighting',
      color: '#64748B',
      icon: '🏛️',
    },
  ];

  // Load built-in sample isometric diagram
  const handleLoadSample = async () => {
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/render3d/sample-image');
      if (!res.ok) throw new Error('Sample diagram not available');
      const blob = await res.blob();
      const file = new File([blob], 'sample_isometric_seat.jpg', { type: 'image/jpeg' });
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setResult(null);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load sample diagram.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setResult(null);
      setErrorMsg(null);
    }
  };

  const handleProcess = async () => {
    if (!selectedFile && !previewUrl) {
      setErrorMsg('Please select or upload an isometric line-art diagram first.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);

    const formData = new FormData();
    if (selectedFile) {
      formData.append('file', selectedFile);
    }
    formData.append('preset_id', presetId);
    formData.append('custom_accent_hex', accentColor);
    formData.append('overlay_callouts', overlayCallouts ? 'true' : 'false');
    if (apiKey.trim()) formData.append('api_key', apiKey.trim());
    if (customPrompt.trim()) formData.append('ai_prompt', customPrompt.trim());

    try {
      const res = await fetch('/api/render3d/process', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Rendering process failed.');
      }

      const data: RenderResult = await res.json();
      setResult(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to generate 3D photorealistic render.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = (base64Data: string, filename: string) => {
    const link = document.createElement('a');
    link.href = base64Data;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Slider drag handler
  const handleSliderMove = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (!isDraggingSlider.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const offset = Math.max(0, Math.min(clientX - rect.left, rect.width));
    setSplitSliderPos(Math.round((offset / rect.width) * 100));
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-8 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-zinc-900 via-zinc-950 to-black text-white border border-zinc-800 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-widest">
            <Sparkles className="w-3.5 h-3.5" />
            Isometric to 3D Photorealistic Studio
          </div>
          <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
            Transform Technical Line Art into 3D Product Renders
          </h2>
          <p className="text-zinc-400 text-sm sm:text-base leading-relaxed">
            Converts 2D isometric exploded catalog diagrams into photorealistic 3D materials (leather, glossy lacquer,
            matte ABS plastic, chrome fasteners) while strictly preserving all callout numbers (1–16) and leader lines in
            lossless subpixel clarity.
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Grid: Controls on Left, Live View on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Input, Material Presets, and Parameters */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card 1: Input Image & Sample */}
          <div className="p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
                <Box className="w-4 h-4 text-blue-500" />
                1. Select Line Diagram
              </h3>
              <button
                onClick={handleLoadSample}
                disabled={isProcessing}
                className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 transition-colors"
                title="Load sample scooter seat & grab bar diagram"
              >
                Load Sample Seat
              </button>
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-blue-500 dark:hover:border-blue-400 rounded-xl p-6 text-center cursor-pointer transition-colors bg-zinc-50 dark:bg-zinc-950/50"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />
              <UploadCloud className="w-8 h-8 mx-auto text-zinc-400 mb-2" />
              <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                {selectedFile ? selectedFile.name : 'Click or drop 2D isometric diagram (JPG/PNG)'}
              </p>
              <p className="text-[11px] text-zinc-500 mt-1">High-resolution line art supported</p>
            </div>
          </div>

          {/* Card 2: Material & Style Presets */}
          <div className="p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
              <Palette className="w-4 h-4 text-emerald-500" />
              2. Material Preset
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {presets.map((p) => {
                const isSelected = presetId === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      setPresetId(p.id);
                      setAccentColor(p.color);
                    }}
                    className={`p-3 rounded-xl border text-left transition-all relative ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 ring-1 ring-blue-500'
                        : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{p.icon}</span>
                      <span className="text-xs font-bold text-zinc-900 dark:text-white truncate">{p.name}</span>
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">{p.desc}</p>
                  </button>
                );
              })}
            </div>

            {/* Custom Accent Color Swatch */}
            <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <div className="text-xs">
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">Painted Component Color</span>
                <p className="text-[11px] text-zinc-500">Applies to grab rails, winglets, and body accents</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="w-8 h-8 rounded-lg border border-zinc-300 dark:border-zinc-700 cursor-pointer bg-transparent"
                />
                <span className="font-mono text-xs font-bold text-zinc-700 dark:text-zinc-300">{accentColor}</span>
              </div>
            </div>
          </div>

          {/* Card 3: Layer Protection & Generation */}
          <div className="p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
              <Layers3 className="w-4 h-4 text-indigo-500" />
              3. Callout Protection & AI
            </h3>

            {/* Two-layer callout preservation toggle */}
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800">
              <input
                type="checkbox"
                checked={overlayCallouts}
                onChange={(e) => setOverlayCallouts(e.target.checked)}
                className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
              />
              <div className="text-xs space-y-0.5">
                <span className="font-bold text-zinc-900 dark:text-zinc-100">
                  Preserve Callout Numbers (1–16) & Leader Lines
                </span>
                <p className="text-zinc-500 dark:text-zinc-400">
                  Extracts numbers and annotations onto a protected layer so they remain 100% crisp without AI distortion.
                </p>
              </div>
            </label>

            {/* Master Transformation Prompt Section */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-bold text-xs text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                  AI Transformation Prompt:
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(customPrompt);
                      setCopiedPrompt(true);
                      setTimeout(() => setCopiedPrompt(false), 2000);
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
                    title="Copy prompt text"
                  >
                    {copiedPrompt ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    {copiedPrompt ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomPrompt(DEFAULT_AI_PROMPT)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline transition-colors"
                    title="Reset to recommended prompt"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset
                  </button>
                </div>
              </div>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 text-xs font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none shadow-xs"
                placeholder="Enter prompt for 3D photorealistic conversion..."
              />
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                Transforms line art into detailed, textured objects while maintaining exact perspective, parts, and callout numbers.
              </p>
            </div>

            {/* Advanced cloud AI toggle */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-xs font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 flex items-center gap-1"
              >
                <Sliders className="w-3.5 h-3.5" />
                {showAdvanced ? 'Hide Cloud AI Settings' : 'Cloud AI Options (Optional API Key)'}
              </button>

              {showAdvanced && (
                <div className="mt-3 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800 space-y-3 text-xs">
                  <div>
                    <label className="font-semibold text-zinc-700 dark:text-zinc-300">Gemini / Stability API Key</label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Optional. Built-in PBR Shader runs instantly without key"
                      className="mt-1 w-full px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 font-mono text-xs"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Process Button */}
            <button
              onClick={handleProcess}
              disabled={isProcessing || (!selectedFile && !previewUrl)}
              className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md shadow-blue-600/20 disabled:opacity-50 disabled:pointer-events-none transition-all flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              {isProcessing ? 'Generating 3D Shaded Render...' : 'Convert to 3D Photorealistic'}
            </button>
          </div>
        </div>

        {/* Right Column: Live Interactive Split Viewer & Layer Inspector */}
        <div className="lg:col-span-7 space-y-4">
          <div className="p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-blue-500" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
                  Interactive 3D Viewer & Split Comparison
                </h3>
              </div>

              {result && (
                <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg text-xs">
                  <button
                    onClick={() => setActiveLayerTab('composite')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                      activeLayerTab === 'composite'
                        ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                    }`}
                  >
                    3D + Callouts
                  </button>
                  <button
                    onClick={() => setActiveLayerTab('clean')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                      activeLayerTab === 'clean'
                        ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                    }`}
                  >
                    Clean 3D
                  </button>
                  <button
                    onClick={() => setActiveLayerTab('depth')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                      activeLayerTab === 'depth'
                        ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                    }`}
                  >
                    Depth Map
                  </button>
                  <button
                    onClick={() => setActiveLayerTab('annotations')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                      activeLayerTab === 'annotations'
                        ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                    }`}
                  >
                    Callout Mask
                  </button>
                </div>
              )}
            </div>

            {/* Split Comparison Viewer Container */}
            <div
              className="relative w-full aspect-[3/4] max-h-[640px] bg-zinc-100 dark:bg-zinc-950 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 select-none cursor-ew-resize"
              onMouseDown={() => (isDraggingSlider.current = true)}
              onMouseUp={() => (isDraggingSlider.current = false)}
              onMouseLeave={() => (isDraggingSlider.current = false)}
              onMouseMove={handleSliderMove}
              onTouchStart={() => (isDraggingSlider.current = true)}
              onTouchEnd={() => (isDraggingSlider.current = false)}
              onTouchMove={handleSliderMove}
            >
              {/* Fallback Empty State */}
              {!previewUrl && !result && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-zinc-400 space-y-3">
                  <Box className="w-12 h-12 text-zinc-300 dark:text-zinc-700" />
                  <p className="text-sm font-semibold">No Diagram Loaded</p>
                  <p className="text-xs max-w-sm">
                    Upload an isometric parts drawing or click "Load Sample Seat" to see the 3D photorealistic conversion.
                  </p>
                </div>
              )}

              {/* View 1: Photorealistic 3D Render (Underneath) */}
              {result && (
                <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
                  <img
                    src={
                      activeLayerTab === 'composite'
                        ? result.render_image_base64
                        : activeLayerTab === 'clean'
                        ? result.clean_render_base64
                        : activeLayerTab === 'depth'
                        ? result.depth_preview_base64
                        : result.annotations_mask_base64
                    }
                    alt="3D Photorealistic Render"
                    className="w-full h-full object-contain pointer-events-none"
                  />
                  <span className="absolute bottom-3 right-3 px-2 py-0.5 rounded-md bg-black/70 text-white font-mono text-[10px] uppercase tracking-wider backdrop-blur-xs">
                    3D Render ({result.elapsed_ms}ms)
                  </span>
                </div>
              )}

              {/* View 2: Original 2D Line Art (Clipped on Left side) */}
              {previewUrl && (
                <div
                  className="absolute inset-0 h-full overflow-hidden pointer-events-none bg-white dark:bg-zinc-900 border-r-2 border-white shadow-2xl"
                  style={{ width: `${result ? splitSliderPos : 100}%` }}
                >
                  <div className="w-full h-full flex items-center justify-center">
                    <img
                      src={previewUrl}
                      alt="Original 2D Line Art"
                      className="w-full h-full object-contain max-w-none"
                    />
                  </div>
                  {result && (
                    <span className="absolute bottom-3 left-3 px-2 py-0.5 rounded-md bg-black/70 text-white font-mono text-[10px] uppercase tracking-wider backdrop-blur-xs">
                      2D Isometric
                    </span>
                  )}
                </div>
              )}

              {/* Interactive Split Divider Handle */}
              {result && previewUrl && (
                <div
                  className="absolute top-0 bottom-0 w-1 bg-white cursor-ew-resize pointer-events-none shadow-md"
                  style={{ left: `${splitSliderPos}%` }}
                >
                  <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-white text-zinc-800 shadow-lg flex items-center justify-center text-xs font-bold border border-zinc-200">
                    ↔
                  </div>
                </div>
              )}
            </div>

            {/* Split Slider Hint & Download Actions */}
            {result && (
              <div className="pt-2 flex flex-wrap items-center justify-between gap-3 text-xs">
                <span className="text-zinc-500 flex items-center gap-1.5 font-medium">
                  <Sliders className="w-3.5 h-3.5" />
                  Drag split slider left/right to compare 2D line art with 3D render
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDownload(result.render_image_base64, '3D_Render_With_Callouts.png')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download 3D + Callouts
                  </button>

                  <button
                    onClick={() => handleDownload(result.clean_render_base64, '3D_Clean_Render.png')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-semibold transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Clean 3D (No Text)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
