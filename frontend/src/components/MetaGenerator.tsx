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
  Sparkles,
  Zap,
  AlertCircle,
  Columns,
} from 'lucide-react';
import type { PartRow, PartMetadataItem } from '../types';

const PROMPT_PRESETS = [
  {
    label: '🌟 OEM Durability',
    prompt: 'Emphasize genuine factory OEM specifications, strict automotive quality testing, high heat resistance, and IndiaSpare verified fitment.',
  },
  {
    label: '🚀 Performance & Longevity',
    prompt: 'Highlight optimum engine efficiency, zero vibration, seamless mechanical compatibility, long-term road reliability, and IndiaSpare authenticity.',
  },
  {
    label: '🛡️ Warranty & Safe Packaging',
    prompt: 'Focus on 100% genuine replacement guarantee, damage-free protective packaging, verified vehicle fitment, and IndiaSpare customer support.',
  },
  {
    label: '🛒 eCommerce Conversion',
    prompt: 'Write in an energetic, persuasive, high-converting eCommerce style encouraging two-wheeler riders to upgrade with genuine parts from IndiaSpare.',
  },
  {
    label: '🧩 Include Child Cells',
    prompt: 'Generate authentic descriptions for all parts including child cells and components with guaranteed IndiaSpare OEM fitment.',
  },
];

interface MetaGeneratorProps {
  initialRows?: PartRow[];
  initialFigures?: Array<{ fig_no: string; fig_name: string; first_page?: number }>;
  modelColumns?: string[];
  initialFilename?: string;
  jobId?: string;
}

