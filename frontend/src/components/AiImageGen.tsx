import React, { useState, useRef } from 'react';
import {
  Sparkles,
  Wand2,
  Image as ImageIcon,
  Upload,
  X,
  Download,
  Copy,
  Maximize2,
  RefreshCw,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Key,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface GenerationHistoryItem {
  id: string;
  url: string;
  prompt: string;
  style: string;
  aspectRatio: string;
  engine: string;
  seed?: number;
  timestamp: number;
}

const STYLE_PRESETS = [
  { id: 'photorealistic', label: 'Photorealistic', icon: '📸', desc: 'Studio lighting, 8K DSLR' },
  { id: 'technical-blueprint', label: 'CAD Blueprint', icon: '📐', desc: 'Engineering line drawing' },
  { id: '3d-render', label: '3D Render', icon: '🎨', desc: 'Octane raytraced metallic' },
  { id: 'line-art', label: 'Line Art', icon: '✏️', desc: 'Crisp vector catalog diagram' },
  { id: 'cinematic', label: 'Cinematic', icon: '🌌', desc: 'Dramatic lighting & depth' },
  { id: 'vintage-catalog', label: 'Vintage Catalog', icon: '🏷️', desc: '1980s retro lithograph' },
  { id: 'none', label: 'Raw / Custom', icon: '✨', desc: 'No added style suffix' },
];

const ASPECT_RATIOS = [
  { id: '1:1', label: '1:1 Square', sub: '1024×1024' },
  { id: '16:9', label: '16:9 Landscape', sub: '1280×720' },
  { id: '9:16', label: '9:16 Portrait', sub: '720×1280' },
  { id: '4:3', label: '4:3 Standard', sub: '1024×768' },
];

const EXAMPLE_PROMPTS = [
  'Yamaha motorcycle carburetor 3D studio cutaway, metallic titanium finish',
  'Automotive disc brake caliper assembly, exploded isometric CAD blueprint',
  'Motorcycle spark plug with ceramic insulator, hyper-detailed product photo',
  'High performance aluminum engine piston with rings, clean white background',
  'Vintage 1980s motorcycle transmission gears schematic manual illustration',
];

export const AiImageGen: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [style, setStyle] = useState('photorealistic');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [engine, setEngine] = useState('auto');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customApiKey, setCustomApiKey] = useState('');
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState<string | null>(null);

  // Reference image for Image + Prompt
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);

  // Generation status
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentResult, setCurrentResult] = useState<GenerationHistoryItem | null>(null);
  const [history, setHistory] = useState<GenerationHistoryItem[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleImageUpload = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please select a valid image file (JPG, PNG, WebP).');
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

  const handleRemoveReferenceImage = () => {
    setReferenceImage(null);
    setReferencePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleVerifyKey = async () => {
    setApiKeyStatus('Verifying with Google AI Studio...');
    try {
      const q = customApiKey ? `?api_key=${encodeURIComponent(customApiKey)}` : '';
      const res = await fetch(`/api/ai/verify-key${q}`);
      const data = await res.json();
      if (data.valid) {
        setApiKeyStatus(`✅ Verified: ${data.message}`);
      } else {
        setApiKeyStatus(`⚠️ ${data.message}`);
      }
    } catch {
      setApiKeyStatus('❌ Failed to reach verification endpoint.');
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setErrorMsg('Please enter a prompt describing the image you want to generate.');
      return;
    }

    setIsGenerating(true);
    setErrorMsg(null);

    const formData = new FormData();
    formData.append('prompt', prompt.trim());
    if (negativePrompt.trim()) formData.append('negative_prompt', negativePrompt.trim());
    formData.append('style', style);
    formData.append('aspect_ratio', aspectRatio);
    formData.append('engine', engine);
    if (customApiKey.trim()) formData.append('api_key', customApiKey.trim());
    if (referenceImage) formData.append('reference_image', referenceImage);

    try {
      const res = await fetch('/api/ai/generate-image', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Generation failed (HTTP ${res.status})`);
      }

      const data = await res.json();
      const newItem: GenerationHistoryItem = {
        id: Math.random().toString(36).substring(7),
        url: data.image_url,
        prompt: prompt.trim(),
        style,
        aspectRatio,
        engine: data.engine || 'AI Engine',
        seed: data.seed,
        timestamp: Date.now(),
      };

      setCurrentResult(newItem);
      setHistory((prev) => [newItem, ...prev.slice(0, 11)]);
    } catch (err: any) {
      setErrorMsg(err.message || 'Image generation failed. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = (item: GenerationHistoryItem) => {
    const a = document.createElement('a');
    a.href = item.url;
    a.download = `ConverterStudio_AI_${item.id}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCopy = async (item: GenerationHistoryItem) => {
    try {
      const response = await fetch(item.url);
      const blob = await response.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback copy text
      navigator.clipboard.writeText(item.prompt);
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
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight font-sans">AI Image Generator</h2>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-white/20 text-white font-semibold">
                Gemini & Imagen Ready
              </span>
            </div>
            <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
              Generate photorealistic product renders, CAD blueprints & spare part graphics from text or reference images.
            </p>
          </div>
        </div>

        {/* API Key Status Pill */}
        <button
          onClick={() => setShowApiKeyModal(!showApiKeyModal)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-200 border border-zinc-700 transition-all cursor-pointer shrink-0"
        >
          <Key className="w-3.5 h-3.5 text-emerald-400" />
          <span>Google AI Studio Key: Active</span>
          <ChevronDown className="w-3 h-3 text-zinc-400" />
        </button>
      </div>

      {/* API Key Modal / Dropdown */}
      {showApiKeyModal && (
        <div className="p-4 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
              <Key className="w-4 h-4 text-emerald-500" />
              <span>Google AI Studio API Key Configuration</span>
            </div>
            <button
              onClick={() => setShowApiKeyModal(false)}
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Your Google AI Studio API key configured on Render Cloud is active. You can also enter an alternate key below:
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              value={customApiKey}
              onChange={(e) => setCustomApiKey(e.target.value)}
              placeholder="Paste alternate Gemini API Key (AIzaSy...)"
              className="flex-1 px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-black text-xs font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white"
            />
            <button
              onClick={handleVerifyKey}
              className="px-3 py-1.5 rounded-lg bg-black text-white dark:bg-white dark:text-black text-xs font-semibold hover:opacity-90 transition-all cursor-pointer"
            >
              Verify Key
            </button>
          </div>
          {apiKeyStatus && (
            <div className="text-xs font-mono text-zinc-700 dark:text-zinc-300 p-2 rounded bg-zinc-200/50 dark:bg-zinc-800/50">
              {apiKeyStatus}
            </div>
          )}
        </div>
      )}

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Controls (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Prompt Card */}
          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 font-mono flex items-center gap-2">
                <Wand2 className="w-4 h-4 text-zinc-900 dark:text-zinc-100" />
                <span>Text Prompt</span>
              </label>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono">
                {prompt.length} chars
              </span>
            </div>

            <textarea
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the image you want to generate in detail (e.g. Motorcycle brake disc caliper, precision metallic 3D render, clean white studio lighting, 8k resolution)..."
              className="w-full p-3.5 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white resize-y font-sans transition-all"
            />

            {/* Example Prompt Chips */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Quick Inspiration:</div>
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLE_PROMPTS.map((ex, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setPrompt(ex)}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 transition-colors cursor-pointer text-left truncate max-w-xs"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Reference Image Upload (Image + Prompt Remix) */}
          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-zinc-900 dark:text-zinc-100" />
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 font-mono">
                  Reference Image (Optional Remix / Img2Img)
                </span>
              </div>
              {referenceImage && (
                <button
                  type="button"
                  onClick={handleRemoveReferenceImage}
                  className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" /> Remove
                </button>
              )}
            </div>

            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Upload a spare part photo, sketch, or drawing. The AI will synthesize its shape and features with your prompt.
            </p>

            {referencePreview ? (
              <div className="relative w-full h-44 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center">
                <img
                  src={referencePreview}
                  alt="Reference Preview"
                  className="max-h-full max-w-full object-contain"
                />
                <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/70 text-white text-[10px] font-mono">
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
                className="border-2 border-dashed border-zinc-300 dark:border-zinc-800 hover:border-zinc-500 dark:hover:border-zinc-600 rounded-xl p-5 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors text-center bg-zinc-50/50 dark:bg-zinc-900/30"
              >
                <Upload className="w-6 h-6 text-zinc-400" />
                <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Click or Drag & Drop image here
                </div>
                <div className="text-[10px] text-zinc-400">Supports PNG, JPG, WebP</div>
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

          {/* Style Presets */}
          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 font-mono flex items-center gap-2">
              <Layers className="w-4 h-4 text-zinc-900 dark:text-zinc-100" />
              <span>Visual Style Preset</span>
            </label>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {STYLE_PRESETS.map((st) => {
                const isSelected = style === st.id;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setStyle(st.id)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-black bg-zinc-100 text-black dark:border-white dark:bg-zinc-900 dark:text-white ring-1 ring-black dark:ring-white shadow-xs'
                        : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900/50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-xs">
                      <span>{st.icon}</span>
                      <span>{st.label}</span>
                    </div>
                    <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1 truncate">
                      {st.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Aspect Ratio Selector */}
          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 font-mono">
              Aspect Ratio
            </label>

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

          {/* Advanced Accordion (Negative prompt, engine) */}
          <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between text-xs font-semibold text-zinc-700 dark:text-zinc-300 cursor-pointer"
            >
              <span className="flex items-center gap-1.5 font-mono uppercase text-[11px]">
                <Sliders className="w-3.5 h-3.5" />
                Advanced Controls & Engine
              </span>
              {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showAdvanced && (
              <div className="mt-4 space-y-4 pt-3 border-t border-zinc-200 dark:border-zinc-800 animate-in fade-in duration-150">
                <div>
                  <label className="text-[11px] font-mono text-zinc-600 dark:text-zinc-400 block mb-1">
                    Negative Prompt (What to avoid):
                  </label>
                  <input
                    type="text"
                    value={negativePrompt}
                    onChange={(e) => setNegativePrompt(e.target.value)}
                    placeholder="e.g. blurry, low quality, distorted text, cartoon, extra limbs"
                    className="w-full px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-mono text-zinc-600 dark:text-zinc-400 block mb-1">
                    AI Generation Engine:
                  </label>
                  <select
                    value={engine}
                    onChange={(e) => setEngine(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none"
                  >
                    <option value="auto">⚡ Auto (Google Gemini + High-Speed Fallback)</option>
                    <option value="gemini">🧠 Google Imagen 3 (Gemini AI Studio)</option>
                    <option value="fast">🚀 High-Speed Neural Engine</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Error Message */}
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
            disabled={isGenerating || !prompt.trim()}
            className="w-full py-4 px-6 rounded-2xl bg-zinc-900 text-white hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-100 font-bold text-sm tracking-wide shadow-xl flex items-center justify-center gap-2.5 transition-all transform active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Generating Image with AI...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5 text-amber-400 dark:text-amber-500" />
                <span>Generate Image Now</span>
              </>
            )}
          </button>
        </div>

        {/* Right Column: Output & Canvas (5 cols) */}
        <div className="lg:col-span-5 space-y-5 sticky top-20">
          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 font-mono">
                Generated Result
              </span>
              {currentResult && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleCopy(currentResult)}
                    title="Copy image or prompt"
                    className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-600 dark:text-zinc-300 transition-colors cursor-pointer text-xs flex items-center gap-1"
                  >
                    {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied!' : 'Copy'}</span>
                  </button>
                  <button
                    onClick={() => setFullscreenImage(currentResult.url)}
                    title="Fullscreen preview"
                    className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-600 dark:text-zinc-300 transition-colors cursor-pointer"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDownload(currentResult)}
                    title="Download PNG"
                    className="p-1.5 rounded-lg bg-black text-white dark:bg-white dark:text-black hover:opacity-90 transition-all cursor-pointer text-xs font-semibold flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>
                </div>
              )}
            </div>

            {/* Image Canvas Container */}
            <div className="relative w-full aspect-square rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center">
              {isGenerating ? (
                <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
                  <div className="relative w-12 h-12">
                    <div className="absolute inset-0 rounded-full border-2 border-zinc-300 dark:border-zinc-700 animate-ping opacity-30" />
                    <div className="w-12 h-12 rounded-full border-2 border-black dark:border-white border-t-transparent animate-spin" />
                  </div>
                  <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 font-mono">
                    Generating pixels with AI...
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Applying {style} lighting, materials & geometry
                  </div>
                </div>
              ) : currentResult ? (
                <img
                  src={currentResult.url}
                  alt={currentResult.prompt}
                  className="w-full h-full object-contain cursor-zoom-in"
                  onClick={() => setFullscreenImage(currentResult.url)}
                />
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 p-8 text-center text-zinc-400 dark:text-zinc-600">
                  <ImageIcon className="w-12 h-12 stroke-[1.5]" />
                  <div className="text-xs font-medium">No image generated yet</div>
                  <div className="text-[11px] max-w-xs text-zinc-500">
                    Type a prompt on the left and click "Generate Image Now" to create your visual.
                  </div>
                </div>
              )}
            </div>

            {/* Prompt Meta Display */}
            {currentResult && (
              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 text-xs space-y-1.5 font-mono">
                <div className="text-zinc-800 dark:text-zinc-200 font-sans font-medium line-clamp-2">
                  "{currentResult.prompt}"
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-500 dark:text-zinc-400 pt-1 border-t border-zinc-200 dark:border-zinc-800">
                  <span>Engine: {currentResult.engine}</span>
                  <span>•</span>
                  <span>Ratio: {currentResult.aspectRatio}</span>
                  <span>•</span>
                  <span>Style: {currentResult.style}</span>
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
                <span>Recent Creations ({history.length})</span>
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
                    onClick={() => setCurrentResult(item)}
                    className={`aspect-square rounded-lg overflow-hidden border transition-all cursor-pointer ${
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
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setFullscreenImage(null)}
        >
          <div className="relative max-w-5xl max-h-[90vh] flex flex-col items-center">
            <button
              onClick={() => setFullscreenImage(null)}
              className="absolute -top-10 right-0 text-white/80 hover:text-white p-2 cursor-pointer"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={fullscreenImage}
              alt="Fullscreen Preview"
              className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
};
