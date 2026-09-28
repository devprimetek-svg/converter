import React, { useState, useMemo, useCallback } from 'react';
import {
  Download,
  Search,
  RotateCcw,
  CheckCircle2,
  FileText,
  Layers,
  Tags,
  Filter,
  Sparkles,
  Bike,
  Pencil,
  AlertCircle,
} from 'lucide-react';
import type { ExtractionStatus } from '../types';
import { PartsTable } from './PartsTable';
import { extractRawModelName, buildComposedModelName, detectBrand } from '../utils/modelNameHelper';

interface ResultsDashboardProps {
  status: ExtractionStatus;
  onReset: () => void;
  /** rows param: rows with edited model names merged in */
  onExport: (cleanParts: boolean, targetModel?: string, rows?: any[]) => Promise<void>;
  isExporting: boolean;
}

export const ResultsDashboard: React.FC<ResultsDashboardProps> = ({
  status,
  onReset,
  onExport,
  isExporting,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFigure, setSelectedFigure] = useState<string>('ALL');
  const [selectedModel, setSelectedModel] = useState<string>('ALL');
  const [cleanParts, setCleanParts] = useState<boolean>(false);
  const [exportingModel, setExportingModel] = useState<string | null>(null);
  /** Map of figKey → user-edited model name. Export is only enabled once this has entries. */
  const [editedModelNames, setEditedModelNames] = useState<Record<string, string>>({});
  const [globalModelInput, setGlobalModelInput] = useState<string>('');

  const { rows = [], model_columns = [], figures = [], total_pages = 0 } = status;

  const hasEdits = Object.keys(editedModelNames).length > 0;

  /** Merge edited model names back into every row before export */
  const rowsWithEdits = useMemo(() => {
    if (!hasEdits) return rows;
    return rows.map((row) => {
      const isParent = (row as any).is_parent || String(row.ref_no).trim() === '1';
      if (!isParent) {
        return { ...row, model_name: '' };
      }
      const figKey = `${(row as any).parent_fig_no || row.fig_no}__${(row as any).parent_fig_name || row.fig_name}`;
      const figModelCode = (row as any).model_code || model_columns[0] || 'MODEL';
      const figName = (row as any).parent_fig_name || row.fig_name || 'PARTS';
      const editedVal = editedModelNames[figKey];
      if (editedVal !== undefined) {
        return { ...row, model_name: buildComposedModelName(editedVal, figModelCode, figName) };
      }
      if (globalModelInput.trim()) {
        const rawGlobal = extractRawModelName(globalModelInput);
        const globalBrand = detectBrand(globalModelInput);
        return { ...row, model_name: buildComposedModelName(rawGlobal, figModelCode, figName, globalBrand) };
      }
      return row;
    });
  }, [rows, editedModelNames, hasEdits, model_columns, globalModelInput]);

  const handleModelNameEdit = useCallback((figKey: string, newValue: string) => {
    setEditedModelNames((prev) => ({ ...prev, [figKey]: newValue }));
  }, []);

  const handleApplyGlobalModelName = () => {
    const rawGlobal = extractRawModelName(globalModelInput);
    if (!rawGlobal || !rows) return;
    const globalBrand = detectBrand(globalModelInput);
    const newEdits: Record<string, string> = { ...editedModelNames };
    rows.forEach((row) => {
      const isParent = (row as any).is_parent || String(row.ref_no).trim() === '1';
      if (isParent) {
        const figKey = `${(row as any).parent_fig_no || row.fig_no}__${(row as any).parent_fig_name || row.fig_name}`;
        const figModelCode = (row as any).model_code || model_columns[0] || 'MODEL';
        const figName = (row as any).parent_fig_name || row.fig_name || 'PARTS';
        newEdits[figKey] = buildComposedModelName(rawGlobal, figModelCode, figName, globalBrand);
      }
    });
    setEditedModelNames(newEdits);
  };

  // Compute part count per model code
  const modelPartCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const model of model_columns) {
      counts[model] = rows.filter((r) => {
        const val = String(r[model] ?? '').trim();
        return (
          val !== '' &&
          val !== '-' &&
          val !== '0' &&
          val !== '*' &&
          val.toLowerCase() !== 'none' &&
          val.toLowerCase() !== 'null'
        );
      }).length;
    }
    return counts;
  }, [rows, model_columns]);

  // Filter rows (from rowsWithEdits so search sees updated model_name too)
  const filteredRows = useMemo(() => {
    return rowsWithEdits.filter((row) => {
      if (selectedFigure !== 'ALL' && row.fig_no !== selectedFigure) return false;

      if (selectedModel !== 'ALL') {
        const val = String(row[selectedModel] ?? '').trim();
        if (!val || val === '-' || val === '0' || val === '*' ||
          val.toLowerCase() === 'none' || val.toLowerCase() === 'null') return false;
      }

      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        row.part_no.toLowerCase().includes(term) ||
        row.description.toLowerCase().includes(term) ||
        row.remarks.toLowerCase().includes(term) ||
        row.fig_name.toLowerCase().includes(term) ||
        String(row.ref_no).toLowerCase().includes(term)
      );
    });
  }, [rowsWithEdits, selectedFigure, selectedModel, searchTerm]);

  const handleModelExport = async (model?: string) => {
    if (!hasEdits) return; // Export disabled until at least one model name is edited
    let target: string | undefined;
    if (model === 'ALL') {
      target = undefined;
    } else if (model !== undefined) {
      target = model;
    } else {
      target = selectedModel !== 'ALL' ? selectedModel : undefined;
    }
    setExportingModel(target || 'ALL');
    try {
      await onExport(cleanParts, target, rowsWithEdits);
    } finally {
      setExportingModel(null);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      {/* KPI Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Pages Processed</p>
            <h4 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-0.5">{total_pages}</h4>
          </div>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Figures Found</p>
            <h4 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-0.5">{figures.length}</h4>
          </div>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-100 dark:border-emerald-900 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Parts Rows</p>
            <h4 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-0.5">{rows.length.toLocaleString()}</h4>
          </div>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-100 dark:border-amber-900 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
            <Tags className="w-6 h-6" />
          </div>
          <div className="overflow-hidden">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Model Codes ({model_columns.length})</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {model_columns.length > 0 ? (
                model_columns.map((col) => (
                  <span key={col} className="inline-block px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 text-xs font-bold font-mono">{col}</span>
                ))
              ) : (
                <span className="text-xs text-slate-400 font-mono">None</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Control Bar */}
      <div className="p-4 sm:p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm space-y-4">
        <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search part #, description, remarks..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              />
            </div>

            <div className="relative min-w-[200px]">
              <Filter className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={selectedFigure}
                onChange={(e) => setSelectedFigure(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all truncate"
              >
                <option value="ALL">All Figures ({figures.length})</option>
                {figures.map((fig) => (
                  <option key={fig.fig_no} value={fig.fig_no}>FIG. {fig.fig_no} - {fig.fig_name}</option>
                ))}
              </select>
            </div>

            {model_columns.length >= 2 && (
              <div className="relative min-w-[170px]">
                <Bike className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 text-sm rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all truncate"
                >
                  <option value="ALL">All Models ({rows.length})</option>
                  {model_columns.map((model) => (
                    <option key={model} value={model}>Model {model} ({modelPartCounts[model] || 0} parts)</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 self-start xl:self-auto">
            <button
              onClick={onReset}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-semibold transition-colors"
              title="Upload another PDF catalogue"
            >
              <RotateCcw className="w-4 h-4" />
              Upload New
            </button>

            {model_columns.length < 2 && (
              <button
                onClick={() => handleModelExport()}
                disabled={isExporting || rows.length === 0 || !hasEdits}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-bold shadow-md shadow-blue-700/20 disabled:opacity-50 disabled:pointer-events-none transition-all duration-150"
                title={!hasEdits ? 'Edit at least one Model Name cell in the table below to enable export' : 'Export to Excel'}
              >
                <Download className="w-4 h-4" />
                {isExporting ? 'Exporting...' : 'Export to Excel'}
              </button>
            )}

            {model_columns.length >= 2 && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleModelExport('ALL')}
                  disabled={isExporting || rows.length === 0 || !hasEdits}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white text-xs sm:text-sm font-bold shadow-sm disabled:opacity-50 disabled:pointer-events-none transition-all"
                  title={!hasEdits ? 'Edit at least one Model Name cell in the table below to enable export' : 'Export complete combined catalogue with all model columns'}
                >
                  <Download className="w-4 h-4" />
                  {isExporting && exportingModel === 'ALL' ? 'Exporting...' : 'Export All Models'}
                </button>

                {model_columns.map((model) => (
                  <button
                    key={model}
                    onClick={() => handleModelExport(model)}
                    disabled={isExporting || (modelPartCounts[model] || 0) === 0 || !hasEdits}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold shadow-sm shadow-blue-600/20 disabled:opacity-50 disabled:pointer-events-none transition-all"
                    title={!hasEdits ? 'Edit at least one Model Name cell in the table below to enable export' : `Export only parts applicable to model ${model}`}
                  >
                    <Download className="w-3.5 h-3.5" />
                    {isExporting && exportingModel === model ? (
                      <span>Exporting...</span>
                    ) : (
                      <>
                        <span>Export {model}</span>
                        <span className="ml-0.5 px-1.5 py-0.2 rounded-md bg-blue-800/80 text-[11px] font-mono">
                          {modelPartCounts[model] || 0}
                        </span>
                      </>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Status bar: export gate hint + clean parts toggle */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div className="relative">
              <input
                type="checkbox"
                checked={cleanParts}
                onChange={(e) => setCleanParts(e.target.checked)}
                className="sr-only"
              />
              <div className={`block w-11 h-6 rounded-full transition-colors ${cleanParts ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'}`} />
              <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${cleanParts ? 'transform translate-x-5' : ''}`} />
            </div>
            <div className="text-xs sm:text-sm">
              <span className="font-bold text-slate-800 dark:text-slate-200">Clean Part No.</span>
              <span className="ml-1 text-slate-500 dark:text-slate-400">(strips dashes; adds '00' only if cleaned is 10 chars — leaves 12-char painted unchanged)</span>
            </div>
          </label>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {hasEdits ? (
              <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {Object.keys(editedModelNames).length} Model{Object.keys(editedModelNames).length !== 1 ? 's' : ''} edited — Export enabled
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 rounded-full border border-amber-200 dark:border-amber-800">
                <AlertCircle className="w-3.5 h-3.5" />
                Click any Model cell below or enter model above — then Export unlocks
                <Pencil className="w-3 h-3" />
              </span>
            )}
            {cleanParts && (
              <span className="inline-flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400">
                <Sparkles className="w-3.5 h-3.5" />
                Live Clean View Active
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Batch Model Input Bar */}
      <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <input
            type="text"
            value={globalModelInput}
            onChange={(e) => setGlobalModelInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleApplyGlobalModelName();
            }}
            placeholder='Enter Model for all figures (e.g. FASCINO 125CC DISK, FZ-S FI) — format: BRAND CODE "MODEL" Series FIG apply automatically...'
            className="flex-1 px-3.5 py-2 text-xs font-mono font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={handleApplyGlobalModelName}
            disabled={!globalModelInput.trim()}
            className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold whitespace-nowrap disabled:opacity-40 transition-colors cursor-pointer"
            title="Apply this model to all figure parent rows"
          >
            Apply to All Figures
          </button>
        </div>
      </div>

      {/* Parts Table with inline Model Name editing */}
      <PartsTable
        rows={filteredRows}
        modelColumns={selectedModel === 'ALL' ? model_columns : [selectedModel]}
        cleanParts={cleanParts}
        editedModelNames={editedModelNames}
        onModelNameEdit={handleModelNameEdit}
      />
    </div>
  );
};
