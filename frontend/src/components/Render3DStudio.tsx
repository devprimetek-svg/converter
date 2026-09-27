import React, { useState, useRef, useEffect } from 'react';
import {
  UploadCloud,
  Sparkles,
  Download,
  AlertCircle,
  Eye,
  EyeOff,
  Sliders,
  Box,
  RotateCcw,
  Copy,
  Check,
  Key,
  ExternalLink,
  Layers3,
  Cpu,
} from 'lucide-react';

const DEFAULT_AI_PROMPT =
  'A high-definition, photorealistic 3D rendering of the exploded parts view diagram seen in image_0.png. The composition, perspective, parts, callout numbers, and leader lines must be identical to image_0.png. All individual parts are transformed from line art into detailed, textured objects.';

interface RenderResult {
  success: boolean;
  elapsed_ms: number;
  preset_used: string;
  engine_used?: string;
  ai_note?: string;
  prompt_used?: string;
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

  // AI Engine selector & Gemini API Key
  const [aiEngine, setAiEngine] = useState<'gemini' | 'flux'>('gemini');
  const [apiKey, setApiKey] = useState<string>(() => {
    return localStorage.getItem('gemini_api_key') || '';
  });
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [customPrompt, setCustomPrompt] = useState<string>(DEFAULT_AI_PROMPT);
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);
  const [overlayCallouts, setOverlayCallouts] = useState<boolean>(true);

  // Viewer options
  const [activeLayerTab, setActiveLayerTab] = useState<'composite' | 'clean' | 'annotations' | 'depth'>('composite');
  const [splitSliderPos, setSplitSliderPos] = useState<number>(50); // percentage 0-100
  const isDraggingSlider = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Save API key when changed
  useEffect(() => {
    if (apiKey) {
      localStorage.setItem('gemini_api_key', apiKey);
    }
  }, [apiKey]);

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

    if (aiEngine === 'gemini' && !apiKey.trim()) {
      setErrorMsg('Please enter your Google Gemini API Key or switch to Cloud AI (Flux Free) below.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);

    const formData = new FormData();
    if (selectedFile) {
      formData.append('file', selectedFile);
    }
    formData.append('overlay_callouts', overlayCallouts ? 'true' : 'false');
    formData.append('ai_engine', aiEngine);
    if (apiKey.trim()) {
      formData.append('api_key', apiKey.trim());
    }
    if (customPrompt.trim()) {
      formData.append('ai_prompt', customPrompt.trim());
    }

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
            AI 3D Photorealistic Studio
          </div>
          <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
            Transform Technical Line Art into 3D Product Renders
          </h2>
          <p className="text-zinc-400 text-sm sm:text-base leading-relaxed">
            Enter your custom prompt to generate textured, photorealistic 3D objects with studio lighting directly from
            2D exploded parts drawings, while strictly preserving all callout numbers (1–16) and leader lines in crisp
            clarity.
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {result?.ai_note && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs flex items-center gap-3">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
          <span>{result.ai_note}</span>
        </div>
      )}

      {/* Main Grid: Controls on Left, Live View on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Simple Clean UI (Upload, AI Engine, Custom Prompt, Options) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card 1: Select/Upload Line Diagram */}
          <div className="p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
                <Box className="w-4 h-4 text-blue-500" />
                1. Select Line Diagram
              </h3>
              <button
                onClick={handleLoadSample}
                disabled={isProcessing}
                className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Load sample scooter seat & grab bar diagram"
              >
                <Sparkles className="w-3 h-3 text-blue-500" />
                Load Sample Seat
              </button>
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-blue-500 dark:hover:border-blue-400 rounded-xl p-5 text-center cursor-pointer transition-colors bg-zinc-50 dark:bg-zinc-950/50"
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
                {selectedFile ? selectedFile.name : 'Click or drop 2D isometric diagram (JPG / PNG)'}
              </p>
              <p className="text-[11px] text-zinc-500 mt-1">High-definition exploded parts diagrams supported</p>
            </div>
          </div>

          {/* Card 2: AI Generation Engine & Authentication */}
          <div className="p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
                <Key className="w-4 h-4 text-amber-500" />
                2. AI Generation Engine
              </h3>
            </div>

            {/* Engine Tabs */}
            <div className="flex rounded-xl bg-zinc-100 dark:bg-zinc-800/80 p-1 gap-1">
              <button
                type="button"
                onClick={() => setAiEngine('gemini')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  aiEngine === 'gemini'
                    ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                Google Gemini AI
              </button>
              <button
                type="button"
                onClick={() => setAiEngine('flux')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  aiEngine === 'flux'
                    ? 'bg-white dark:bg-zinc-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                }`}
              >
                <Cpu className="w-3.5 h-3.5 text-emerald-500" />
                Cloud AI (Flux Free)
              </button>
            </div>

            {aiEngine === 'gemini' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Google Gemini API Key:
                  </label>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  >
                    Get API Key <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="AIzaSy... (saved in browser)"
                    className="w-full px-3 py-2 pr-10 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors cursor-pointer"
                    title={showApiKey ? 'Hide API key' : 'Show API key'}
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Sends diagram directly to Gemini 2.5/2.0 Flash multimodal image generation API.
                </p>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs space-y-1">
                <div className="font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-emerald-600" />
                  Ready to Generate - No API Key Needed
                </div>
                <p className="text-zinc-600 dark:text-zinc-400 text-[11px]">
                  Uses Cloud AI Flux.1 photorealistic 3D engine to render textures and objects directly as instructed by your prompt.
                </p>
              </div>
            )}
          </div>

          {/* Card 3: Custom AI Prompt (The Main Control) */}
          <div className="p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-500" />
                3. Custom Prompt
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(customPrompt);
                    setCopiedPrompt(true);
                    setTimeout(() => setCopiedPrompt(false), 2000);
                  }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                  title="Copy prompt text"
                >
                  {copiedPrompt ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  {copiedPrompt ? 'Copied' : 'Copy'}
                </button>
                <button
                  type="button"
                  onClick={() => setCustomPrompt(DEFAULT_AI_PROMPT)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline transition-colors cursor-pointer"
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
              rows={5}
              className="w-full px-3 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 text-xs font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none shadow-xs"
              placeholder="Enter your custom prompt (materials, textures, colors, studio lighting)..."
            />
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Modify the prompt to specify materials (black leather, metallic red gloss, chrome, matte ABS), lighting, or colors as you desire.
            </p>
          </div>

          {/* Card 4: Preservation Toggle & Action Button */}
          <div className="p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm space-y-4">
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800">
              <input
                type="checkbox"
                checked={overlayCallouts}
                onChange={(e) => setOverlayCallouts(e.target.checked)}
                className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
              />
              <div className="text-xs space-y-0.5">
                <span className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <Layers3 className="w-3.5 h-3.5 text-indigo-500" />
                  Preserve Callout Numbers (1–16) & Leader Lines
                </span>
                <p className="text-zinc-500 dark:text-zinc-400">
                  Extracts numbers and dashed leader lines onto a protected layer so they remain 100% crisp without AI distortion.
                </p>
              </div>
            </label>

            {/* Main Action Button */}
            <button
              onClick={handleProcess}
              disabled={isProcessing || (!selectedFile && !previewUrl)}
              className="w-full py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-bold text-sm shadow-md shadow-blue-600/20 disabled:opacity-50 disabled:pointer-events-none transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              {isProcessing
                ? 'Generating 3D Render from Prompt...'
                : aiEngine === 'gemini'
                ? 'Generate with Gemini 3D'
                : 'Generate with Cloud AI (Flux)'}
            </button>
          </div>
        </div>

        {/* Right Column: Interactive Split Viewer & Output Layers */}
        <div className="lg:col-span-7 space-y-4">
          <div className="p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-blue-500" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
                  Interactive 3D Split Comparison
                </h3>
              </div>

              {result && (
                <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg text-xs">
                  <button
                    onClick={() => setActiveLayerTab('composite')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                      activeLayerTab === 'composite'
                        ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                    }`}
                  >
                    3D + Callouts
                  </button>
                  <button
                    onClick={() => setActiveLayerTab('clean')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                      activeLayerTab === 'clean'
                        ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                    }`}
                  >
                    Clean 3D
                  </button>
                  <button
                    onClick={() => setActiveLayerTab('depth')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                      activeLayerTab === 'depth'
                        ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                    }`}
                  >
                    Depth Map
                  </button>
                  <button
                    onClick={() => setActiveLayerTab('annotations')}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
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
                    Upload an isometric parts drawing or click "Load Sample Seat" to start prompt-based 3D photorealistic conversion.
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
                  <span className="absolute bottom-3 right-3 px-2 py-0.5 rounded-md bg-black/70 text-white font-mono text-[10px] uppercase tracking-wider backdrop-blur-xs flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    {result.engine_used || 'AI Render'} ({result.elapsed_ms}ms)
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
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download 3D + Callouts
                  </button>

                  <button
                    onClick={() => handleDownload(result.clean_render_base64, '3D_Clean_Render.png')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-semibold transition-colors cursor-pointer"
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
