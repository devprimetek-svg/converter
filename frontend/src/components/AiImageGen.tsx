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
  CheckCircle2,
  AlertCircle,
  Zap,
} from 'lucide-react';

interface GenerationHistoryItem {
  id: string;
  url: string;
  prompt: string;
  aspectRatio: string;
  engine: string;
  seed?: number;
  timestamp: number;
}

const ASPECT_RATIOS = [
  { id: '1:1', label: '1:1 Square', sub: '768×768', width: 768, height: 768 },
  { id: '16:9', label: '16:9 Landscape', sub: '1024×576', width: 1024, height: 576 },
  { id: '9:16', label: '9:16 Portrait', sub: '576×1024', width: 576, height: 1024 },
  { id: '4:3', label: '4:3 Standard', sub: '896×672', width: 896, height: 672 },
];

export const AiImageGen: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');

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

  const handleGenerate = async () => {
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) {
      setErrorMsg('Please enter a prompt describing the image you want to generate.');
      return;
    }

    setIsGenerating(true);
    setErrorMsg(null);

    const activeRatio = ASPECT_RATIOS.find((r) => r.id === aspectRatio) || ASPECT_RATIOS[0];
    const seed = Math.floor(Math.random() * 999999) + 1;

    let imageUrl: string | null = null;
    let engineName = 'FLUX.1 Schnell (Black Forest Labs)';

    // Step 1: Attempt backend generation
    try {
      const formData = new FormData();
      formData.append('prompt', cleanPrompt);
      formData.append('aspect_ratio', aspectRatio);
      formData.append('seed', seed.toString());
      if (referenceImage) formData.append('reference_image', referenceImage);

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
      }
    } catch {
      // Backend error - will seamlessly fallback to direct client stream below
    }

    // Step 2: Fallback to direct client-side stream if backend didn't return data URL
    if (!imageUrl) {
      const encoded = encodeURIComponent(cleanPrompt);
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
            fb.onerror = () => reject(new Error('AI generation is currently busy. Please try again in a few moments.'));
            fb.src = fallbackUrl;
          };
          img.src = directUrl;
        });
        if (!imageUrl) imageUrl = directUrl;
      } catch (clientErr: any) {
        setErrorMsg(clientErr.message || 'Image generation failed. Please try again.');
        setIsGenerating(false);
        return;
      }
    }

    const newItem: GenerationHistoryItem = {
      id: Math.random().toString(36).substring(7),
      url: imageUrl,
      prompt: cleanPrompt,
      aspectRatio,
      engine: engineName,
      seed,
      timestamp: Date.now(),
    };

    setCurrentResult(newItem);
    setHistory((prev) => [newItem, ...prev.slice(0, 11)]);
    setIsGenerating(false);
  };

  const handleDownload = async (item: GenerationHistoryItem) => {
    try {
      const res = await fetch(item.url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `ConverterStudio_AI_${item.id}.jpg`;
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
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30 flex items-center gap-1">
                <Zap className="w-3 h-3 text-emerald-400" />
                FLUX.1 Schnell Engine • 100% Free
              </span>
            </div>
            <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
              Type your exact prompt or upload a reference image to generate high-resolution visuals. No presets or restrictions.
            </p>
          </div>
        </div>
      </div>

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Manual Controls (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Manual Prompt Card */}
          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 font-mono flex items-center gap-2">
                <Wand2 className="w-4 h-4 text-zinc-900 dark:text-zinc-100" />
                <span>Manual Prompt</span>
              </label>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono">
                {prompt.length} characters
              </span>
            </div>

            <textarea
              rows={5}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter your exact prompt here... (e.g. Yamaha motorcycle disc brake caliper, metallic chrome finish, clean studio lighting, realistic details)"
              className="w-full p-4 rounded-xl border border-zinc-300 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white resize-y font-sans transition-all leading-relaxed"
            />
          </div>

          {/* Reference Image Upload (Optional Image + Prompt Remix) */}
          <div className="p-5 rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-zinc-900 dark:text-zinc-100" />
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 font-mono">
                  Reference Image (Optional Upload)
                </span>
              </div>
              {referenceImage && (
                <button
                  type="button"
                  onClick={handleRemoveReferenceImage}
                  className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" /> Remove Image
                </button>
              )}
            </div>

            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Upload any photo, sketch, or part drawing. The AI will generate an image based on both your reference image and manual prompt.
            </p>

            {referencePreview ? (
              <div className="relative w-full h-48 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center">
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
                className="border-2 border-dashed border-zinc-300 dark:border-zinc-800 hover:border-zinc-500 dark:hover:border-zinc-600 rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors text-center bg-zinc-50/50 dark:bg-zinc-900/30"
              >
                <Upload className="w-6 h-6 text-zinc-400" />
                <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Click or Drag & Drop reference image here
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
                    title="Copy image"
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
                    title="Download Image"
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
                    Rendering pixels with AI...
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Applying your manual prompt details
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
                    Type a manual prompt on the left and click "Generate Image Now".
                  </div>
                </div>
              )}
            </div>

            {/* Prompt Meta Display */}
            {currentResult && (
              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 text-xs space-y-1.5 font-mono">
                <div className="text-zinc-800 dark:text-zinc-200 font-sans font-medium line-clamp-3">
                  "{currentResult.prompt}"
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-500 dark:text-zinc-400 pt-1 border-t border-zinc-200 dark:border-zinc-800">
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
