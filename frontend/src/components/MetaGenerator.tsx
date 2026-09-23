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
  Sparkles,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
} from 'lucide-react';
import type { PartRow, PartMetadataItem } from '../types';

interface MetaGeneratorProps {
  initialRows?: PartRow[];
  modelColumns?: string[];
  initialFilename?: string;
}

export const MetaGenerator: React.FC<MetaGeneratorProps> = ({
  initialRows = [],
  modelColumns = [],
  initialFilename = 'Catalogue',
}) => {
  const [rows, setRows] = useState<PartRow[]>(initialRows);
  const [models, setModels] = useState<string[]>(modelColumns);
  const [filename, setFilename] = useState<string>(initialFilename);
  const [brand, setBrand] = useState<string>('Yamaha');
  const [style, setStyle] = useState<'ecommerce' | 'marketplace' | 'minimalist' | 'custom'>('ecommerce');

  // Custom template state
  const [customTitle, setCustomTitle] = useState<string>(
    '{brand} {description} - {clean_part_no} (Ref #{ref_no}, {fig_name}) | Fits {simple_models}'
  );
  const [customShortDesc, setCustomShortDesc] = useState<string>(
    'Genuine OEM {brand} {description} (Part #{clean_part_no}, Ref #{ref_no}) for {fig_name} assembly. Fits {simple_models}. 100% authentic factory replacement.'
  );
  const [customLongDesc, setCustomLongDesc] = useState<string>(
    '<div class="oem-part-description">\n  <h3>{brand} {description}</h3>\n  <p>Part #{part_no} | Assembly: {fig_name} | Ref #{ref_no}</p>\n  <p>Associated Diagram: {image_filename}</p>\n  <p>Fitment: {models}</p>\n</div>'
  );
  const [activeCustomField, setActiveCustomField] = useState<'title' | 'short' | 'long'>('title');

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

  // Unique figures
  const uniqueFigures = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.fig_name) set.add(r.fig_name);
    });
    return Array.from(set).sort();
  }, [rows]);

  // Trigger generation when rows, brand, or style changes
  useEffect(() => {
    if (rows && rows.length > 0) {
      generateMetadata();
    }
  }, [rows, brand, style]);

  const generateMetadata = async () => {
    if (!rows || rows.length === 0) return;
    setIsGenerating(true);
    try {
      const payload: any = {
        rows,
        model_columns: models,
        brand,
        style,
      };

      if (style === 'custom') {
        payload.custom_templates = {
          title: customTitle,
          short_description: customShortDesc,
          long_description: customLongDesc,
        };
      }

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
          brand,
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

  const insertVariable = (variable: string) => {
    if (activeCustomField === 'title') {
      setCustomTitle((prev) => prev + ` {${variable}}`);
    } else if (activeCustomField === 'short') {
      setCustomShortDesc((prev) => prev + ` {${variable}}`);
    } else {
      setCustomLongDesc((prev) => prev + ` {${variable}}`);
    }
  };

  // Filtered metadata items
  const filteredItems = useMemo(() => {
    return metadataItems.filter((item) => {
      if (selectedFigure !== 'ALL' && item.fig_name !== selectedFigure) {
        return false;
      }
      if (!searchTerm) return true;
      const q = searchTerm.toLowerCase();
      return (
        item.part_no.toLowerCase().includes(q) ||
        item.clean_part_no.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.fig_name.toLowerCase().includes(q) ||
        item.product_title.toLowerCase().includes(q) ||
        item.image_filename.toLowerCase().includes(q) ||
        String(item.ref_no).toLowerCase().includes(q)
      );
    });
  }, [metadataItems, selectedFigure, searchTerm]);

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="p-6 rounded-3xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-black text-white dark:bg-white dark:text-black font-bold">
                <Tag className="w-4 h-4" />
              </span>
              <h2 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white uppercase tracking-wider font-sans">
                Product & Parts SEO Metadata Generator
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Generate e-commerce product titles, meta short descriptions, and structured long descriptions
              tailored to individual parts and diagram images.
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

        {/* Configuration Bar */}
        <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800/80 grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Brand Name Input */}
          <div>
            <label className="block text-xs font-mono uppercase text-zinc-500 font-semibold mb-1.5">
              Brand / Manufacturer
            </label>
            <input
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="e.g. Yamaha"
              className="w-full px-3 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600 font-medium"
            />
          </div>

          {/* Style Preset Selector */}
          <div className="md:col-span-2">
            <label className="block text-xs font-mono uppercase text-zinc-500 font-semibold mb-1.5">
              Template Preset & Style
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: 'ecommerce', label: 'E-Commerce SEO', desc: 'Shopify / WooCommerce' },
                { id: 'marketplace', label: 'Marketplace', desc: 'Amazon / eBay' },
                { id: 'minimalist', label: 'Minimalist Plain', desc: 'Text-only OEM' },
                { id: 'custom', label: 'Custom Formula', desc: 'Formula editor' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setStyle(t.id as any)}
                  className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer ${
                    style === t.id
                      ? 'bg-black text-white dark:bg-white dark:text-black border-black dark:border-white font-bold shadow-xs'
                      : 'bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-700'
                  }`}
                >
                  <p className="text-xs font-bold truncate">{t.label}</p>
                  <p className={`text-[10px] truncate ${style === t.id ? 'opacity-80' : 'text-zinc-500'}`}>
                    {t.desc}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Custom Template Editor */}
        {style === 'custom' && (
          <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 space-y-3 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider font-mono">
                Custom Formula Editor
              </span>
              <button
                onClick={generateMetadata}
                disabled={isGenerating}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black text-white dark:bg-white dark:text-black font-bold text-xs cursor-pointer active:scale-95"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Apply Formula
              </button>
            </div>

            {/* Clickable Variable Chips */}
            <div>
              <p className="text-[11px] text-zinc-500 mb-1.5 font-mono">Click to insert placeholder:</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'brand',
                  'part_no',
                  'clean_part_no',
                  'description',
                  'fig_name',
                  'fig_no',
                  'ref_no',
                  'models',
                  'simple_models',
                  'image_filename',
                  'page',
                  'remarks',
                ].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => insertVariable(v)}
                    className="px-2 py-1 rounded-md bg-zinc-200 dark:bg-zinc-800 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black text-[11px] font-mono text-zinc-800 dark:text-zinc-200 transition-colors cursor-pointer"
                  >
                    {`{${v}}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Template Inputs */}
            <div className="space-y-2">
              <div>
                <label className="block text-[11px] font-mono text-zinc-500 mb-1">
                  Product Title Formula:
                </label>
                <input
                  type="text"
                  value={customTitle}
                  onFocus={() => setActiveCustomField('title')}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 font-mono text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-zinc-500 mb-1">
                  Meta Short Description Formula:
                </label>
                <input
                  type="text"
                  value={customShortDesc}
                  onFocus={() => setActiveCustomField('short')}
                  onChange={(e) => setCustomShortDesc(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 font-mono text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-zinc-500 mb-1">
                  Meta Long Description Formula (HTML or Text):
                </label>
                <textarea
                  rows={3}
                  value={customLongDesc}
                  onFocus={() => setActiveCustomField('long')}
                  onChange={(e) => setCustomLongDesc(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 font-mono text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-400"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {rows.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center mx-auto text-zinc-700 dark:text-zinc-300">
            <Tag className="w-6 h-6" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-base font-bold text-zinc-900 dark:text-white font-sans">
              No Parts Catalogue Loaded
            </h3>
            <p className="text-xs text-zinc-500">
              Upload a Yamaha parts catalogue PDF to automatically extract part records, diagram images,
              and generate complete SEO titles and descriptions.
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
                placeholder="Search part no, description, figure..."
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
              <strong className="text-zinc-900 dark:text-white">{metadataItems.length}</strong> parts
            </div>
          </div>

          {/* Results Table */}
          <div className="rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 font-semibold border-b border-zinc-200 dark:border-zinc-800">
                  <tr>
                    <th className="p-3 w-12 text-center">Ref</th>
                    <th className="p-3">Part Details</th>
                    <th className="p-3">Associated Diagram Image</th>
                    <th className="p-3">Product Title (SEO)</th>
                    <th className="p-3">Meta Short Description</th>
                    <th className="p-3 w-28 text-center">Long Desc</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/80">
                  {filteredItems.map((item, idx) => {
                    const itemKey = `${item.part_no}_${idx}`;
                    const isExpanded = expandedItemKey === itemKey;

                    return (
                      <React.Fragment key={itemKey}>
                        <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors">
                          {/* Ref & Fig */}
                          <td className="p-3 text-center">
                            <span className="inline-block px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-900 font-mono font-bold text-[11px] text-zinc-600 dark:text-zinc-400">
                              #{item.ref_no || '-'}
                            </span>
                            <div className="text-[10px] text-zinc-400 mt-0.5">Fig {item.fig_no}</div>
                          </td>

                          {/* Part No & Description */}
                          <td className="p-3">
                            <div className="font-bold text-zinc-900 dark:text-white font-mono text-xs">
                              {item.part_no}
                            </div>
                            <div className="text-[11px] text-zinc-500 font-mono">
                              Clean: <span className="text-zinc-700 dark:text-zinc-300">{item.clean_part_no}</span>
                            </div>
                            <div className="text-xs text-zinc-800 dark:text-zinc-200 font-medium mt-0.5">
                              {item.description}
                            </div>
                            {item.remarks && (
                              <div className="text-[10px] text-zinc-400 italic">Note: {item.remarks}</div>
                            )}
                          </td>

                          {/* Diagram Image */}
                          <td className="p-3">
                            <div className="flex items-center gap-1.5">
                              <ImageIcon className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                              <span className="font-mono text-[11px] font-semibold text-zinc-800 dark:text-zinc-200 truncate max-w-[180px]" title={item.image_filename}>
                                {item.image_filename}
                              </span>
                            </div>
                            <div className="text-[10px] text-zinc-400 mt-0.5">
                              {item.fig_name} (Page {item.page})
                            </div>
                          </td>

                          {/* Product Title */}
                          <td className="p-3 max-w-xs">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs font-semibold text-zinc-900 dark:text-white line-clamp-2">
                                {item.product_title}
                              </p>
                              <button
                                onClick={() => copyToClipboard(item.product_title, `title_${itemKey}`)}
                                title="Copy Title"
                                className="p-1 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer shrink-0"
                              >
                                {copiedId === `title_${itemKey}` ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                            <span className="text-[10px] font-mono text-zinc-400">
                              {item.product_title.length} chars
                            </span>
                          </td>

                          {/* Meta Short Description */}
                          <td className="p-3 max-w-sm">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2">
                                {item.meta_short_description}
                              </p>
                              <button
                                onClick={() =>
                                  copyToClipboard(item.meta_short_description, `short_${itemKey}`)
                                }
                                title="Copy Short Description"
                                className="p-1 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer shrink-0"
                              >
                                {copiedId === `short_${itemKey}` ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                            <span className="text-[10px] font-mono text-zinc-400">
                              {item.meta_short_description.length} chars (SERP snippet)
                            </span>
                          </td>

                          {/* Long Desc Toggle */}
                          <td className="p-3 text-center">
                            <button
                              onClick={() => setExpandedItemKey(isExpanded ? null : itemKey)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-[11px] font-semibold border border-zinc-200 dark:border-zinc-800 transition-colors cursor-pointer"
                            >
                              {isExpanded ? (
                                <>
                                  Close <ChevronUp className="w-3 h-3" />
                                </>
                              ) : (
                                <>
                                  Preview <ChevronDown className="w-3 h-3" />
                                </>
                              )}
                            </button>
                          </td>
                        </tr>

                        {/* Expanded Long Description Row */}
                        {isExpanded && (
                          <tr className="bg-zinc-50 dark:bg-zinc-900/60 border-y border-zinc-200 dark:border-zinc-800">
                            <td colSpan={6} className="p-4 sm:p-6 space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold font-mono text-zinc-900 dark:text-white uppercase tracking-wider">
                                  Structured Long Description (Product Body)
                                </span>
                                <button
                                  onClick={() =>
                                    copyToClipboard(item.meta_long_description, `long_${itemKey}`)
                                  }
                                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-black text-white dark:bg-white dark:text-black text-xs font-bold transition-all active:scale-95 cursor-pointer"
                                >
                                  {copiedId === `long_${itemKey}` ? (
                                    <>
                                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                                      Copied HTML!
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3.5 h-3.5" />
                                      Copy Description
                                    </>
                                  )}
                                </button>
                              </div>

                              {/* Formatted Preview Box */}
                              <div className="p-4 rounded-xl bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-700 dark:text-zinc-300 font-sans space-y-2 prose prose-xs dark:prose-invert max-w-none">
                                {item.meta_long_description.startsWith('<') ? (
                                  <div
                                    dangerouslySetInnerHTML={{ __html: item.meta_long_description }}
                                  />
                                ) : (
                                  <pre className="whitespace-pre-wrap font-mono text-xs">
                                    {item.meta_long_description}
                                  </pre>
                                )}
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
