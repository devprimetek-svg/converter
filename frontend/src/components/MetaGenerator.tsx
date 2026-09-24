import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Tag,
  Copy,
  Check,
  Search,
  Filter,
  FileSpreadsheet,
  FileText,
  UploadCloud,
  Loader2,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  CheckCircle2,
} from 'lucide-react';
import type { PartRow, PartMetadataItem } from '../types';

interface MetaGeneratorProps {
  initialRows?: PartRow[];
  initialFigures?: Array<{ fig_no: string; fig_name: string; first_page: number }>;
  modelColumns?: string[];
  initialFilename?: string;
}

export const MetaGenerator: React.FC<MetaGeneratorProps> = ({
  initialRows = [],
  initialFigures = [],
  modelColumns = [],
  initialFilename = 'Catalogue',
}) => {
  const [rows, setRows] = useState<PartRow[]>(initialRows);
  const [figures, setFigures] = useState<Array<{ fig_no: string; fig_name: string; first_page: number }>>(
    initialFigures
  );
  const [models, setModels] = useState<string[]>(modelColumns);
  const [filename, setFilename] = useState<string>(initialFilename);

  // User Requested Text Boxes:
  // 1. Brand (default YAMAHA)
  // 2. Model Code (auto-detected e.g. BGPK, editable)
  // 3. Model (label Model, blank by default - typed after model code)
  // 4. Series (label Series, default "series")
  const [brand, setBrand] = useState<string>('YAMAHA');
  const [modelCode, setModelCode] = useState<string>('');
  const [model, setModel] = useState<string>('');
  const [series, setSeries] = useState<string>('series');

  // Main parts only vs all child parts
  const [mainPartsOnly, setMainPartsOnly] = useState<boolean>(true);

  // Processing state
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [metadataItems, setMetadataItems] = useState<PartMetadataItem[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filter & Search
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedFigure, setSelectedFigure] = useState<string>('ALL');
  const [expandedItemKey, setExpandedItemKey] = useState<string | null>(null);

  // File upload state for standalone use
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Unique figures for filter
  const uniqueFigures = useMemo(() => {
    if (figures && figures.length > 0) {
      return figures.map((f) => f.fig_name).filter(Boolean);
    }
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.fig_name) set.add(r.fig_name);
    });
    return Array.from(set).sort();
  }, [rows, figures]);

  // Model Code resolution
  const resolvedModelCode = useMemo(() => {
    if (models && models.length > 0) {
      return models[0];
    }
    const match = filename.match(/\b([A-Z0-9]{3,6})\b/i);
    return match ? match[1].toUpperCase() : 'BGPK';
  }, [models, filename]);

  const activeModelCode = (modelCode.trim() || resolvedModelCode).toUpperCase();

  // Trigger generation whenever inputs change
  useEffect(() => {
    if ((rows && rows.length > 0) || (figures && figures.length > 0)) {
      generateMetadata();
    }
  }, [rows, figures, brand, modelCode, model, series, mainPartsOnly, resolvedModelCode]);

  const generateMetadata = async () => {
    if ((!rows || rows.length === 0) && (!figures || figures.length === 0)) return;
    setIsGenerating(true);
    try {
      const payload: any = {
        rows,
        figures,
        model_columns: models,
        brand: brand.trim() || 'YAMAHA',
        model: model.trim(),
        series: series.trim() || 'series',
        model_code: activeModelCode,
        main_parts_only: mainPartsOnly,
      };

      const res = await fetch('/api/meta/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error('Failed to generate metadata');
      }

      const data = await res.json();
      setMetadataItems(data.items || []);
    } catch (err) {
      console.error('Metadata generation error:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const uploadRes = await fetch('/api/extract', {
        method: 'POST',
        body: formData,
      });
      if (!uploadRes.ok) throw new Error('Failed to upload PDF');
      const uploadData = await uploadRes.json();
      const jobId = uploadData.job_id;

      // Poll until finished
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/extract/status/${jobId}`);
          if (!statusRes.ok) return;
          const statusData = await statusRes.json();
          if (statusData.status === 'completed') {
            clearInterval(pollInterval);
            setIsUploading(false);
            setRows(statusData.rows || []);
            setFigures(statusData.figures || []);
            setModels(statusData.model_columns || []);
            setFilename(file.name.replace(/\.pdf$/i, ''));
          } else if (statusData.status === 'error') {
            clearInterval(pollInterval);
            setIsUploading(false);
            alert(`Error: ${statusData.error || 'Extraction failed'}`);
          }
        } catch {
          clearInterval(pollInterval);
          setIsUploading(false);
        }
      }, 1000);
    } catch (err: any) {
      setIsUploading(false);
      alert(err.message || 'Upload failed');
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (e) {
      console.error('Failed to copy to clipboard', e);
    }
  };

  const downloadExport = async (format: 'xlsx' | 'csv') => {
    if (!metadataItems || metadataItems.length === 0) return;
    setIsExporting(true);
    try {
      const res = await fetch('/api/meta/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: metadataItems,
          format,
          filename: `${filename}_Product_Metadata`,
          brand: brand.trim() || 'YAMAHA',
        }),
      });

      if (!res.ok) throw new Error('Export failed');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}_Product_Metadata.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Download error:', err);
    } finally {
      setIsExporting(false);
    }
  };

  // Filtered metadata items
  const filteredItems = useMemo(() => {
    return metadataItems.filter((item) => {
      const pName = item.part_name || item.description || '';
      if (selectedFigure !== 'ALL' && pName !== selectedFigure && item.fig_name !== selectedFigure) {
        return false;
      }
      if (!searchTerm) return true;
      const q = searchTerm.toLowerCase();
      return (
        pName.toLowerCase().includes(q) ||
        item.product_title.toLowerCase().includes(q) ||
        (item.meta_title && item.meta_title.toLowerCase().includes(q)) ||
        item.image_filename.toLowerCase().includes(q) ||
        String(item.fig_no).toLowerCase().includes(q)
      );
    });
  }, [metadataItems, selectedFigure, searchTerm]);

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="p-6 rounded-3xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-black text-white dark:bg-white dark:text-black font-bold">
                <Tag className="w-4 h-4" />
              </span>
              <h2 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white uppercase tracking-wider font-sans">
                Product & Parts SEO Metadata Generator
              </h2>
              {isGenerating && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                  <Loader2 className="w-3 h-3 animate-spin" /> Generating...
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Extracts main parts (assemblies like cylinder) with CAPS product titles, separate meta titles, 151–158 char meta descriptions, and 120–140 word product descriptions (zero commas).
            </p>
          </div>

          {/* Action Bar */}
          <div className="flex flex-wrap items-center gap-2">
            {metadataItems.length > 0 && (
              <>
                <button
                  onClick={() => downloadExport('xlsx')}
                  disabled={isExporting}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-black hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black font-bold text-xs uppercase tracking-wider transition-all shadow-xs active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Export Excel (.xlsx)
                </button>
                <button
                  onClick={() => downloadExport('csv')}
                  disabled={isExporting}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-semibold text-xs border border-zinc-200 dark:border-zinc-800 transition-all font-mono cursor-pointer disabled:opacity-50"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Export CSV
                </button>
              </>
            )}

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white text-xs font-semibold border border-zinc-200 dark:border-zinc-800 transition-all font-mono cursor-pointer"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Scanning PDF...
                </>
              ) : (
                <>
                  <UploadCloud className="w-3.5 h-3.5" />
                  Upload PDF
                </>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileUpload(f);
              }}
            />
          </div>
        </div>

        {/* Configuration Text Boxes (Brand, Model Code, Model [typed after Model Code], Series) */}
        <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Brand Box */}
          <div>
            <label className="block text-xs font-mono uppercase text-zinc-500 font-semibold mb-1.5">
              Brand
            </label>
            <input
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Brand (e.g. YAMAHA)"
              className="w-full px-3.5 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600 font-semibold uppercase"
            />
          </div>

          {/* Model Code Box */}
          <div>
            <label className="block text-xs font-mono uppercase text-zinc-500 font-semibold mb-1.5">
              Model Code
            </label>
            <input
              type="text"
              value={modelCode || resolvedModelCode}
              onChange={(e) => setModelCode(e.target.value.toUpperCase())}
              placeholder="Model Code (e.g. BGPK)"
              className="w-full px-3.5 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600 font-semibold uppercase"
            />
          </div>

          {/* Model Box (typed after Model Code, blank by default per user rule) */}
          <div>
            <label className="block text-xs font-mono uppercase text-zinc-500 font-semibold mb-1.5">
              Model <span className="text-zinc-400 font-normal lowercase">(optional)</span>
            </label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Leave blank or enter model"
              className="w-full px-3.5 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600 font-semibold uppercase placeholder:normal-case placeholder:text-zinc-400"
            />
          </div>

          {/* Series Box (filled by default with "series" per user rule) */}
          <div>
            <label className="block text-xs font-mono uppercase text-zinc-500 font-semibold mb-1.5">
              Series
            </label>
            <input
              type="text"
              value={series}
              onChange={(e) => setSeries(e.target.value)}
              placeholder="series"
              className="w-full px-3.5 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600 font-semibold"
            />
          </div>

          {/* Scope Toggle: Main Parts Only vs All Parts */}
          <div>
            <label className="block text-xs font-mono uppercase text-zinc-500 font-semibold mb-1.5">
              Parts Filter Scope
            </label>
            <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setMainPartsOnly(true)}
                className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer truncate ${
                  mainPartsOnly
                    ? 'bg-black text-white dark:bg-white dark:text-black shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white'
                }`}
                title="Only major assemblies like Cylinder, Crankshaft (Excludes child bolts/nuts)"
              >
                Main Parts Only
              </button>
              <button
                type="button"
                onClick={() => setMainPartsOnly(false)}
                className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer truncate ${
                  !mainPartsOnly
                    ? 'bg-black text-white dark:bg-white dark:text-black shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white'
                }`}
                title="All individual part rows"
              >
                All Parts
              </button>
            </div>
          </div>
        </div>

        {/* Live Rules Legend (per user prompt) */}
        <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 text-[11px] font-mono grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <span className="text-zinc-400 uppercase font-semibold block mb-0.5">Short Description (IN CAPS, no commas):</span>
            <span className="font-bold text-zinc-800 dark:text-zinc-200">
              {brand || 'YAMAHA'} {activeModelCode} {model ? `${model.toUpperCase()} ` : ''}[PARTS NAME]
            </span>
          </div>
          <div>
            <span className="text-zinc-400 uppercase font-semibold block mb-0.5">Meta Title (Separate, no commas):</span>
            <span className="font-bold text-zinc-800 dark:text-zinc-200">
              {brand ? brand.charAt(0).toUpperCase() + brand.slice(1).toLowerCase() : 'Yamaha'} {model ? `${model} ` : ''}{activeModelCode} [Parts Name] | India Spare
            </span>
          </div>
          <div>
            <span className="text-zinc-400 uppercase font-semibold block mb-0.5">Length Constraints:</span>
            <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              Meta Desc 151–158 chars | Prod Desc 120–140 words
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {rows.length === 0 && figures.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center mx-auto text-zinc-700 dark:text-zinc-300">
            <Tag className="w-6 h-6" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-base font-bold text-zinc-900 dark:text-white font-sans">
              No Parts Catalogue Loaded
            </h3>
            <p className="text-xs text-zinc-500">
              Upload a Yamaha parts catalogue PDF to automatically extract main parts, diagram images,
              and generate SEO titles and descriptions.
            </p>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-black text-white dark:bg-white dark:text-black font-bold text-xs uppercase tracking-wider shadow-sm hover:opacity-90 active:scale-95 cursor-pointer"
          >
            <UploadCloud className="w-4 h-4" />
            Select PDF File
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Quick Metrics & Filter Bar */}
          <div className="p-4 rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative w-full sm:w-80">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search catalog name, short description, pic..."
                className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none font-medium"
              />
            </div>

            {/* Figure Dropdown Filter */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <select
                value={selectedFigure}
                onChange={(e) => setSelectedFigure(e.target.value)}
                className="w-full sm:w-64 px-3 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none font-medium"
              >
                <option value="ALL">All Figures ({uniqueFigures.length} assemblies)</option>
                {uniqueFigures.map((fig) => (
                  <option key={fig} value={fig}>
                    {fig}
                  </option>
                ))}
              </select>
            </div>

            {/* Metrics Counter */}
            <div className="shrink-0 text-xs font-mono text-zinc-500">
              Showing <strong className="text-zinc-900 dark:text-white">{filteredItems.length}</strong> of{' '}
              <strong className="text-zinc-900 dark:text-white">{metadataItems.length}</strong> {mainPartsOnly ? 'main parts' : 'parts'}
            </div>
          </div>

          {/* Results Table */}
          <div className="rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 font-semibold border-b border-zinc-200 dark:border-zinc-800">
                  <tr>
                    <th className="p-3 w-12 text-center">Fig</th>
                    <th className="p-3">Catalog Name</th>
                    <th className="p-3">Pic</th>
                    <th className="p-3">Short Description</th>
                    <th className="p-3">Meta Title</th>
                    <th className="p-3 w-28 text-center">Meta Desc</th>
                    <th className="p-3 w-28 text-center">Product Desc</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/80">
                  {filteredItems.map((item, idx) => {
                    const itemKey = `${item.fig_no}_${item.part_name || item.description}_${idx}`;
                    const isExpandedMeta = expandedItemKey === `meta_${itemKey}`;
                    const isExpandedProd = expandedItemKey === `prod_${itemKey}`;
                    const metaDesc = item.meta_description || item.meta_long_description || '';
                    const metaChars = item.meta_desc_chars || metaDesc.length;
                    const prodDesc = item.product_description || '';
                    const prodWords = item.product_desc_words || prodDesc.split(/\s+/).filter(Boolean).length;

                    return (
                      <React.Fragment key={itemKey}>
                        <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors">
                          {/* Fig No */}
                          <td className="p-3 text-center">
                            <span className="inline-block px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-900 font-mono font-bold text-[11px] text-zinc-700 dark:text-zinc-300">
                              #{item.fig_no || '-'}
                            </span>
                            <div className="text-[10px] text-zinc-400 mt-0.5">p.{item.page}</div>
                          </td>

                          {/* Main Part Name */}
                          <td className="p-3">
                            <div className="font-bold text-zinc-900 dark:text-white font-mono text-xs uppercase">
                              {item.part_name || item.description}
                            </div>
                            <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                              Model: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{item.model_code}</span>
                              {item.model ? ` • ${item.model}` : ''}
                            </div>
                          </td>

                          {/* Diagram Image */}
                          <td className="p-3">
                            <div className="flex items-center gap-1.5">
                              <ImageIcon className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                              <span className="font-mono text-[11px] font-semibold text-zinc-800 dark:text-zinc-200 truncate max-w-[160px]" title={item.image_filename}>
                                {item.image_filename}
                              </span>
                            </div>
                          </td>

                          {/* Product Title (IN ALL CAPS, no commas) */}
                          <td className="p-3 max-w-xs">
                            <div className="flex items-start justify-between gap-1.5">
                              <p className="text-xs font-bold text-zinc-900 dark:text-white line-clamp-2 uppercase font-mono">
                                {item.product_title}
                              </p>
                              <button
                                onClick={() => copyToClipboard(item.product_title, `prod_title_${itemKey}`)}
                                title="Copy Short Description"
                                className="p-1 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer shrink-0"
                              >
                                {copiedId === `prod_title_${itemKey}` ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </td>

                          {/* Meta Title (Separate, Title Case, no commas) */}
                          <td className="p-3 max-w-xs">
                            <div className="flex items-start justify-between gap-1.5">
                              <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 line-clamp-2">
                                {item.meta_title || item.product_title}
                              </p>
                              <button
                                onClick={() => copyToClipboard(item.meta_title || item.product_title, `meta_title_${itemKey}`)}
                                title="Copy Meta Title"
                                className="p-1 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer shrink-0"
                              >
                                {copiedId === `meta_title_${itemKey}` ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </td>


                          {/* Meta Description (151-158 Chars without caps) */}
                          <td className="p-3 text-center">
                            <div className="space-y-1">
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                {metaChars} chars
                              </span>
                              <div>
                                <button
                                  onClick={() => setExpandedItemKey(isExpandedMeta ? null : `meta_${itemKey}`)}
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
                                >
                                  {isExpandedMeta ? (
                                    <>Hide <ChevronUp className="w-3 h-3" /></>
                                  ) : (
                                    <>View <ChevronDown className="w-3 h-3" /></>
                                  )}
                                </button>
                              </div>
                            </div>
                          </td>

                          {/* Product Description (120-140 Words) */}
                          <td className="p-3 text-center">
                            <div className="space-y-1">
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                                {prodWords} words
                              </span>
                              <div>
                                <button
                                  onClick={() => setExpandedItemKey(isExpandedProd ? null : `prod_${itemKey}`)}
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
                                >
                                  {isExpandedProd ? (
                                    <>Hide <ChevronUp className="w-3 h-3" /></>
                                  ) : (
                                    <>View <ChevronDown className="w-3 h-3" /></>
                                  )}
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>

                        {/* Expanded Meta Description Row */}
                        {isExpandedMeta && (
                          <tr className="bg-zinc-50 dark:bg-zinc-900/60 border-y border-zinc-200 dark:border-zinc-800">
                            <td colSpan={8} className="p-4 sm:p-5 space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold font-mono text-zinc-900 dark:text-white uppercase tracking-wider">
                                    Meta Description (151–158 Chars without Caps, No Commas)
                                  </span>
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                                    Exact: {metaChars} Characters
                                  </span>
                                </div>
                                <button
                                  onClick={() =>
                                    copyToClipboard(metaDesc, `meta_desc_${itemKey}`)
                                  }
                                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-black text-white dark:bg-white dark:text-black text-xs font-bold transition-all active:scale-95 cursor-pointer"
                                >
                                  {copiedId === `meta_desc_${itemKey}` ? (
                                    <>
                                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                                      Copied Meta Desc!
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3.5 h-3.5" />
                                      Copy Meta Desc
                                    </>
                                  )}
                                </button>
                              </div>

                              <div className="p-3.5 rounded-xl bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 text-xs font-sans text-zinc-800 dark:text-zinc-200">
                                {metaDesc}
                              </div>
                            </td>
                          </tr>
                        )}

                        {/* Expanded Product Description Row */}
                        {isExpandedProd && (
                          <tr className="bg-zinc-50 dark:bg-zinc-900/60 border-y border-zinc-200 dark:border-zinc-800">
                            <td colSpan={8} className="p-4 sm:p-5 space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold font-mono text-zinc-900 dark:text-white uppercase tracking-wider">
                                    Product Description (120–140 Words, No Commas)
                                  </span>
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                                    Exact: {prodWords} Words
                                  </span>
                                </div>
                                <button
                                  onClick={() =>
                                    copyToClipboard(prodDesc, `prod_desc_${itemKey}`)
                                  }
                                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-black text-white dark:bg-white dark:text-black text-xs font-bold transition-all active:scale-95 cursor-pointer"
                                >
                                  {copiedId === `prod_desc_${itemKey}` ? (
                                    <>
                                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                                      Copied Product Desc!
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3.5 h-3.5" />
                                      Copy Product Desc
                                    </>
                                  )}
                                </button>
                              </div>

                              <div className="p-3.5 rounded-xl bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 text-xs font-sans leading-relaxed text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">
                                {prodDesc}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