export const MetaGenerator: React.FC<MetaGeneratorProps> = ({
  initialRows = [],
  initialFigures = [],
  modelColumns = [],
  initialFilename = 'Catalogue',
  jobId,
}) => {
  const [rows, setRows] = useState<PartRow[]>(initialRows);
  const [figures, setFigures] = useState<Array<{ fig_no: string; fig_name: string; first_page?: number }>>(
    initialFigures
  );
  const [models, setModels] = useState<string[]>(modelColumns);
  const [filename, setFilename] = useState<string>(initialFilename);

  // Sync state if incoming props change (e.g. navigated from AutoPipeline or new PDF uploaded)
  useEffect(() => {
    if (initialRows && initialRows.length > 0) {
      setRows(initialRows);
    }
  }, [initialRows]);

  useEffect(() => {
    if (initialFigures && initialFigures.length > 0) {
      setFigures(initialFigures);
    }
  }, [initialFigures]);

  useEffect(() => {
    if (modelColumns && modelColumns.length > 0) {
      setModels(modelColumns);
      setModelCode(modelColumns[0] || '');
    }
  }, [modelColumns]);

  useEffect(() => {
    if (initialFilename) {
      setFilename(initialFilename);
    }
  }, [initialFilename]);

  const [isLoadingSample, setIsLoadingSample] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'combined' | 'extracted' | 'seo'>('combined');

  // Auto-load pre-extracted catalogue data if no catalogue was provided so extracted data is visible immediately before user uploads PDF
  useEffect(() => {
    if (
      (!initialRows || initialRows.length === 0) &&
      (!initialFigures || initialFigures.length === 0) &&
      !jobId &&
      rows.length === 0
    ) {
      setIsLoadingSample(true);
      fetch('/api/meta/sample')
        .then((res) => {
          if (!res.ok) throw new Error('Sample fetch failed');
          return res.json();
        })
        .then((data) => {
          if (data.rows && data.rows.length > 0) {
            setRows(data.rows);
            if (data.figures) setFigures(data.figures);
            if (data.model_columns) {
              setModels(data.model_columns);
              setModelCode(data.model_columns[0] || '');
            }
            if (data.filename) setFilename(data.filename.replace(/\.pdf$/i, ''));
          }
        })
        .catch((err) => {
          console.warn('Could not load sample catalogue data:', err);
        })
        .finally(() => {
          setIsLoadingSample(false);
        });
    }
  }, []);

  // User Requested Text Boxes:
  // 1. Brand (default YAMAHA)
  // 2. Model Code (auto-detected e.g. BGPK, editable)
  // 3. Model (label Model, blank by default - typed after model code)
  // 4. Series (label Series, default "series")
  const [brand, setBrand] = useState<string>('YAMAHA');
  const [modelCode, setModelCode] = useState<string>('');
  const [model, setModel] = useState<string>('');
  const [series, setSeries] = useState<string>('series');

  // Parts Filter Scope: 'all' (current extracted Excel - default) | 'parent' (main assemblies) | 'child' (components)
  const [partsScope, setPartsScope] = useState<'all' | 'parent' | 'child'>('all');

  // Google AI Studio (Gemini) State (prompt box open and ready by default)
  const [aiMode, setAiMode] = useState<boolean>(true);
  const [geminiApiKey, setGeminiApiKey] = useState<string>(() => {
    return localStorage.getItem('converter_gemini_api_key') || '';
  });
  const [aiPrompt, setAiPrompt] = useState<string>(
    'Generate authentic OEM eCommerce descriptions emphasizing factory precision, durability, heat resistance, direct vehicle fitment, and IndiaSpare verified quality.'
  );
  const [aiError, setAiError] = useState<string | null>(null);

  // Generation tracking for uniqueness & user feedback on every click/prompt
  const [generationCount, setGenerationCount] = useState<number>(0);
  const [lastGeneratedPrompt, setLastGeneratedPrompt] = useState<string>('');
  const [generationNotice, setGenerationNotice] = useState<string | null>(null);

  // Column Selection State for Custom Export
  const [showColumnSelector, setShowColumnSelector] = useState<boolean>(false);

  // Base and dynamic model export columns: Extracted Catalogue Columns on LEFT, then SEO Metadata Columns on RIGHT
  const allAvailableColumns = useMemo(() => {
    const catalogueCols = [
      'Page',
      'Fig No.',
      'Catalog Name',
      'Catalogue Code',
      'Ref No.',
      'Part No.',
      'Clean Part No.',
      'Description',
    ];
    if (models && models.length > 0) {
      models.forEach((m) => {
        const qCol = `Qty (${m})`;
        if (!catalogueCols.includes(qCol)) catalogueCols.push(qCol);
      });
    }
    if (!catalogueCols.includes('Remarks')) catalogueCols.push('Remarks');

    const metaCols = [
      'Brand',
      'Model Code',
      'Model',
      'Series',
      'Pic',
      'Short Description',
      'Meta Title',
      'Meta Description (151-158 Chars)',
      'Meta Desc Chars',
      'Product Description (120-140 Words)',
      'Product Desc Words',
      'AI Dual-Record Analysis',
    ];

    return [...catalogueCols, ...metaCols];
  }, [models]);

  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);

  // Initialize and sync selectedColumns with available columns in exact order
  useEffect(() => {
    setSelectedColumns((prev) => {
      if (prev.length === 0) return allAvailableColumns;
      const prevSet = new Set(prev);
      const valid = allAvailableColumns.filter((c) => prevSet.has(c));
      return valid.length > 0 ? valid : allAvailableColumns;
    });
  }, [allAvailableColumns]);

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
  const isModelFilled = model.trim().length > 0;

  // Load initial metadata with blank descriptions when inputs or catalogue change
  useEffect(() => {
    if ((rows && rows.length > 0) || (figures && figures.length > 0) || jobId) {
      generateMetadata(false);
    }
  }, [rows, figures, brand, modelCode, model, series, partsScope, resolvedModelCode, jobId]);

  const generateMetadata = async (overrideAiMode?: boolean) => {
    if ((!rows || rows.length === 0) && (!figures || figures.length === 0) && !jobId) return;
    const isAi = overrideAiMode !== undefined ? overrideAiMode : aiMode;
    setIsGenerating(true);
    setAiError(null);
    if (isAi) {
      setGenerationNotice(null);
    }
    const nextGenCount = isAi ? generationCount + 1 : generationCount;
    const runId = isAi ? `run_${Date.now()}_${Math.random().toString(36).substring(2, 8)}` : undefined;

    try {
      const payload: any = {
        job_id: jobId || undefined,
        rows: rows && rows.length > 0 ? rows : undefined,
        figures: figures && figures.length > 0 ? figures : undefined,
        model_columns: models,
        brand: brand.trim() || 'YAMAHA',
        model: model.trim().toUpperCase(),
        series: series.trim() || 'series',
        model_code: activeModelCode,
        parts_scope: 'all',
        main_parts_only: false,
        ai_mode: isAi,
        ai_prompt: isAi ? aiPrompt.trim() : undefined,
        gemini_api_key: isAi && geminiApiKey.trim() ? geminiApiKey.trim() : undefined,
        blank_descriptions: !isAi,
        generation_id: runId,
      };

      const res = await fetch('/api/meta/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || 'Failed to generate metadata');
      }

      const data = await res.json();
      setMetadataItems(data.items || []);
      if (isAi) {
        setGenerationCount(nextGenCount);
        setLastGeneratedPrompt(aiPrompt.trim());
        setGenerationNotice(`Run #${nextGenCount} Complete: Fresh unique AI descriptions generated for ${data.items?.length || 0} parts with your prompt directives applied.`);
      }
    } catch (err: any) {
      console.error('Metadata generation error:', err);
      setAiError(err.message || 'Generation failed');
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

  const cleanPartNo = (p: string) => {
    if (!p) return '';
    const cleaned = p.replace(/[\s\-\u2010\u2011\u2012\u2013\u2014\u2015]/g, '');
    return cleaned.length === 10 ? `${cleaned}00` : cleaned;
  };

  const downloadExport = async (format: 'xlsx' | 'csv') => {
    if (!metadataItems || metadataItems.length === 0) return;
    if (!isModelFilled) {
      alert('Model is mandatory! Please fill in the Model text box before exporting.');
      return;
    }
    if (selectedColumns.length === 0) {
      alert('Please select at least one column to export using the Columns button.');
      return;
    }
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
          model_columns: models,
          raw_rows: rows,
          selected_columns: selectedColumns,
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

  // Filtered metadata items for Combined and SEO views
  const filteredItems = useMemo(() => {
    return metadataItems.filter((item) => {
      // 1. Filter by Parts Scope (according to currently extracted Excel)
      if (partsScope === 'parent' && item.is_parent === false) {
        return false;
      }
      if (partsScope === 'child' && item.is_parent !== false) {
        return false;
      }

      // 2. Filter by figure assembly selection
      const pName = item.part_name || item.parent_fig_name || item.fig_name || item.description || '';
      if (
        selectedFigure !== 'ALL' &&
        pName !== selectedFigure &&
        item.parent_fig_name !== selectedFigure &&
        item.fig_name !== selectedFigure
      ) {
        return false;
      }

      // 3. Search filter
      if (!searchTerm) return true;
      const q = searchTerm.toLowerCase();
      return (
        pName.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q)) ||
        (item.product_title && item.product_title.toLowerCase().includes(q)) ||
        (item.meta_title && item.meta_title.toLowerCase().includes(q)) ||
        (item.image_filename && item.image_filename.toLowerCase().includes(q)) ||
        String(item.fig_no || item.parent_fig_no || '').toLowerCase().includes(q) ||
        (item.ref_no && String(item.ref_no).toLowerCase().includes(q)) ||
        (item.part_no && item.part_no.toLowerCase().includes(q)) ||
        (item.clean_part_no && item.clean_part_no.toLowerCase().includes(q)) ||
        (item.catalogue_code && item.catalogue_code.toLowerCase().includes(q)) ||
        (item.remarks && item.remarks.toLowerCase().includes(q))
      );
    });
  }, [metadataItems, partsScope, selectedFigure, searchTerm]);

  // Filtered raw extracted catalogue rows for Extracted view
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (selectedFigure !== 'ALL' && r.fig_name !== selectedFigure) {
        return false;
      }
      if (!searchTerm) return true;
      const q = searchTerm.toLowerCase();
      return (
        (r.part_no && r.part_no.toLowerCase().includes(q)) ||
        (r.description && r.description.toLowerCase().includes(q)) ||
        (r.fig_name && r.fig_name.toLowerCase().includes(q)) ||
        (r.remarks && r.remarks.toLowerCase().includes(q)) ||
        String(r.fig_no || '').includes(q) ||
        String(r.ref_no || '').includes(q)
      );
    });
  }, [rows, selectedFigure, searchTerm]);

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
              Extracts main parts with Short Description and Meta Title. Meta Description &amp; Product Description remain blank during scan. Gemini AI analyzes both Extracted Parts Catalogue Excel records and SEO Metadata records before generating descriptions. Enter prompt below, click "Generate with Gemini AI", then Export Excel.
            </p>
          </div>

          {/* Action Bar */}
          <div className="flex flex-wrap items-center gap-2">
            {metadataItems.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setShowColumnSelector(!showColumnSelector)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-full font-semibold text-xs border transition-all font-mono cursor-pointer ${
                    showColumnSelector
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-800'
                  }`}
                  title="Select or unselect columns for Excel & CSV export"
                >
                  <Columns className="w-3.5 h-3.5" />
                  <span>Columns ({selectedColumns.length}/{allAvailableColumns.length})</span>
                  {showColumnSelector ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
                <button
                  onClick={() => downloadExport('xlsx')}
                  disabled={isExporting || !isModelFilled || selectedColumns.length === 0}
                  title={
                    !isModelFilled
                      ? 'Model is mandatory: please fill the Model text box below to enable Excel export'
                      : selectedColumns.length === 0
                      ? 'Please select at least 1 column using the Columns selector'
                      : 'Export Excel (.xlsx)'
                  }
                  className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full font-bold text-xs uppercase tracking-wider transition-all shadow-xs active:scale-95 ${
                    isModelFilled && selectedColumns.length > 0
                      ? 'bg-black hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-200 dark:text-black cursor-pointer'
                      : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Export Excel (.xlsx)
                </button>
                <button
                  onClick={() => downloadExport('csv')}
                  disabled={isExporting || !isModelFilled || selectedColumns.length === 0}
                  title={
                    !isModelFilled
                      ? 'Model is mandatory: please fill the Model text box below to enable CSV export'
                      : selectedColumns.length === 0
                      ? 'Please select at least 1 column using the Columns selector'
                      : 'Export CSV'
                  }
                  className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full font-semibold text-xs border transition-all font-mono ${
                    isModelFilled && selectedColumns.length > 0
                      ? 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-800 cursor-pointer'
                      : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-400 dark:text-zinc-600 border-zinc-200 dark:border-zinc-800 cursor-not-allowed'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  Export CSV
                </button>
                {!isModelFilled && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-xs font-semibold">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Fill Model to enable Export</span>
                  </div>
                )}
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

        {/* Expandable Column Selection Checkbox Drawer */}
        {showColumnSelector && (
          <div className="p-4 sm:p-5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 space-y-4 shadow-sm animate-in slide-in-from-top-2 duration-150">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-white font-mono flex items-center gap-2">
                  <Columns className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  Export Column Selection Checkboxes
                </h4>
                <p className="text-[11px] text-zinc-500 mt-0.5 font-mono">
                  Select or unselect columns to customize which columns appear in the exported Excel (.xlsx) and CSV spreadsheets.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setSelectedColumns([...allAvailableColumns])}
                  className="px-2.5 py-1 rounded-lg bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-[11px] font-mono font-semibold transition-colors cursor-pointer"
                >
                  Select All ({allAvailableColumns.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedColumns([])}
                  className="px-2.5 py-1 rounded-lg bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-[11px] font-mono font-semibold transition-colors cursor-pointer"
                >
                  Deselect All
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedColumns([...allAvailableColumns])}
                  className="px-2.5 py-1 rounded-lg bg-blue-100 hover:bg-blue-200 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-[11px] font-mono font-semibold transition-colors cursor-pointer"
                >
                  Reset Default
                </button>
              </div>
            </div>

            {/* Checkbox Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {allAvailableColumns.map((colName) => {
                const isChecked = selectedColumns.includes(colName);
                return (
                  <label
                    key={colName}
                    className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-mono transition-all cursor-pointer select-none ${
                      isChecked
                        ? 'bg-blue-50/80 dark:bg-blue-950/30 border-blue-300 dark:border-blue-800 text-blue-950 dark:text-blue-200 font-semibold shadow-xs'
                        : 'bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-500 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedColumns((prev) => [...prev, colName]);
                        } else {
                          setSelectedColumns((prev) => prev.filter((c) => c !== colName));
                        }
                      }}
                      className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                    />
                    <span className="truncate" title={colName}>{colName}</span>
                  </label>
                );
              })}
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 pt-1">
              <span>
                Selected: <strong className="text-zinc-900 dark:text-white font-bold">{selectedColumns.length}</strong> of {allAvailableColumns.length} columns
              </span>
              {selectedColumns.length === 0 && (
                <span className="text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Select at least 1 column to export
                </span>
              )}
            </div>
          </div>
        )}

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

          {/* Model Box (typed after Model Code, mandatory per user rule) */}
          <div>
            <label className="block text-xs font-mono uppercase font-semibold mb-1.5 flex items-center justify-between">
              <span className={`flex items-center gap-1.5 ${!isModelFilled ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-zinc-600 dark:text-zinc-400'}`}>
                <span>Model</span>
                <span className="text-rose-500 font-bold text-sm leading-none">*</span>
                <span
                  className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded font-bold ${
                    !isModelFilled
                      ? 'bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 border border-rose-300 dark:border-rose-800'
                      : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800'
                  }`}
                >
                  {!isModelFilled ? 'Mandatory' : 'Filled ✓'}
                </span>
              </span>
            </label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value.toUpperCase())}
              placeholder="Enter Model (e.g. FZ-S, R15) - Mandatory *"
              className={`w-full px-3.5 py-2 rounded-xl text-xs font-semibold uppercase transition-all ${
                !isModelFilled
                  ? 'bg-rose-50/70 dark:bg-rose-950/25 border-2 border-rose-500 dark:border-rose-500 text-rose-950 dark:text-rose-200 placeholder:text-rose-400/80 focus:outline-none focus:border-rose-600 focus:ring-2 focus:ring-rose-500/20 shadow-xs'
                  : 'bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-600'
              }`}
            />
            {!isModelFilled && (
              <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium mt-1.5 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Model is mandatory to enable Excel &amp; CSV export</span>
              </p>
            )}
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

          {/* Scope Toggle: Redesigned according to currently extracted Excel */}
          <div className="sm:col-span-2 lg:col-span-1">
            <label className="block text-xs font-mono uppercase text-zinc-500 font-semibold mb-1.5 flex items-center justify-between">
              <span>Parts Filter Scope</span>
              <span className="text-[10px] text-zinc-400 font-normal">Excel Filter</span>
            </label>
            <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setPartsScope('all')}
                className={`flex-1 py-1.5 px-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer truncate ${
                  partsScope === 'all'
                    ? 'bg-black text-white dark:bg-white dark:text-black shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white'
                }`}
                title="All extracted parts (Parent + Child cells aligned exactly as in Excel)"
              >
                All Parts
              </button>
              <button
                type="button"
                onClick={() => setPartsScope('parent')}
                className={`flex-1 py-1.5 px-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer truncate ${
                  partsScope === 'parent'
                    ? 'bg-black text-white dark:bg-white dark:text-black shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white'
                }`}
                title="Only major assemblies (Parent cells with Fig No & Catalogue Code)"
              >
                Parents
              </button>
              <button
                type="button"
                onClick={() => setPartsScope('child')}
                className={`flex-1 py-1.5 px-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer truncate ${
                  partsScope === 'child'
                    ? 'bg-black text-white dark:bg-white dark:text-black shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white'
                }`}
                title="Only component child parts (bolts, nuts, gaskets under assemblies)"
              >
                Children
              </button>
            </div>
          </div>
        </div>

        {/* Generator Engine Mode Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-2 rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setAiMode(false);
                setAiError(null);
              }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                !aiMode
                  ? 'bg-black text-white dark:bg-white dark:text-black shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              Rule-Based Mode (Instant)
            </button>
            <button
              type="button"
              onClick={() => setAiMode(true)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                aiMode
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-300" />
              Google AI Studio (Gemini)
            </button>
          </div>
          <div className="text-[11px] text-zinc-500 font-mono pr-2">
            {aiMode ? '✨ Unique AI Prompts + Strict Constraint Enforcement' : '⚡ Algorithmic templates & strict bounding'}
          </div>
        </div>

        {/* Google AI Studio Configuration Panel */}
        {aiMode && (
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-b from-purple-50/60 to-white dark:from-purple-950/20 dark:to-zinc-900/60 border border-purple-200 dark:border-purple-800/60 space-y-4 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded-lg bg-purple-600 text-white">
                  <Sparkles className="w-3.5 h-3.5" />
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-purple-900 dark:text-purple-300 font-mono">
                  Google AI Studio (Gemini 2.5 Flash) Prompt & Settings
                </span>
              </div>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-600 dark:text-purple-400 hover:underline"
              >
                Get API Key at aistudio.google.com &rarr;
              </a>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* API Key Box */}
              <div>
                <label className="block text-xs font-mono uppercase text-zinc-600 dark:text-zinc-400 font-semibold mb-1.5 flex items-center justify-between">
                  <span>Google AI Studio API Key</span>
                  <span className="text-[10px] text-zinc-400 normal-case">Saved locally in browser</span>
                </label>
                <div>
                  <input
                    type="password"
                    value={geminiApiKey}
                    onChange={(e) => {
                      setGeminiApiKey(e.target.value);
                      localStorage.setItem('converter_gemini_api_key', e.target.value);
                    }}
                    placeholder="AIzaSy... (or leave blank if GEMINI_API_KEY is configured on server)"
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:border-purple-500 font-mono placeholder:font-sans placeholder:text-zinc-400"
                  />
                </div>
              </div>

              {/* Quick Presets */}
              <div>
                <label className="block text-xs font-mono uppercase text-zinc-600 dark:text-zinc-400 font-semibold mb-1.5">
                  Prompt Presets
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {PROMPT_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setAiPrompt(p.prompt)}
                      className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-purple-400 hover:text-purple-600 dark:hover:text-purple-300 transition-colors cursor-pointer"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Custom Prompt Textarea */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-mono uppercase text-zinc-600 dark:text-zinc-400 font-semibold">
                  Custom Prompt / Copywriting Directives
                </label>
                {lastGeneratedPrompt && aiPrompt.trim() !== lastGeneratedPrompt && (
                  <span className="text-[11px] font-mono text-purple-600 dark:text-purple-400 font-semibold flex items-center gap-1 animate-in fade-in">
                    <Sparkles className="w-3 h-3 text-purple-500" />
                    New prompt directives entered
                  </span>
                )}
              </div>
              <textarea
                rows={2}
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Enter custom prompt for tone, USPs, fitment guarantees, or target audience..."
                className="w-full px-3.5 py-2 rounded-xl text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:border-purple-500 placeholder:text-zinc-400 font-sans"
              />
              {lastGeneratedPrompt && aiPrompt.trim() !== lastGeneratedPrompt && (
                <p className="text-[11px] text-purple-600 dark:text-purple-400 font-mono mt-1 flex items-center gap-1">
                  <span>&bull; Ready to generate fresh descriptions tailored to your updated prompt. Click below to run.</span>
                </p>
              )}
            </div>

            {/* Generate with AI Button & Run Status */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="text-[11px] text-zinc-500 font-mono space-y-0.5">
                  <div>Two-Step AI Protocol: Analyzes Extracted Catalogue &amp; SEO Excel records first • Enforces 151–158 chars (Meta Desc) • 120–140 words (Prod Desc) • zero commas • IndiaSpare.</div>
                  <div className="text-purple-700 dark:text-purple-300 font-medium">💡 Child Cells Rule: Child cell descriptions remain blank unless your prompt references child cells (use &quot;🧩 Include Child Cells&quot; preset).</div>
                </div>
                {generationCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/80 border border-purple-300 dark:border-purple-800 text-[11px] font-mono text-purple-700 dark:text-purple-300 font-bold shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Run #{generationCount} Active
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => generateMetadata(true)}
                disabled={isGenerating}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-wider shadow-sm transition-all active:scale-95 cursor-pointer disabled:opacity-50 shrink-0"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Generating Run #{generationCount + 1}...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    {generationCount === 0
                      ? 'Generate with Gemini AI'
                      : `Generate Unique AI Copy (Run #${generationCount + 1})`}
                  </>
                )}
              </button>
            </div>

            {/* Success Notice Banner */}
            {generationNotice && !aiError && (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-center justify-between gap-2 shadow-xs animate-in fade-in duration-200">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span><strong>{generationNotice}</strong></span>
                </div>
                <button
                  type="button"
                  onClick={() => setGenerationNotice(null)}
                  className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 text-xs font-mono px-1.5 py-0.5 rounded cursor-pointer"
                  title="Dismiss"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Error Banner */}
            {aiError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Google AI Studio Notice: </span>
                  {aiError}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Live Rules Legend (per user prompt) */}
        <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 text-[11px] font-mono grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <span className="text-zinc-400 uppercase font-semibold block mb-0.5">Short Description (Parent Only, IN CAPS):</span>
            <span className="font-bold text-zinc-800 dark:text-zinc-200">
              {brand || 'YAMAHA'} {activeModelCode} {model ? `${model.toUpperCase()} ${series ? `${series.toUpperCase()} ` : ''}` : (series && series.toLowerCase() !== 'series' ? `${series.toUpperCase()} ` : '')}[PARENT ASSEMBLY NAME]
            </span>
          </div>
          <div>
            <span className="text-zinc-400 uppercase font-semibold block mb-0.5">Meta Title (Parent Only, Separate):</span>
            <span className="font-bold text-zinc-800 dark:text-zinc-200">
              {brand ? brand.charAt(0).toUpperCase() + brand.slice(1).toLowerCase() : 'Yamaha'} {model ? `${model} ${series ? `${series} ` : ''}` : (series && series.toLowerCase() !== 'series' ? `${series} ` : '')}{activeModelCode} [Parent Assembly Name] | IndiaSpare
            </span>
          </div>
          <div>
            <span className="text-zinc-400 uppercase font-semibold block mb-0.5">Child Rows Hierarchy Rule:</span>
            <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              Child rows of Short Description &amp; Meta Title remain strictly blank
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoadingSample ? (
        <div className="p-12 text-center rounded-3xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-3">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600 dark:text-blue-400" />
          <h3 className="text-sm font-bold text-zinc-900 dark:text-white font-sans">
            Loading Extracted Parts Catalogue...
          </h3>
          <p className="text-xs text-zinc-500 font-mono">
            Fetching extracted Excel parts and assemblies before PDF upload.
          </p>
        </div>
      ) : rows.length === 0 && figures.length === 0 && metadataItems.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center mx-auto text-zinc-700 dark:text-zinc-300">
            <Tag className="w-6 h-6" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-base font-bold text-zinc-900 dark:text-white font-sans">
              No Parts Catalogue Loaded
            </h3>
            <p className="text-xs text-zinc-500">
              Upload a Yamaha parts catalogue PDF or load sample catalogue data to inspect extracted parts and generate SEO metadata.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-black text-white dark:bg-white dark:text-black font-bold text-xs uppercase tracking-wider shadow-sm hover:opacity-90 active:scale-95 cursor-pointer"
            >
              <UploadCloud className="w-4 h-4" />
              Upload PDF File
            </button>
            <button
              onClick={() => {
                setIsLoadingSample(true);
                fetch('/api/meta/sample')
                  .then((r) => r.json())
                  .then((d) => {
                    if (d.rows) setRows(d.rows);
                    if (d.figures) setFigures(d.figures);
                    if (d.model_columns) setModels(d.model_columns);
                    if (d.filename) setFilename(d.filename.replace(/\.pdf$/i, ''));
                  })
                  .finally(() => setIsLoadingSample(false));
              }}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-bold text-xs uppercase tracking-wider border border-zinc-200 dark:border-zinc-800 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              Load Sample Catalogue
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Active Extracted Catalogue Banner */}
          <div className="p-3.5 px-4 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 border border-blue-200 dark:border-blue-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 text-blue-950 dark:text-blue-200">
              <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <div>
                <span className="font-bold">Extracted Catalogue Data Active: </span>
                <span className="font-mono font-semibold">{rows.length} parts</span> across{' '}
                <span className="font-mono font-semibold">{figures.length || uniqueFigures.length} assemblies</span>{' '}
                ({filename}).
                <span className="hidden md:inline text-zinc-600 dark:text-zinc-400 ml-1">
                  • Both extracted catalogue columns and SEO metadata columns are exported to Excel &amp; CSV.
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-mono font-semibold hover:bg-blue-50 dark:hover:bg-blue-950/60 cursor-pointer shadow-xs"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                Upload New PDF
              </button>
            </div>
          </div>

          {/* Quick Metrics & Filter Bar with View Mode Switcher */}
          <div className="p-4 rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
            {/* View Mode Switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-100 dark:border-zinc-900">
              <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 flex-wrap">
                <button
                  type="button"
                  onClick={() => setViewMode('combined')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                    viewMode === 'combined'
                      ? 'bg-white dark:bg-zinc-800 text-black dark:text-white shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white'
                  }`}
                >
                  Combined View (Extracted + SEO)
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('extracted')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    viewMode === 'extracted'
                      ? 'bg-white dark:bg-zinc-800 text-black dark:text-white shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white'
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  Extracted Parts Catalogue ({rows.length})
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('seo')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                    viewMode === 'seo'
                      ? 'bg-white dark:bg-zinc-800 text-black dark:text-white shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white'
                  }`}
                >
                  SEO Metadata View
                </button>
              </div>

              <div className="text-xs font-mono text-zinc-500">
                {viewMode === 'extracted' ? (
                  <>
                    Showing <strong className="text-zinc-900 dark:text-white">{filteredRows.length}</strong> of{' '}
                    <strong className="text-zinc-900 dark:text-white">{rows.length}</strong> catalogue parts
                  </>
                ) : (
                  <>
                    Showing <strong className="text-zinc-900 dark:text-white">{filteredItems.length}</strong> of{' '}
                    <strong className="text-zinc-900 dark:text-white">{metadataItems.length}</strong>{' '}
                    {partsScope === 'parent' ? 'parent assemblies' : partsScope === 'child' ? 'child parts' : 'parts'}
                  </>
                )}
              </div>
            </div>

            {/* Search and Figure Filter */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-80">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search part no, description, fig no, remarks..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none font-medium"
                />
              </div>

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
            </div>
          </div>

          {/* VIEW MODE 1: COMBINED TABLE (Extracted Catalogue + SEO Columns) */}
          {viewMode === 'combined' && (
            <div className="rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden animate-in fade-in duration-150">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 font-semibold border-b border-zinc-200 dark:border-zinc-800">
                    <tr>
                      <th className="p-2.5 w-12 text-center">Fig</th>
                      <th className="p-2.5 w-12 text-center">Ref</th>
                      <th className="p-2.5">Part No.</th>
                      <th className="p-2.5">Description</th>
                      <th className="p-2.5">Catalogue Code</th>
                      {models.map((m) => (
                        <th key={m} className="p-2.5 font-mono text-center text-zinc-900 dark:text-white">
                          Qty ({m})
                        </th>
                      ))}
                      <th className="p-2.5">Remarks</th>
                      <th className="p-2.5">Pic</th>
                      <th className="p-2.5">Short Description</th>
                      <th className="p-2.5">Meta Title</th>
                      <th className="p-2.5 w-24 text-center">Meta Desc</th>
                      <th className="p-2.5 w-24 text-center">Product Desc</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/80">
                    {filteredItems.map((item, idx) => {
                      const itemKey = `${item.fig_no}_${item.part_name || item.description}_${idx}`;
                      const isExpandedMeta = expandedItemKey === `meta_${itemKey}`;
                      const isExpandedProd = expandedItemKey === `prod_${itemKey}`;
                      const isExpandedAnalysis = expandedItemKey === `analysis_${itemKey}`;
                      const metaDesc = item.meta_description || item.meta_long_description || '';
                      const metaChars = item.meta_desc_chars || metaDesc.length;
                      const prodDesc = item.product_description || '';
                      const prodWords = item.product_desc_words || prodDesc.split(/\s+/).filter(Boolean).length;

                      return (
                        <React.Fragment key={itemKey}>
                          <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors">
                            {/* Fig */}
                            <td className="p-2.5 text-center">
                              {item.is_parent !== false ? (
                                <>
                                  <span className="inline-block px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-900 font-mono font-bold text-[11px] text-zinc-700 dark:text-zinc-300">
                                    #{item.fig_no || item.parent_fig_no || '-'}
                                  </span>
                                  <div className="text-[10px] text-zinc-400 mt-0.5">p.{item.page}</div>
                                </>
                              ) : (
                                <span className="text-zinc-300 dark:text-zinc-700 font-mono text-[11px]" title={`Child component of Fig #${item.parent_fig_no || ''}`}>&bull;</span>
                              )}
                            </td>

                            {/* Ref */}
                            <td className="p-2.5 text-center font-mono text-zinc-500 font-semibold">
                              {item.ref_no || '-'}
                            </td>

                            {/* Part No */}
                            <td className="p-2.5">
                              <div className="font-mono font-bold text-zinc-900 dark:text-white">
                                {item.part_no || '-'}
                              </div>
                              {item.clean_part_no && item.clean_part_no !== item.part_no && (
                                <div className="text-[10px] font-mono text-zinc-400">
                                  Clean: {item.clean_part_no}
                                </div>
                              )}
                            </td>

                            {/* Description / Part Name */}
                            <td className="p-2.5 font-semibold text-zinc-800 dark:text-zinc-200">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {item.is_parent !== false ? (
                                  <>
                                    <span>{item.part_name || item.catalog_name || item.description}</span>
                                    <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                                      Parent
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    {partsScope === 'child' ? (
                                      <>
                                        <span>{item.raw_description || item.component_description || item.description || 'Child Part'}</span>
                                        <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-mono font-normal bg-zinc-100 dark:bg-zinc-900 text-zinc-400">
                                          Child
                                        </span>
                                      </>
                                    ) : (
                                      <span className="text-[10px] text-zinc-400 font-mono italic" title="Child cell of Description column kept blank per rule. Select Children filter to view.">
                                        Blank (Child)
                                      </span>
                                    )}
                                  </>
                                )}
                                {item.ai_generated && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                                    <Sparkles className="w-2.5 h-2.5" /> {generationCount > 0 ? `AI Run #${generationCount}` : 'AI'}
                                  </span>
                                )}
                                {item.ai_analysis && (
                                  <button
                                    type="button"
                                    onClick={() => setExpandedItemKey(isExpandedAnalysis ? null : `analysis_${itemKey}`)}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-colors cursor-pointer"
                                    title="View Gemini AI Dual-Record Analysis"
                                  >
                                    <Sparkles className="w-2.5 h-2.5" />
                                    <span>Analysis</span>
                                    {isExpandedAnalysis ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                                  </button>
                                )}
                              </div>
                            </td>

                            {/* Catalogue Code */}
                            <td className="p-2.5">
                              {item.is_parent !== false ? (
                                <span className="font-mono text-[10px] font-bold text-zinc-700 dark:text-zinc-300">
                                  {item.catalogue_code || `YAM_${activeModelCode}_${(item.part_name || item.catalog_name || item.description || 'PARTS').replace(/[^A-Za-z0-9]+/g, ' ').trim().toUpperCase()}`}
                                </span>
                              ) : (
                                <span className="text-zinc-300 dark:text-zinc-700 font-mono text-[10px]">-</span>
                              )}
                            </td>

                            {/* Model Quantities */}
                            {models.map((m) => (
                              <td key={m} className="p-2.5 font-mono text-center font-bold text-zinc-800 dark:text-zinc-200">
                                {item[m] || '-'}
                              </td>
                            ))}

                            {/* Remarks */}
                            <td className="p-2.5 text-zinc-500 max-w-[120px] truncate" title={item.remarks}>
                              {item.remarks || '-'}
                            </td>

                            {/* Diagram Image Pic */}
                            <td className="p-2.5">
                              <div className="flex items-center gap-1">
                                <ImageIcon className="w-3 h-3 text-zinc-400 shrink-0" />
                                <span className="font-mono text-[10px] font-semibold text-zinc-700 dark:text-zinc-300 truncate max-w-[120px]" title={item.image_filename}>
                                  {item.image_filename}
                                </span>
                              </div>
                            </td>

                            {/* Short Description */}
                            <td className="p-2.5 max-w-[160px]">
                              {item.product_title ? (
                                <div className="flex items-start justify-between gap-1">
                                  <p className="text-[11px] font-bold text-zinc-900 dark:text-white line-clamp-2 uppercase font-mono">
                                    {item.product_title}
                                  </p>
                                  <button
                                    onClick={() => copyToClipboard(item.product_title, `prod_title_${itemKey}`)}
                                    title="Copy Short Description"
                                    className="p-1 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer shrink-0"
                                  >
                                    {copiedId === `prod_title_${itemKey}` ? (
                                      <Check className="w-3 h-3 text-emerald-500" />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                  </button>
                                </div>
                              ) : (
                                <span className="text-[10px] text-zinc-400 font-mono italic" title="Child rows of short description remain blank per rule">
                                  {item.is_parent === false ? 'Blank (Child)' : '-'}
                                </span>
                              )}
                            </td>

                            {/* Meta Title */}
                            <td className="p-2.5 max-w-[160px]">
                              {item.meta_title ? (
                                <div className="flex items-start justify-between gap-1">
                                  <p className="text-[11px] font-semibold text-zinc-800 dark:text-zinc-200 line-clamp-2">
                                    {item.meta_title}
                                  </p>
                                  <button
                                    onClick={() => copyToClipboard(item.meta_title || '', `meta_title_${itemKey}`)}
                                    title="Copy Meta Title"
                                    className="p-1 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer shrink-0"
                                  >
                                    {copiedId === `meta_title_${itemKey}` ? (
                                      <Check className="w-3 h-3 text-emerald-500" />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                  </button>
                                </div>
                              ) : (
                                <span className="text-[10px] text-zinc-400 font-mono italic" title="Child rows of meta title remain blank per rule">
                                  {item.is_parent === false ? 'Blank (Child)' : '-'}
                                </span>
                              )}
                            </td>

                            {/* Meta Description */}
                            <td className="p-2.5 text-center">
                              {metaDesc ? (
                                <div className="space-y-0.5">
                                  <span className="inline-block px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                    {metaChars}c
                                  </span>
                                  <div>
                                    <button
                                      onClick={() => setExpandedItemKey(isExpandedMeta ? null : `meta_${itemKey}`)}
                                      className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
                                    >
                                      {isExpandedMeta ? <>Hide <ChevronUp className="w-3 h-3" /></> : <>View <ChevronDown className="w-3 h-3" /></>}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-[10px] text-zinc-400 font-mono italic" title={item.is_parent === false ? "Child cell descriptions left blank unless prompt references child cells" : undefined}>
                                  {item.is_parent === false ? 'Blank (Child)' : 'Blank'}
                                </span>
                              )}
                            </td>

                            {/* Product Description */}
                            <td className="p-2.5 text-center">
                              {prodDesc ? (
                                <div className="space-y-0.5">
                                  <span className="inline-block px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                                    {prodWords}w
                                  </span>
                                  <div>
                                    <button
                                      onClick={() => setExpandedItemKey(isExpandedProd ? null : `prod_${itemKey}`)}
                                      className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
                                    >
                                      {isExpandedProd ? <>Hide <ChevronUp className="w-3 h-3" /></> : <>View <ChevronDown className="w-3 h-3" /></>}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-[10px] text-zinc-400 font-mono italic" title={item.is_parent === false ? "Child cell descriptions left blank unless prompt references child cells" : undefined}>
                                  {item.is_parent === false ? 'Blank (Child)' : 'Blank'}
                                </span>
                              )}
                            </td>
                          </tr>

                          {/* Expanded AI Dual-Record Analysis */}
                          {isExpandedAnalysis && (
                            <tr className="bg-indigo-50/50 dark:bg-indigo-950/30 border-y border-indigo-200 dark:border-indigo-800">
                              <td colSpan={11 + models.length} className="p-3.5 space-y-2">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold font-mono text-indigo-900 dark:text-indigo-200 uppercase tracking-wider flex items-center gap-1.5">
                                      <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                                      Gemini AI Dual-Record Analysis (Extracted Parts Catalogue + SEO Records)
                                    </span>
                                  </div>
                                  <button
                                    onClick={() => copyToClipboard(item.ai_analysis || '', `analysis_${itemKey}`)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all active:scale-95 cursor-pointer"
                                  >
                                    {copiedId === `analysis_${itemKey}` ? <><Check className="w-3.5 h-3.5 text-emerald-400" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy Analysis</>}
                                  </button>
                                </div>
                                <div className="p-3 rounded-xl bg-white dark:bg-black border border-indigo-200 dark:border-indigo-800 text-xs font-sans leading-relaxed text-indigo-950 dark:text-indigo-200">
                                  {item.ai_analysis}
                                </div>
                              </td>
                            </tr>
                          )}

                          {/* Expanded Meta Description */}
                          {isExpandedMeta && (
                            <tr className="bg-zinc-50 dark:bg-zinc-900/60 border-y border-zinc-200 dark:border-zinc-800">
                              <td colSpan={11 + models.length} className="p-3.5 space-y-2">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold font-mono text-zinc-900 dark:text-white uppercase tracking-wider">
                                      Meta Description (151–158 Chars without Caps, No Commas)
                                    </span>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                                      {metaChars} Characters
                                    </span>
                                  </div>
                                  <button
                                    onClick={() => copyToClipboard(metaDesc, `meta_desc_${itemKey}`)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-black text-white dark:bg-white dark:text-black text-xs font-bold transition-all active:scale-95 cursor-pointer"
                                  >
                                    {copiedId === `meta_desc_${itemKey}` ? <><Check className="w-3.5 h-3.5 text-emerald-400" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy Meta Desc</>}
                                  </button>
                                </div>
                                {item.ai_analysis && (
                                  <div className="p-2.5 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-900 text-xs text-indigo-950 dark:text-indigo-200">
                                    <span className="font-bold font-mono text-[10px] uppercase text-indigo-700 dark:text-indigo-400 block mb-0.5">
                                      🔍 Gemini AI Dual-Record Analysis Grounding:
                                    </span>
                                    <span>{item.ai_analysis}</span>
                                  </div>
                                )}
                                <div className="p-3 rounded-xl bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 text-xs font-sans text-zinc-800 dark:text-zinc-200">
                                  {metaDesc}
                                </div>
                              </td>
                            </tr>
                          )}

                          {/* Expanded Product Description */}
                          {isExpandedProd && (
                            <tr className="bg-zinc-50 dark:bg-zinc-900/60 border-y border-zinc-200 dark:border-zinc-800">
                              <td colSpan={11 + models.length} className="p-3.5 space-y-2">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold font-mono text-zinc-900 dark:text-white uppercase tracking-wider">
                                      Product Description (120–140 Words, No Commas)
                                    </span>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                                      {prodWords} Words
                                    </span>
                                  </div>
                                  <button
                                    onClick={() => copyToClipboard(prodDesc, `prod_desc_${itemKey}`)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-black text-white dark:bg-white dark:text-black text-xs font-bold transition-all active:scale-95 cursor-pointer"
                                  >
                                    {copiedId === `prod_desc_${itemKey}` ? <><Check className="w-3.5 h-3.5 text-emerald-400" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy Product Desc</>}
                                  </button>
                                </div>
                                {item.ai_analysis && (
                                  <div className="p-2.5 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-900 text-xs text-indigo-950 dark:text-indigo-200">
                                    <span className="font-bold font-mono text-[10px] uppercase text-indigo-700 dark:text-indigo-400 block mb-0.5">
                                      🔍 Gemini AI Dual-Record Analysis Grounding:
                                    </span>
                                    <span>{item.ai_analysis}</span>
                                  </div>
                                )}
                                <div className="p-3 rounded-xl bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 text-xs font-sans leading-relaxed text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">
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
          )}

          {/* VIEW MODE 2: EXTRACTED PARTS CATALOGUE (Pure Extracted Excel Table View) */}
          {viewMode === 'extracted' && (
            <div className="rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden animate-in fade-in duration-150">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 font-semibold border-b border-zinc-200 dark:border-zinc-800">
                    <tr>
                      <th className="p-2.5 w-14 text-center">Fig No.</th>
                      <th className="p-2.5">Fig Name</th>
                      <th className="p-2.5">Catalogue Code</th>
                      <th className="p-2.5 w-14 text-center">Ref No.</th>
                      <th className="p-2.5 font-mono">Part No.</th>
                      <th className="p-2.5 font-mono">Clean Part No.</th>
                      <th className="p-2.5">Description</th>
                      {models.map((m) => (
                        <th key={m} className="p-2.5 font-mono text-center text-zinc-900 dark:text-white">
                          {m}
                        </th>
                      ))}
                      <th className="p-2.5">Remarks</th>
                      <th className="p-2.5 w-14 text-center">Page</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/80">
                    {filteredRows.map((r, idx) => {
                      const isFirstOfFig = idx === 0 || (filteredRows[idx - 1].fig_no !== r.fig_no) || (filteredRows[idx - 1].fig_name !== r.fig_name);
                      const cleanFig = (r.fig_name || 'PARTS').replace(/[^A-Za-z0-9]+/g, ' ').trim().toUpperCase();
                      const catCode = r.catalogue_code || `YAM_${activeModelCode}_${cleanFig}`;

                      return (
                        <tr key={idx} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                          <td className="p-2.5 text-center font-bold text-zinc-600 dark:text-zinc-400 font-mono">
                            {isFirstOfFig ? (r.fig_no || '-') : ''}
                          </td>
                          <td className="p-2.5 font-medium text-zinc-800 dark:text-zinc-200">
                            {isFirstOfFig ? (r.fig_name || '-') : ''}
                          </td>
                          <td className="p-2.5 font-mono font-bold text-zinc-700 dark:text-zinc-300">
                            {isFirstOfFig ? catCode : ''}
                          </td>
                          <td className="p-2.5 text-center font-mono text-zinc-500 font-semibold">
                            {r.ref_no || '-'}
                          </td>
                          <td className="p-2.5 font-mono font-bold text-zinc-900 dark:text-white">
                            {r.part_no || '-'}
                          </td>
                          <td className="p-2.5 font-mono text-zinc-500">
                            {cleanPartNo(r.part_no) || '-'}
                          </td>
                          <td className="p-2.5 font-medium text-zinc-800 dark:text-zinc-200">
                            {r.description || '-'}
                          </td>
                          {models.map((m) => (
                            <td key={m} className="p-2.5 font-mono text-center font-bold text-zinc-900 dark:text-white">
                              {r[m] || '-'}
                            </td>
                          ))}
                          <td className="p-2.5 text-zinc-500">
                            {r.remarks || '-'}
                          </td>
                          <td className="p-2.5 text-center font-mono text-zinc-400">
                            {r.page || 1}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* VIEW MODE 3: SEO METADATA FOCUSED VIEW */}
          {viewMode === 'seo' && (
            <div className="rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden animate-in fade-in duration-150">
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
                      const isExpandedAnalysis = expandedItemKey === `analysis_${itemKey}`;
                      const metaDesc = item.meta_description || item.meta_long_description || '';
                      const metaChars = item.meta_desc_chars || metaDesc.length;
                      const prodDesc = item.product_description || '';
                      const prodWords = item.product_desc_words || prodDesc.split(/\s+/).filter(Boolean).length;

                      return (
                        <React.Fragment key={itemKey}>
                          <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors">
                            {/* Fig No */}
                            <td className="p-3 text-center">
                              {item.is_parent !== false ? (
                                <>
                                  <span className="inline-block px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-900 font-mono font-bold text-[11px] text-zinc-700 dark:text-zinc-300">
                                    #{item.fig_no || item.parent_fig_no || '-'}
                                  </span>
                                  <div className="text-[10px] text-zinc-400 mt-0.5">p.{item.page}</div>
                                </>
                              ) : (
                                <span className="text-zinc-300 dark:text-zinc-700 font-mono text-[11px]" title={`Child component of Fig #${item.parent_fig_no || ''}`}>&bull;</span>
                              )}
                            </td>

                            {/* Main Part Name */}
                            <td className="p-3">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-zinc-900 dark:text-white font-mono text-xs uppercase">
                                  {item.is_parent !== false ? (item.part_name || item.catalog_name || item.description) : item.description}
                                </span>
                                {item.is_parent !== false ? (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                                    Parent
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-normal bg-zinc-100 dark:bg-zinc-900 text-zinc-400">
                                    Child
                                  </span>
                                )}
                                {item.ai_generated && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                                    <Sparkles className="w-2.5 h-2.5" /> {generationCount > 0 ? `AI Run #${generationCount}` : 'AI'}
                                  </span>
                                )}
                                {item.ai_analysis && (
                                  <button
                                    type="button"
                                    onClick={() => setExpandedItemKey(isExpandedAnalysis ? null : `analysis_${itemKey}`)}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-colors cursor-pointer"
                                    title="View Gemini AI Dual-Record Analysis"
                                  >
                                    <Sparkles className="w-2.5 h-2.5" />
                                    <span>Analysis</span>
                                    {isExpandedAnalysis ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                                  </button>
                                )}
                              </div>
                              {item.is_parent !== false ? (
                                <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                                  Model: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{item.model_code}</span>
                                  {item.model ? ` • ${item.model}` : ''}
                                  {item.series ? ` • ${item.series}` : ''}
                                </div>
                              ) : (
                                <div className="text-[10px] text-zinc-400 font-mono mt-0.5">
                                  Ref #{item.ref_no || '-'} • Part #{item.part_no || '-'}
                                  {item.parent_fig_name ? ` • Assembly: ${item.parent_fig_name}` : ''}
                                </div>
                              )}
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
                              {item.product_title ? (
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
                              ) : (
                                <span className="text-[11px] text-zinc-400 font-mono italic" title="Child rows of short description remain blank per rule">
                                  {item.is_parent === false ? 'Blank (Child)' : '-'}
                                </span>
                              )}
                            </td>

                            {/* Meta Title (Separate, Title Case, no commas) */}
                            <td className="p-3 max-w-xs">
                              {item.meta_title ? (
                                <div className="flex items-start justify-between gap-1.5">
                                  <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 line-clamp-2">
                                    {item.meta_title}
                                  </p>
                                  <button
                                    onClick={() => copyToClipboard(item.meta_title || '', `meta_title_${itemKey}`)}
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
                              ) : (
                                <span className="text-[11px] text-zinc-400 font-mono italic" title="Child rows of meta title remain blank per rule">
                                  {item.is_parent === false ? 'Blank (Child)' : '-'}
                                </span>
                              )}
                            </td>

                            {/* Meta Description */}
                            <td className="p-3 text-center">
                              {metaDesc ? (
                                <div className="space-y-1">
                                  <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                    {metaChars} chars
                                  </span>
                                  <div>
                                    <button
                                      onClick={() => setExpandedItemKey(isExpandedMeta ? null : `meta_${itemKey}`)}
                                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
                                    >
                                      {isExpandedMeta ? <>Hide <ChevronUp className="w-3 h-3" /></> : <>View <ChevronDown className="w-3 h-3" /></>}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-[11px] text-zinc-400 font-mono italic" title={item.is_parent === false ? "Child cell descriptions left blank unless prompt references child cells" : undefined}>
                                  {item.is_parent === false ? 'Blank (Child)' : 'Blank'}
                                </span>
                              )}
                            </td>

                            {/* Product Description */}
                            <td className="p-3 text-center">
                              {prodDesc ? (
                                <div className="space-y-1">
                                  <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                                    {prodWords} words
                                  </span>
                                  <div>
                                    <button
                                      onClick={() => setExpandedItemKey(isExpandedProd ? null : `prod_${itemKey}`)}
                                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
                                    >
                                      {isExpandedProd ? <>Hide <ChevronUp className="w-3 h-3" /></> : <>View <ChevronDown className="w-3 h-3" /></>}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-[11px] text-zinc-400 font-mono italic" title={item.is_parent === false ? "Child cell descriptions left blank unless prompt references child cells" : undefined}>
                                  {item.is_parent === false ? 'Blank (Child)' : 'Blank'}
                                </span>
                              )}
                            </td>
                          </tr>

                          {/* Expanded AI Dual-Record Analysis */}
                          {isExpandedAnalysis && (
                            <tr className="bg-indigo-50/50 dark:bg-indigo-950/30 border-y border-indigo-200 dark:border-indigo-800">
                              <td colSpan={7} className="p-4 sm:p-5 space-y-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold font-mono text-indigo-900 dark:text-indigo-200 uppercase tracking-wider flex items-center gap-1.5">
                                      <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                                      Gemini AI Dual-Record Analysis (Extracted Parts Catalogue + SEO Records)
                                    </span>
                                  </div>
                                  <button
                                    onClick={() => copyToClipboard(item.ai_analysis || '', `analysis_${itemKey}`)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all active:scale-95 cursor-pointer"
                                  >
                                    {copiedId === `analysis_${itemKey}` ? <><Check className="w-3.5 h-3.5 text-emerald-400" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy Analysis</>}
                                  </button>
                                </div>
                                <div className="p-3.5 rounded-xl bg-white dark:bg-black border border-indigo-200 dark:border-indigo-800 text-xs font-sans text-indigo-950 dark:text-indigo-200 leading-relaxed">
                                  {item.ai_analysis}
                                </div>
                              </td>
                            </tr>
                          )}

                          {/* Expanded Meta Description */}
                          {isExpandedMeta && (
                            <tr className="bg-zinc-50 dark:bg-zinc-900/60 border-y border-zinc-200 dark:border-zinc-800">
                              <td colSpan={7} className="p-4 sm:p-5 space-y-3">
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
                                    onClick={() => copyToClipboard(metaDesc, `meta_desc_${itemKey}`)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-black text-white dark:bg-white dark:text-black text-xs font-bold transition-all active:scale-95 cursor-pointer"
                                  >
                                    {copiedId === `meta_desc_${itemKey}` ? <><Check className="w-3.5 h-3.5 text-emerald-400" /> Copied Meta Desc!</> : <><Copy className="w-3.5 h-3.5" /> Copy Meta Desc</>}
                                  </button>
                                </div>
                                {item.ai_analysis && (
                                  <div className="p-2.5 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-900 text-xs text-indigo-950 dark:text-indigo-200">
                                    <span className="font-bold font-mono text-[10px] uppercase text-indigo-700 dark:text-indigo-400 block mb-0.5">
                                      🔍 Gemini AI Dual-Record Analysis Grounding:
                                    </span>
                                    <span>{item.ai_analysis}</span>
                                  </div>
                                )}
                                <div className="p-3.5 rounded-xl bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 text-xs font-sans text-zinc-800 dark:text-zinc-200">
                                  {metaDesc}
                                </div>
                              </td>
                            </tr>
                          )}

                          {/* Expanded Product Description */}
                          {isExpandedProd && (
                            <tr className="bg-zinc-50 dark:bg-zinc-900/60 border-y border-zinc-200 dark:border-zinc-800">
                              <td colSpan={7} className="p-4 sm:p-5 space-y-3">
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
                                    onClick={() => copyToClipboard(prodDesc, `prod_desc_${itemKey}`)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-black text-white dark:bg-white dark:text-black text-xs font-bold transition-all active:scale-95 cursor-pointer"
                                  >
                                    {copiedId === `prod_desc_${itemKey}` ? <><Check className="w-3.5 h-3.5 text-emerald-400" /> Copied Product Desc!</> : <><Copy className="w-3.5 h-3.5" /> Copy Product Desc</>}
                                  </button>
                                </div>
                                {item.ai_analysis && (
                                  <div className="p-2.5 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-900 text-xs text-indigo-950 dark:text-indigo-200">
                                    <span className="font-bold font-mono text-[10px] uppercase text-indigo-700 dark:text-indigo-400 block mb-0.5">
                                      🔍 Gemini AI Dual-Record Analysis Grounding:
                                    </span>
                                    <span>{item.ai_analysis}</span>
                                  </div>
                                )}
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
          )}
        </div>
      )}
    </div>
  );
};
