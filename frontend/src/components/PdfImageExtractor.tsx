import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileImage,
  Download,
  CheckSquare,
  Square,
  Search,
  RotateCcw,
  Maximize2,
  X,
  FileArchive,
  Loader2,
  AlertCircle,
} from 'lucide-react';

interface ExtractedImage {
  id: string;
  filename: string;
  page: number;
  width: number;
  height: number;
  format: string;
  size_bytes: number;
  thumbnail_url: string;
  is_duplicate?: boolean;
}

export const PdfImageExtractor: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [images, setImages] = useState<ExtractedImage[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pageFilter, setPageFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [previewImage, setPreviewImage] = useState<ExtractedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (selectedFile: File) => {
    if (!selectedFile.name.toLowerCase().endsWith('.pdf')) {
      setError('Please upload a valid PDF document (.pdf).');
      return;
    }
    setError(null);
    setFile(selectedFile);
    setIsProcessing(true);
    setImages([]);
    setSelectedIds(new Set());

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await fetch('/api/pdf/extract-images', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || `Extraction failed with status ${res.status}`);
      }

      const data = await res.json();
      setSessionId(data.session_id);
      setImages(data.images || []);
      // Select all by default
      const allIds = new Set<string>((data.images || []).map((img: ExtractedImage) => img.id));
      setSelectedIds(allIds);
    } catch (err: any) {
      setError(err.message || 'Failed to extract images from PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setSessionId(null);
    setImages([]);
    setSelectedIds(new Set());
    setError(null);
    setPreviewImage(null);
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredImages.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredImages.map((img) => img.id)));
    }
  };

  // Distinct pages for filter dropdown
  const pagesList = Array.from(new Set(images.map((img) => img.page))).sort((a, b) => a - b);

  const filteredImages = images.filter((img) => {
    if (pageFilter !== 'ALL' && img.page !== Number(pageFilter)) {
      return false;
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        img.filename.toLowerCase().includes(term) ||
        img.format.toLowerCase().includes(term) ||
        `page ${img.page}`.includes(term)
      );
    }
    return true;
  });

  const handleDownloadZip = async (useSelected: boolean = true) => {
    if (!sessionId) return;
    setIsDownloadingZip(true);
    try {
      const payload = {
        session_id: sessionId,
        selected_ids: useSelected ? Array.from(selectedIds) : undefined,
      };

      const res = await fetch('/api/pdf/download-images-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Failed to generate ZIP archive.');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const baseName = (file?.name || 'document').replace(/\.pdf$/i, '');
      a.download = `${baseName}_extracted_images.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'Download error.');
    } finally {
      setIsDownloadingZip(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      {/* Upload View */}
      {!file && (
        <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-300">
          <div className="text-center space-y-2">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900">
              Raster Image Harvester
            </span>
            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Extract All Images from PDF
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Upload any PDF to extract embedded diagrams, schematics, photos, and figures — automatically converted and saved in high-quality JPG format.
            </p>
          </div>

          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files?.[0]) handleFileChange(e.dataTransfer.files[0]);
            }}
            className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-500 rounded-3xl p-10 text-center cursor-pointer bg-white dark:bg-slate-900/60 hover:bg-indigo-50/20 transition-all duration-200 shadow-sm"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) handleFileChange(e.target.files[0]);
              }}
            />
            <div className="w-16 h-16 mx-auto rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-4">
              <UploadCloud className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">
              Drop PDF file here or click to browse
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Supports large documents up to ~100MB
            </p>
          </div>
        </div>
      )}

      {/* Error Notice */}
      {error && (
        <div className="max-w-2xl mx-auto p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-2xl flex items-center justify-between text-sm text-red-700 dark:text-red-300">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="p-1 hover:bg-red-100 dark:hover:bg-red-900/60 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Processing State */}
      {isProcessing && (
        <div className="max-w-md mx-auto p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-600" />
          <div>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
              Scanning PDF for embedded images...
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Extracting raw raster graphics and building preview thumbnails
            </p>
          </div>
        </div>
      )}

      {/* Results View */}
      {file && !isProcessing && (
        <div className="space-y-6">
          {/* Header Action Bar */}
          <div className="p-4 sm:p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <FileImage className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span>{images.length} Images Extracted</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono">
                    {file.name}
                  </span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedIds.size} of {filteredImages.length} images selected
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Upload New
              </button>

              <button
                onClick={() => handleDownloadZip(true)}
                disabled={selectedIds.size === 0 || isDownloadingZip}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/20 disabled:opacity-50 disabled:pointer-events-none transition-all"
              >
                <FileArchive className="w-4 h-4" />
                {isDownloadingZip
                  ? 'Archiving...'
                  : `Download Selected as ZIP (${selectedIds.size})`}
              </button>

              <button
                onClick={() => handleDownloadZip(false)}
                disabled={images.length === 0 || isDownloadingZip}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white text-xs font-bold shadow-sm disabled:opacity-50 disabled:pointer-events-none transition-all"
              >
                <Download className="w-4 h-4" />
                Download All ZIP ({images.length})
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleSelectAll}
                className="inline-flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400"
              >
                {selectedIds.size === filteredImages.length && filteredImages.length > 0 ? (
                  <CheckSquare className="w-4 h-4 text-indigo-600" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400" />
                )}
                <span>Select All Filtered</span>
              </button>
            </div>

            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative min-w-[180px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Filter images..."
                  className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Page Filter */}
              {pagesList.length > 1 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">Page:</span>
                  <select
                    value={pageFilter}
                    onChange={(e) => setPageFilter(e.target.value)}
                    className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium"
                  >
                    <option value="ALL">All Pages ({pagesList.length})</option>
                    {pagesList.map((p) => (
                      <option key={p} value={p}>
                        Page {p}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Image Grid */}
          {filteredImages.length === 0 ? (
            <div className="p-12 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-500">
              {images.length === 0
                ? 'No raster images were found embedded in this PDF.'
                : 'No images match the current filter.'}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {filteredImages.map((img) => {
                const isSelected = selectedIds.has(img.id);
                return (
                  <div
                    key={img.id}
                    className={`group relative rounded-2xl border bg-white dark:bg-slate-900 overflow-hidden transition-all duration-200 flex flex-col ${
                      isSelected
                        ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-md'
                        : 'border-slate-200 dark:border-slate-800 hover:border-indigo-300'
                    }`}
                  >
                    {/* Thumbnail preview area */}
                    <div
                      onClick={() => toggleSelect(img.id)}
                      className="relative w-full aspect-square bg-slate-100 dark:bg-slate-800 flex items-center justify-center p-2 cursor-pointer"
                    >
                      <img
                        src={img.thumbnail_url}
                        alt={img.filename}
                        className="max-w-full max-h-full object-contain rounded-lg transition-transform duration-200 group-hover:scale-105"
                      />

                      {/* Select check badge */}
                      <div className="absolute top-2 left-2 z-10">
                        <div
                          className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${
                            isSelected
                              ? 'bg-indigo-600 text-white'
                              : 'bg-white/80 dark:bg-slate-900/80 text-transparent hover:text-slate-400 border border-slate-300 dark:border-slate-700'
                          }`}
                        >
                          <CheckSquare className="w-3.5 h-3.5" />
                        </div>
                      </div>

                      {/* Full preview trigger */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewImage(img);
                        }}
                        className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        title="View Full Size"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                      </button>

                      <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/60 text-[10px] font-bold text-white font-mono">
                        p.{img.page}
                      </div>
                    </div>

                    {/* Meta info */}
                    <div className="p-3 flex-1 flex flex-col justify-between text-xs border-t border-slate-100 dark:border-slate-800">
                      <div>
                        <div className="font-semibold text-slate-800 dark:text-slate-200 truncate font-mono text-[11px]" title={img.filename}>
                          {img.filename}
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                          <span>{img.width} × {img.height}</span>
                          <span>{formatFileSize(img.size_bytes)}</span>
                        </div>
                      </div>

                      {/* Single download button */}
                      <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                          JPEG
                        </span>
                        <a
                          href={`/api/pdf/images/${sessionId}/${img.id}`}
                          download={img.filename}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400"
                          title="Download Image"
                        >
                          <Download className="w-3 h-3" />
                          Save
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Full Preview Modal */}
      {previewImage && sessionId && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-4xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
          >
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white font-mono">
                  {previewImage.filename}
                </h4>
                <p className="text-xs text-slate-500">
                  Page {previewImage.page} • {previewImage.width} × {previewImage.height} px • {formatFileSize(previewImage.size_bytes)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`/api/pdf/images/${sessionId}/${previewImage.id}`}
                  download={previewImage.filename}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </a>
                <button
                  onClick={() => setPreviewImage(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 flex items-center justify-center bg-slate-950 overflow-auto max-h-[75vh]">
              <img
                src={`/api/pdf/images/${sessionId}/${previewImage.id}`}
                alt={previewImage.filename}
                className="max-w-full max-h-full object-contain rounded"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
