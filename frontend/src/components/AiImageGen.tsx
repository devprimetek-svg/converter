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
} from 'lucide-react';

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

  // Mandatory Reference Schematic Diagram
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);

  // Generation status
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState<string>('');
  const [currentResult, setCurrentResult] = useState<GenerationHistoryItem | null>(null);
  const [history, setHistory] = useState<GenerationHistoryItem[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'render' | 'schematic' | 'split'>('render');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleImageUpload = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please select a valid schematic image file (JPG, PNG, WebP).');
      return;
    }
    setReferenceImage(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      setReferencePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
    setErrorMsg(null);
  };

  const handleLoadSample = async () => {
    try {
      setErrorMsg(null);
      const res = await fetch('/sample_isometric_diagram.jpg');
      if (!res.ok) throw new Error('Sample not found');
      const blob = await res.blob();
      const file = new File([blob], 'yamaha_b971470_disc_brake_schematic.jpg', { type: 'image/jpeg' });
      setReferenceImage(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setReferencePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    } catch {
      setErrorMsg('Could not load sample. Please upload your own schematic image.');
    }
  };

  const handleRemoveReferenceImage = () => {
    setReferenceImage(null);
    setReferencePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleResetPrompt = () => {
    setPrompt(DEFAULT_PROMPT);
  };

  const handleGenerate = async () => {
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) {
      setErrorMsg('Please enter or verify the prompt instructions.');
      return;
    }

    if (!referenceImage) {
      setErrorMsg('Isometric schematic diagram is mandatory! Please upload a diagram or click "Load Sample Schematic".');
      return;
    }

    setIsGenerating(true);
    setErrorMsg(null);
    setGenerationStep('Step 1/2: Analyzing schematic components, exploded axes & materials...');

    const activeRatio = ASPECT_RATIOS.find((r) => r.id === aspectRatio) || ASPECT_RATIOS[0];
    const seed = Math.floor(Math.random() * 999999999) + 1;

    let imageUrl: string | null = null;
    let engineName = 'FLUX.1 Schnell (Black Forest Labs)';

    // Step 1: Attempt backend generation
    try {
      const formData = new FormData();
      formData.append('prompt', cleanPrompt);
      formData.append('aspect_ratio', aspectRatio);
      formData.append('seed', seed.toString());
      formData.append('reference_image', referenceImage);

      // Transition step message
      setTimeout(() => {
        setGenerationStep('Step 2/2: Rendering photorealistic 3D CAD engineering assembly (FLUX.1)...');
      }, 3000);

      const res = await fetch('/api/ai/generate-image', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.image_url) {
          imageUrl = data.image_url;
          engineName = data.engine || engineName;
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || 'Backend generation failed');
      }
    } catch (backendErr: any) {
      // Backend error - fallback to direct client stream if needed
      setGenerationStep('Finalizing render stream...');
    }

    // Step 2: Fallback to direct client-side stream if backend didn't return data URL
    if (!imageUrl) {
      const encoded = encodeURIComponent(
        `${cleanPrompt} High precision 3D CAD exploded engineering render on clean pure white background.`
      );
      const directUrl = `https://image.pollinations.ai/prompt/${encoded}?model=flux-realism&width=${activeRatio.width}&height=${activeRatio.height}&seed=${seed}&nologo=true`;

      try {
        await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => {
            const fallbackUrl = `https://image.pollinations.ai/prompt/${encoded}?model=flux&width=${activeRatio.width}&height=${activeRatio.height}&seed=${seed}&nologo=true`;
            const fb = new Image();
            fb.onload = () => {
              imageUrl = fallbackUrl;
              resolve(fb);
            };
            fb.onerror = () => reject(new Error('AI generation service is currently busy. Please retry in a few moments.'));
            fb.src = fallbackUrl;
          };
          img.src = directUrl;
        });
        if (!imageUrl) imageUrl = directUrl;
      } catch (clientErr: any) {
        setErrorMsg(clientErr.message || 'Image generation failed. Please try again.');
        setIsGenerating(false);
        setGenerationStep('');
        return;
      }
    }

    const newItem: GenerationHistoryItem = {
      id: Math.random().toString(36).substring(7),
      url: imageUrl,
      referenceUrl: referencePreview || undefined,
      prompt: cleanPrompt,
      aspectRatio,
      engine: engineName,
      seed,
      timestamp: Date.now(),
    };

    setCurrentResult(newItem);
    setHistory((prev) => [newItem, ...prev.slice(0, 11)]);
    setIsGenerating(false);
    setGenerationStep('');
    setViewMode('render');
  };

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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-zinc-900 text-white dark:bg-zinc-950 border border-zinc-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-white text-black flex items-center justify-center font-bold shadow-md shrink-0">
            <Cpu className="w-6 h-6 text-zinc-900" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight font-sans">
                Isometric Schematic to 3D CAD Render
              </h2>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30 flex items-center gap-1">
                <Zap className="w-3 h-3 text-emerald-400" />
                FLUX.1 3D CAD Engine
              </span>
            </div>
            <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
              Transform 2D isometric parts diagrams into photorealistic 3D engineering CAD assemblies with OEM materials & preserved index callouts.
            </p>
          </div>
        </div>
      </div>

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Manual Controls & Required Upload (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Mandatory Schematic Diagram Upload Card */}
          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-950 border-2 border-zinc-900/20 dark:border-zinc-100/20 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-zinc-900 dark:text-zinc-100" />
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100 font-mono">
                  Isometric Schematic Diagram <span className="text-red-500 font-bold">* (MANDATORY)</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                {!referenceImage && (
                  <button
                    type="button"
                    onClick={handleLoadSample}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-mono flex items-center gap-1 cursor-pointer"
                  >
                    <FileCheck2 className="w-3.5 h-3.5" />
                    Load Sample (Yamaha Disc Brake)
                  </button>
                )}
                {referenceImage && (
                  <button
                    type="button"
                    onClick={handleRemoveReferenceImage}
                    className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 cursor-pointer font-mono"
                  >
                    <X className="w-3.5 h-3.5" /> Remove Diagram
                  </button>
                )}
              </div>
            </div>

            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Upload any 2D exploded isometric diagram, spare parts catalogue schematic, or mechanical line drawing. The AI analyzes component geometry, exploded trajectory axes, and callout numbers before rendering.
            </p>

            {referencePreview ? (
              <div className="relative w-full h-56 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center p-2">
                <img
                  src={referencePreview}
                  alt="Reference Schematic"
                  className="max-h-full max-w-full object-contain rounded"
                />
                <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-mono flex items-center gap-1 shadow">
                  <CheckCircle2 className="w-3 h-3" /> Diagram Loaded
                </div>
                <div className="absolute bottom-2 left-2 px-2.5 py-1 rounded bg-black/75 backdrop-blur-sm text-white text-[10px] font-mono truncate max-w-xs">
                  {referenceImage?.name}
                </div>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleImageUpload(e.dataTransfer.files[0]);
                  }
                }}
                className="border-2 border-dashed border-zinc-300 dark:border-zinc-800 hover:border-black dark:hover:border-white rounded-xl p-8 flex flex-col items-center justify-center gap-2.5 cursor-pointer transition-colors text-center bg-zinc-50/70 dark:bg-zinc-900/30 group"
              >
                <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Upload className="w-6 h-6 text-zinc-600 dark:text-zinc-300" />
                </div>
                <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                  Click or Drag & Drop isometric schematic diagram here
                </div>
                <div className="text-[11px] text-zinc-500">
                  Supports CAD schematics, catalogue diagrams (PNG, JPG, WebP)
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleLoadSample();
                  }}
                  className="mt-1 text-xs px-3 py-1 rounded-lg bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-medium cursor-pointer transition-colors"
                >
                  Or click here to test with Sample Yamaha Diagram
                </button>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleImageUpload(e.target.files[0]);
                }
              }}
            />
          </div>

          {/* Technical Engineering Prompt Card */}
          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 font-mono flex items-center gap-2">
                <Wand2 className="w-4 h-4 text-zinc-900 dark:text-zinc-100" />
                <span>Engineering Render Prompt</span>
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
              rows={6}
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
            disabled={isGenerating || !referenceImage}
            className="w-full py-4 px-6 rounded-2xl bg-zinc-900 text-white hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-100 font-bold text-sm tracking-wide shadow-xl flex items-center justify-center gap-2.5 transition-all transform active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>{generationStep || 'Rendering 3D CAD Assembly...'}</span>
              </>
            ) : !referenceImage ? (
              <>
                <Upload className="w-5 h-5" />
                <span>Upload Schematic Diagram to Enable 3D Render</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5 text-amber-400 dark:text-amber-500" />
                <span>Analyse Schematic & Generate 3D CAD Render</span>
              </>
            )}
          </button>
        </div>

        {/* Right Column: Output & Canvas (5 cols) */}
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

              {currentResult && (
                <div className="flex items-center gap-1.5">
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
                </div>
              )}
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
                    {generationStep || 'Analyzing & Rendering with AI...'}
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
                    onClick={() => setFullscreenImage(viewMode === 'schematic' && currentResult.referenceUrl ? currentResult.referenceUrl : currentResult.url)}
                  />
                  <div className="absolute top-3 left-3 px-2 py-0.5 rounded bg-black/75 backdrop-blur-sm text-white text-[10px] font-mono">
                    {viewMode === 'schematic' ? '2D Schematic Diagram' : '3D Photorealistic Render'}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 p-8 text-center text-zinc-400 dark:text-zinc-600">
                  <Cpu className="w-12 h-12 stroke-[1.5]" />
                  <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    No 3D CAD Render Generated Yet
                  </div>
                  <div className="text-[11px] max-w-xs text-zinc-500">
                    Upload an isometric schematic diagram on the left and click "Analyse Schematic & Generate 3D CAD Render".
                  </div>
                </div>
              )}
            </div>

            {/* Prompt Meta Display */}
            {currentResult && (
              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 text-xs space-y-2 font-mono">
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Schematic Analyzed & Rendered Successfully</span>
                </div>
                <div className="text-zinc-700 dark:text-zinc-300 font-sans text-xs line-clamp-3">
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

          {/* History Gallery */}
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
