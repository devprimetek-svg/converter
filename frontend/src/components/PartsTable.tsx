import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Pencil,
  Check,
  AlertTriangle,
  Trash2,
  Plus,
  Search,
  X,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import type { PartRow } from '../types';
import { cleanPartNumber } from '../utils/cleanPartNo';
import { cleanRemarks } from '../utils/cleanRemarks';
import { cleanDescription } from '../utils/cleanDescription';
import { extractRawModelName, buildComposedModelName, detectBrand } from '../utils/modelNameHelper';

export interface PartsTableProps {
  rows: PartRow[];
  modelColumns: string[];
  cleanParts: boolean;
  /** Map of fig_key → edited model name. Only parent rows are editable. */
  editedModelNames?: Record<string, string>;
  /** Called when user commits an edited model name for a figure. */
  onModelNameEdit?: (figKey: string, newValue: string) => void;
  /** Map of fig_key → edited pic path. Only parent rows are editable. */
  editedPicPaths?: Record<string, string>;
  /** Called when user commits an edited pic path for a figure. */
  onPicPathEdit?: (figKey: string, newValue: string) => void;
  /** Map of cellKey (figKey__slot_N) → edited remark flag value. */
  editedRemarkFlags?: Record<string, string>;
  /** Called when user commits an edited remark flag for a cell. */
  onRemarkFlagEdit?: (cellKey: string, newValue: string) => void;
  /** Optional callback when rows are updated */
  onRowsUpdate?: (updatedRows: PartRow[]) => void;
  /** Optional handler to trigger Interactive Hotspot diagram modal */
  onOpenHotspotDiagram?: (figNo?: string) => void;
}

type SortField =
  | 'page'
  | 'fig_no'
  | 'item_group'
  | 'show_in_website'
  | 'ranking'
  | 'fig_name'
  | 'catalogue_code'
  | 'model_name'
  | 'pic'
  | 'pic_path'
  | 'ref_no'
  | 'part_no'
  | 'description'
  | 'remarks'
  | 'remark_flag'
  | string;

type SortDirection = 'asc' | 'desc';

type ValidationFilter = 'ALL' | 'ISSUES' | 'PART_NO' | 'DUPLICATE_REF' | 'DESC' | 'QTY';

interface RowValidationInfo {
  hasDuplicateRef: boolean;
  hasEmptyPartNo: boolean;
  hasInvalidPartNo: boolean;
  hasMissingDesc: boolean;
  hasZeroQty: boolean;
  hasAnyIssue: boolean;
  issuesSummary: string[];
}

export const PartsTable: React.FC<PartsTableProps> = ({
  rows,
  modelColumns,
  cleanParts,
  editedModelNames = {},
  onModelNameEdit,
  editedPicPaths = {},
  onPicPathEdit,
  editedRemarkFlags = {},
  onRemarkFlagEdit,
  onRowsUpdate,
  onOpenHotspotDiagram: _onOpenHotspotDiagram,
}) => {
  const [localRows, setLocalRows] = useState<PartRow[]>(rows);

  useEffect(() => {
    setLocalRows(rows);
  }, [rows]);

  const [sortField, setSortField] = useState<SortField>('page');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(-1);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Search & Validation Filter States
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [validationFilter, setValidationFilter] = useState<ValidationFilter>('ALL');

  /** figKey of the cell currently being edited (null = none) */
  const [editingFigKey, setEditingFigKey] = useState<string | null>(null);
  /** Draft value while editing */
  const [draftValue, setDraftValue] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  /** figKey of the pic_path cell currently being edited (null = none) */
  const [editingPicPathFigKey, setEditingPicPathFigKey] = useState<string | null>(null);
  /** Draft value while editing pic_path */
  const [draftPicPath, setDraftPicPath] = useState<string>('');
  const picPathInputRef = useRef<HTMLInputElement>(null);

  /** cellKey (figKey__slot_N) of the remark_flag cell currently being edited (null = none) */
  const [editingRemarkFlagKey, setEditingRemarkFlagKey] = useState<string | null>(null);
  /** Draft value while editing remark_flag */
  const [draftRemarkFlag, setDraftRemarkFlag] = useState<string>('');
  const remarkFlagInputRef = useRef<HTMLInputElement>(null);

  // Generic cell inline editing state: { rowIndex, field }
  const [editingCell, setEditingCell] = useState<{ originalIndex: number; field: string } | null>(null);
  const [draftCellVal, setDraftCellVal] = useState<string>('');
  const cellInputRef = useRef<HTMLInputElement>(null);

  const startEditing = useCallback((figKey: string, currentRawModel: string) => {
    setEditingFigKey(figKey);
    setDraftValue(currentRawModel);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const commitEdit = useCallback(
    (figKey: string, figModelCode: string, cleanFig: string, brand?: string) => {
      if (onModelNameEdit) {
        const cleanRaw = extractRawModelName(draftValue, figModelCode);
        const b = detectBrand(draftValue, brand || 'YAMAHA');
        const composed = buildComposedModelName(cleanRaw, figModelCode, cleanFig, b);
        onModelNameEdit(figKey, composed);
      }
      setEditingFigKey(null);
    },
    [draftValue, onModelNameEdit]
  );

  const startEditingPicPath = useCallback((figKey: string, currentPicPath: string) => {
    setEditingPicPathFigKey(figKey);
    setDraftPicPath(currentPicPath);
    setTimeout(() => picPathInputRef.current?.focus(), 0);
  }, []);

  const commitPicPathEdit = useCallback(
    (figKey: string) => {
      if (onPicPathEdit) {
        onPicPathEdit(figKey, draftPicPath.trim());
      }
      setEditingPicPathFigKey(null);
    },
    [draftPicPath, onPicPathEdit]
  );

  const startEditingRemarkFlag = useCallback((cellKey: string, currentVal: string) => {
    setEditingRemarkFlagKey(cellKey);
    setDraftRemarkFlag(currentVal);
    setTimeout(() => remarkFlagInputRef.current?.focus(), 0);
  }, []);

  const commitRemarkFlagEdit = useCallback(
    (cellKey: string) => {
      if (onRemarkFlagEdit) {
        onRemarkFlagEdit(cellKey, draftRemarkFlag.trim());
      }
      setEditingRemarkFlagKey(null);
    },
    [draftRemarkFlag, onRemarkFlagEdit]
  );

  // Generic cell editing handlers
  const startCellEdit = useCallback((originalIndex: number, field: string, currentVal: any) => {
    setEditingCell({ originalIndex, field });
    setDraftCellVal(currentVal !== undefined && currentVal !== null ? String(currentVal) : '');
    setTimeout(() => cellInputRef.current?.focus(), 0);
  }, []);

  const commitCellEdit = useCallback(() => {
    if (!editingCell) return;
    const { originalIndex, field } = editingCell;
    const updated = [...localRows];
    if (originalIndex >= 0 && originalIndex < updated.length) {
      const rowToEdit = { ...updated[originalIndex] };
      let finalVal: any = draftCellVal.trim();

      if (field === 'part_no' && cleanParts) {
        finalVal = cleanPartNumber(finalVal);
      }

      (rowToEdit as any)[field] = finalVal;
      updated[originalIndex] = rowToEdit;
      setLocalRows(updated);
      if (onRowsUpdate) {
        onRowsUpdate(updated);
      }
    }
    setEditingCell(null);
  }, [editingCell, draftCellVal, localRows, cleanParts, onRowsUpdate]);

  const handleDeleteRow = useCallback(
    (originalIndex: number) => {
      if (originalIndex < 0 || originalIndex >= localRows.length) return;
      const updated = localRows.filter((_, idx) => idx !== originalIndex);
      setLocalRows(updated);
      if (onRowsUpdate) {
        onRowsUpdate(updated);
      }
    },
    [localRows, onRowsUpdate]
  );

  const handleAddRow = useCallback(() => {
    const lastRow = localRows[localRows.length - 1];
    const newPage = lastRow ? lastRow.page : 1;
    const newFigNo = lastRow ? lastRow.fig_no : '1';
    const newFigName = lastRow ? lastRow.fig_name : 'PARTS';

    const newRow: PartRow = {
      page: newPage,
      fig_no: newFigNo,
      fig_name: newFigName,
      ref_no: String(localRows.length + 1),
      part_no: 'NEW-PART-00',
      description: 'NEW PART DESCRIPTION',
      remarks: '',
    };

    if (modelColumns && modelColumns.length > 0) {
      modelColumns.forEach((m) => {
        (newRow as any)[m] = '1';
      });
    }

    const updated = [...localRows, newRow];
    setLocalRows(updated);
    if (onRowsUpdate) {
      onRowsUpdate(updated);
    }
  }, [localRows, modelColumns, onRowsUpdate]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  // Track figure groups that contain remarks on any records
  const figsWithRemarks = useMemo(() => {
    const set = new Set<string>();
    for (const r of localRows) {
      const rem = cleanRemarks(r.remarks);
      if (rem) {
        const fn = String((r as any).parent_fig_no || r.fig_no || '').trim();
        const fnn = String((r as any).parent_fig_name || r.fig_name || '').trim();
        const k = `${fn}__${fnn}`;
        set.add(k);
      }
    }
    return set;
  }, [localRows]);

  // Real-time Data Quality & Validation Engine
  const rowValidationMap = useMemo(() => {
    const map = new Map<number, RowValidationInfo>();

    // 1. Group rows by figure key to detect duplicate ref numbers within same parent
    const figRefCounts = new Map<string, Map<string, number>>();
    localRows.forEach((r) => {
      const figKey = `${(r as any).parent_fig_no || r.fig_no || ''}__${(r as any).parent_fig_name || r.fig_name || ''}`;
      const ref = String(r.ref_no || '').trim().toUpperCase();
      if (!ref) return;

      if (!figRefCounts.has(figKey)) {
        figRefCounts.set(figKey, new Map<string, number>());
      }
      const refMap = figRefCounts.get(figKey)!;
      refMap.set(ref, (refMap.get(ref) || 0) + 1);
    });

    // 2. Validate each row
    localRows.forEach((r, idx) => {
      const isCustomSection = Boolean((r as any).is_custom_section);
      const figKey = `${(r as any).parent_fig_no || r.fig_no || ''}__${(r as any).parent_fig_name || r.fig_name || ''}`;
      const ref = String(r.ref_no || '').trim().toUpperCase();

      const issuesSummary: string[] = [];

      // Duplicate ref_no under the same parent figure
      const refCount = ref && figRefCounts.get(figKey)?.get(ref) || 0;
      const hasDuplicateRef = !isCustomSection && refCount > 1;
      if (hasDuplicateRef) {
        issuesSummary.push(`Duplicate Ref No. '${r.ref_no}' under Figure ${r.fig_no}`);
      }

      // Empty or invalid Part Number
      const pNo = String(r.part_no || '').trim();
      const hasEmptyPartNo = !isCustomSection && pNo === '';
      const cleanedPNo = cleanPartNumber(pNo);
      const hasInvalidPartNo = !isCustomSection && !hasEmptyPartNo && cleanedPNo.length < 5;
      if (hasEmptyPartNo) {
        issuesSummary.push('Missing Part Number');
      } else if (hasInvalidPartNo) {
        issuesSummary.push(`Part Number too short (${cleanedPNo.length} chars)`);
      }

      // Missing Description
      const desc = String(r.description || '').trim();
      const hasMissingDesc = !isCustomSection && desc === '';
      if (hasMissingDesc) {
        issuesSummary.push('Missing Part Description');
      }

      // Zero or missing Quantities
      let hasZeroQty = false;
      if (!isCustomSection && modelColumns.length > 0) {
        const hasAnyValidQty = modelColumns.some((m) => {
          const val = r[m];
          if (val === undefined || val === null || val === '') return false;
          const strVal = String(val).trim();
          return strVal !== '0' && strVal !== '-';
        });
        hasZeroQty = !hasAnyValidQty;
        if (hasZeroQty) {
          issuesSummary.push('Zero or missing quantity across all model columns');
        }
      }

      const hasAnyIssue =
        hasDuplicateRef ||
        hasEmptyPartNo ||
        hasInvalidPartNo ||
        hasMissingDesc ||
        hasZeroQty;

      map.set(idx, {
        hasDuplicateRef,
        hasEmptyPartNo,
        hasInvalidPartNo,
        hasMissingDesc,
        hasZeroQty,
        hasAnyIssue,
        issuesSummary,
      });
    });

    return map;
  }, [localRows, modelColumns]);

  // Aggregate Quality Statistics
  const qualityStats = useMemo(() => {
    let duplicateRefCount = 0;
    let partNoIssueCount = 0;
    let missingDescCount = 0;
    let zeroQtyCount = 0;
    let totalIssuesCount = 0;

    rowValidationMap.forEach((v) => {
      if (v.hasDuplicateRef) duplicateRefCount++;
      if (v.hasEmptyPartNo || v.hasInvalidPartNo) partNoIssueCount++;
      if (v.hasMissingDesc) missingDescCount++;
      if (v.hasZeroQty) zeroQtyCount++;
      if (v.hasAnyIssue) totalIssuesCount++;
    });

    const totalRows = localRows.length;
    const cleanRate = totalRows > 0 ? Math.round(((totalRows - totalIssuesCount) / totalRows) * 100) : 100;

    return {
      totalRows,
      totalIssuesCount,
      duplicateRefCount,
      partNoIssueCount,
      missingDescCount,
      zeroQtyCount,
      cleanRate,
    };
  }, [localRows, rowValidationMap]);

  // Filtered rows with original index
  const filteredRowsWithIndex = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return localRows
      .map((row, originalIndex) => ({ row, originalIndex }))
      .filter(({ row, originalIndex }) => {
        // 1. Validation issue filter
        if (validationFilter !== 'ALL') {
          const valInfo = rowValidationMap.get(originalIndex);
          if (!valInfo) return false;

          if (validationFilter === 'ISSUES' && !valInfo.hasAnyIssue) return false;
          if (validationFilter === 'PART_NO' && !valInfo.hasEmptyPartNo && !valInfo.hasInvalidPartNo) return false;
          if (validationFilter === 'DUPLICATE_REF' && !valInfo.hasDuplicateRef) return false;
          if (validationFilter === 'DESC' && !valInfo.hasMissingDesc) return false;
          if (validationFilter === 'QTY' && !valInfo.hasZeroQty) return false;
        }

        // 2. Search query filter
        if (query) {
          const partNoStr = String(row.part_no || '').toLowerCase();
          const cleanPartNoStr = cleanPartNumber(row.part_no).toLowerCase();
          const descStr = String(row.description || '').toLowerCase();
          const refNoStr = String(row.ref_no || '').toLowerCase();
          const figNoStr = String(row.fig_no || '').toLowerCase();
          const figNameStr = String(row.fig_name || '').toLowerCase();
          const remarksStr = String(row.remarks || '').toLowerCase();

          const matches =
            partNoStr.includes(query) ||
            cleanPartNoStr.includes(query) ||
            descStr.includes(query) ||
            refNoStr.includes(query) ||
            figNoStr.includes(query) ||
            figNameStr.includes(query) ||
            remarksStr.includes(query);

          if (!matches) return false;
        }

        return true;
      });
  }, [localRows, searchQuery, validationFilter, rowValidationMap]);

  const sortedRowsWithIndex = useMemo(() => {
    const items = [...filteredRowsWithIndex];
    items.sort((a, b) => {
      const aCustom = Boolean((a.row as any).is_custom_section);
      const bCustom = Boolean((b.row as any).is_custom_section);
      if (aCustom && bCustom) return a.originalIndex - b.originalIndex;
      if (aCustom) return 1;
      if (bCustom) return -1;

      let valA: any = a.row[sortField];
      let valB: any = b.row[sortField];

      if (sortField === 'part_no' && cleanParts) {
        valA = cleanPartNumber(String(valA || ''));
        valB = cleanPartNumber(String(valB || ''));
      }

      if (sortField === 'remark_flag') {
        const keyA = `${String((a.row as any).parent_fig_no || a.row.fig_no || '').trim()}__${String((a.row as any).parent_fig_name || a.row.fig_name || '').trim()}`;
        const keyB = `${String((b.row as any).parent_fig_no || b.row.fig_no || '').trim()}__${String((b.row as any).parent_fig_name || b.row.fig_name || '').trim()}`;
        const flagA = figsWithRemarks.has(keyA) || (a.row as any).remark_flag === 'X' ? 'X' : '';
        const flagB = figsWithRemarks.has(keyB) || (b.row as any).remark_flag === 'X' ? 'X' : '';
        if (flagA !== flagB) {
          return sortDir === 'asc' ? flagA.localeCompare(flagB) : flagB.localeCompare(flagA);
        }
      }

      // Handle numbers
      if (
        sortField === 'page' ||
        sortField === 'ref_no' ||
        sortField === 'fig_no'
      ) {
        const numA = typeof valA === 'number' ? valA : parseFloat(String(valA).replace(/[^0-9.-]/g, ''));
        const numB = typeof valB === 'number' ? valB : parseFloat(String(valB).replace(/[^0-9.-]/g, ''));
        if (!isNaN(numA) && !isNaN(numB)) {
          if (numA !== numB) {
            return sortDir === 'asc' ? numA - numB : numB - numA;
          }
        }
      }

      valA = String(valA || '').toLowerCase();
      valB = String(valB || '').toLowerCase();

      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return items;
  }, [filteredRowsWithIndex, sortField, sortDir, cleanParts, figsWithRemarks]);

  // Pagination calculation
  const totalPages = pageSize === -1 ? 1 : Math.ceil(sortedRowsWithIndex.length / pageSize);
  const displayedItems = useMemo(() => {
    if (pageSize === -1) return sortedRowsWithIndex;
    const start = (currentPage - 1) * pageSize;
    return sortedRowsWithIndex.slice(start, start + pageSize);
  }, [sortedRowsWithIndex, currentPage, pageSize]);

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return (
        <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400 opacity-40 group-hover:opacity-100 transition-opacity" />
      );
    }
    return sortDir === 'asc' ? (
      <ChevronUp className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
    ) : (
      <ChevronDown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
    );
  };

  const jumpToCustomSections = () => {
    setPageSize(-1);
    setTimeout(() => {
      const el = document.getElementById('custom-section-part-kits');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (tableContainerRef.current) {
        tableContainerRef.current.scrollTop = tableContainerRef.current.scrollHeight;
      }
    }, 50);
  };

  const jumpToTop = () => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden space-y-0">
      {/* 1. Live Data Quality Validation & Action Bar */}
      <div className="p-3.5 bg-gradient-to-r from-slate-50 via-blue-50/20 to-slate-50 dark:from-slate-900 dark:via-blue-950/20 dark:to-slate-900 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Quality Health Score Badge */}
          <div className="flex items-center gap-2.5">
            {qualityStats.totalIssuesCount === 0 ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                100% Quality Pass ({qualityStats.totalRows} parts valid)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                {qualityStats.totalIssuesCount} Issue{qualityStats.totalIssuesCount > 1 ? 's' : ''} Flagged ({qualityStats.cleanRate}% Clean)
              </span>
            )}

            <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:inline">
              Double-click or click pencil to edit any cell directly.
            </span>
          </div>

          {/* Quick Search & Add Row Action */}
          <div className="flex items-center gap-2">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search part, desc, ref..."
                className="pl-8 pr-7 py-1 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 w-44 sm:w-56 font-mono"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleAddRow}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
              title="Add a new custom part row"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add Part</span>
            </button>
          </div>
        </div>

        {/* Validation Category Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setValidationFilter('ALL');
              setCurrentPage(1);
            }}
            className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
              validationFilter === 'ALL'
                ? 'bg-slate-800 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                : 'bg-white dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
            }`}
          >
            All Rows ({qualityStats.totalRows})
          </button>

          <button
            type="button"
            onClick={() => {
              setValidationFilter('ISSUES');
              setCurrentPage(1);
            }}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
              validationFilter === 'ISSUES'
                ? 'bg-amber-600 text-white shadow-xs font-bold'
                : 'bg-white dark:bg-slate-800/80 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 border border-amber-200 dark:border-amber-900'
            }`}
          >
            <AlertCircle className="w-3 h-3" />
            Only Issues ({qualityStats.totalIssuesCount})
          </button>

          {qualityStats.partNoIssueCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setValidationFilter('PART_NO');
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                validationFilter === 'PART_NO'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-800/80 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900'
              }`}
            >
              Part No ({qualityStats.partNoIssueCount})
            </button>
          )}

          {qualityStats.duplicateRefCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setValidationFilter('DUPLICATE_REF');
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                validationFilter === 'DUPLICATE_REF'
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-800/80 text-orange-700 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/40 border border-orange-200 dark:border-orange-900'
              }`}
            >
              Duplicate Ref ({qualityStats.duplicateRefCount})
            </button>
          )}

          {qualityStats.missingDescCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setValidationFilter('DESC');
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                validationFilter === 'DESC'
                  ? 'bg-yellow-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-800/80 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-950/40 border border-yellow-200 dark:border-yellow-900'
              }`}
            >
              Missing Desc ({qualityStats.missingDescCount})
            </button>
          )}

          {qualityStats.zeroQtyCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setValidationFilter('QTY');
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                validationFilter === 'QTY'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-800/80 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 border border-blue-200 dark:border-blue-900'
              }`}
            >
              Zero Qty ({qualityStats.zeroQtyCount})
            </button>
          )}
        </div>
      </div>

      {/* Quick Jump Bar for Custom Sections */}
      <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-slate-600 dark:text-slate-300 font-medium">
          Showing <strong>{displayedItems.length}</strong> of <strong>{sortedRowsWithIndex.length}</strong> rows
          {validationFilter !== 'ALL' && (
            <span className="ml-1 text-amber-600 dark:text-amber-400 font-bold">
              (Filtered by: {validationFilter})
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={jumpToTop}
            className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer transition-colors"
          >
            ↑ Top
          </button>
          <button
            type="button"
            onClick={jumpToCustomSections}
            className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer transition-colors shadow-2xs"
          >
            ↓ Custom Kits &amp; Service Sections
          </button>
        </div>
      </div>

      {/* Table Container */}
      <div ref={tableContainerRef} className="overflow-x-auto max-h-[620px] scrollbar-thin">
        <table className="w-full text-left border-collapse text-xs sm:text-sm">
          <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-800/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200">
            <tr>
              <th className="px-2 py-3 font-bold text-center w-8 text-slate-400">#</th>

              <th
                onClick={() => handleSort('page')}
                className="group px-3 py-3 font-bold cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors whitespace-nowrap text-center w-14"
              >
                <div className="flex items-center justify-center gap-1">
                  <span>Page</span>
                  {renderSortIcon('page')}
                </div>
              </th>

              <th
                onClick={() => handleSort('fig_no')}
                className="group px-3 py-3 font-bold cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors whitespace-nowrap text-center w-16"
              >
                <div className="flex items-center justify-center gap-1">
                  <span>Fig No.</span>
                  {renderSortIcon('fig_no')}
                </div>
              </th>

              <th
                onClick={() => handleSort('item_group')}
                className="group px-3 py-3 font-bold cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors whitespace-nowrap min-w-[110px]"
              >
                <div className="flex items-center gap-1">
                  <span>Item Group</span>
                  {renderSortIcon('item_group')}
                </div>
              </th>

              <th
                onClick={() => handleSort('show_in_website')}
                className="group px-3 py-3 font-bold cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors whitespace-nowrap text-center min-w-[120px]"
              >
                <div className="flex items-center justify-center gap-1">
                  <span>Show in Website</span>
                  {renderSortIcon('show_in_website')}
                </div>
              </th>

              <th
                onClick={() => handleSort('ranking')}
                className="group px-3 py-3 font-bold cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors whitespace-nowrap text-center min-w-[90px]"
              >
                <div className="flex items-center justify-center gap-1">
                  <span>Ranking</span>
                  {renderSortIcon('ranking')}
                </div>
              </th>

              <th
                onClick={() => handleSort('fig_name')}
                className="group px-3 py-3 font-bold cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors whitespace-nowrap min-w-[160px]"
              >
                <div className="flex items-center gap-1">
                  <span>Parts Name (Fig Heading)</span>
                  {renderSortIcon('fig_name')}
                </div>
              </th>

              <th className="px-3 py-3 font-bold whitespace-nowrap min-w-[150px] text-slate-700 dark:text-slate-200">
                <span>Catalogue Code</span>
              </th>

              <th
                onClick={() => handleSort('model_name')}
                className="group px-3 py-3 font-bold cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors whitespace-nowrap min-w-[260px]"
              >
                <div className="flex items-center gap-1">
                  <span>Model Name</span>
                  {renderSortIcon('model_name')}
                </div>
              </th>

              <th
                onClick={() => handleSort('pic')}
                className="group px-3 py-3 font-bold cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors whitespace-nowrap min-w-[170px]"
              >
                <div className="flex items-center gap-1">
                  <span>Pic</span>
                  {renderSortIcon('pic')}
                </div>
              </th>

              <th
                onClick={() => handleSort('pic_path')}
                className="group px-3 py-3 font-bold cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors whitespace-nowrap min-w-[200px]"
              >
                <div className="flex items-center gap-1">
                  <span>Pic Path</span>
                  {renderSortIcon('pic_path')}
                </div>
              </th>

              <th
                onClick={() => handleSort('ref_no')}
                className="group px-3 py-3 font-bold cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors whitespace-nowrap text-center w-16"
              >
                <div className="flex items-center justify-center gap-1">
                  <span>Ref No.</span>
                  {renderSortIcon('ref_no')}
                </div>
              </th>

              <th
                onClick={() => handleSort('part_no')}
                className="group px-3 py-3 font-bold cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors whitespace-nowrap min-w-[160px]"
              >
                <div className="flex items-center gap-1">
                  <span>Part No.</span>
                  {renderSortIcon('part_no')}
                </div>
              </th>

              <th
                onClick={() => handleSort('description')}
                className="group px-4 py-3 font-bold cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors whitespace-nowrap min-w-[220px]"
              >
                <div className="flex items-center gap-1">
                  <span>Description</span>
                  {renderSortIcon('description')}
                </div>
              </th>

              {/* Dynamic Model Columns */}
              {modelColumns.map((model) => (
                <th
                  key={model}
                  onClick={() => handleSort(model)}
                  className="group px-3 py-3 font-bold cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors whitespace-nowrap text-center min-w-[80px] bg-blue-50/50 dark:bg-blue-950/20"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-blue-700 dark:text-blue-300">{model}</span>
                    {renderSortIcon(model)}
                  </div>
                </th>
              ))}

              <th
                onClick={() => handleSort('remarks')}
                className="group px-4 py-3 font-bold cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors whitespace-nowrap min-w-[140px]"
              >
                <div className="flex items-center gap-1">
                  <span>Remarks</span>
                  {renderSortIcon('remarks')}
                </div>
              </th>

              <th
                onClick={() => handleSort('remark_flag')}
                className="group px-3 py-3 font-bold cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors whitespace-nowrap text-center min-w-[90px]"
                title="Figure has remarks on child records (marks 'X' on parent row)"
              >
                <div className="flex items-center justify-center gap-1">
                  <span>Remark Flag</span>
                  {renderSortIcon('remark_flag')}
                </div>
              </th>

              <th className="px-2 py-3 font-bold text-center w-10 text-slate-400">
                <span>Del</span>
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono text-xs">
            {displayedItems.length === 0 ? (
              <tr>
                <td
                  colSpan={17 + modelColumns.length}
                  className="px-6 py-12 text-center text-slate-500 dark:text-slate-400 font-sans"
                >
                  No parts match the current filter or search criteria.
                </td>
              </tr>
            ) : (
              displayedItems.map(({ row, originalIndex }, idx) => {
                const displayPartNo = cleanParts ? cleanPartNumber(row.part_no) : row.part_no;
                const isCustomSection = Boolean((row as any).is_custom_section);
                const isContinuation =
                  !isCustomSection &&
                  idx > 0 &&
                  displayedItems[idx - 1].row.ref_no === row.ref_no &&
                  displayedItems[idx - 1].row.fig_no === row.fig_no;
                const isFirstOfFig = isCustomSection
                  ? Boolean((row as any).is_parent)
                  : idx === 0 ||
                    displayedItems[idx - 1].row.fig_no !== row.fig_no ||
                    displayedItems[idx - 1].row.fig_name !== row.fig_name;
                const primaryModel = modelColumns && modelColumns.length > 0 ? modelColumns[0] : 'MODEL';
                const figModelCode = (row as any).model_code || primaryModel || 'MODEL';
                const figNameStr = (row as any).parent_fig_name || row.fig_name || 'PARTS';
                const cleanFig = figNameStr.replace(/[^A-Za-z0-9&]+/g, ' ').trim().toUpperCase() || 'PARTS';
                const catCode = (row as any).catalogue_code || `YAM_${figModelCode}_${cleanFig}`;
                const picVal = (row as any).pic || (row as any).image || (catCode ? `${catCode}.jpeg` : '');

                // Validation status for current row
                const valInfo = rowValidationMap.get(originalIndex);

                // Build a stable key per figure for editing
                const figKey = `${(row as any).parent_fig_no || row.fig_no}__${
                  (row as any).parent_fig_name || row.fig_name
                }`;
                // Resolve model name
                const extractedModelName = (row as any).model_name || '';
                const rawOverride = editedModelNames[figKey];
                const activeVal = rawOverride !== undefined ? rawOverride : extractedModelName;
                const figBrand = detectBrand(activeVal);
                const rawModelVal = extractRawModelName(activeVal, figModelCode);

                const composedModelName = isFirstOfFig
                  ? buildComposedModelName(rawModelVal, figModelCode, cleanFig, figBrand)
                  : '';

                const isEditingModelName = isFirstOfFig && editingFigKey === figKey;
                const isModelEdited = Boolean(rawOverride !== undefined || (extractedModelName && rawModelVal));

                // Resolve Pic Path
                const rawPicPathOverride = editedPicPaths[figKey];
                const activePicPath =
                  rawPicPathOverride !== undefined
                    ? rawPicPathOverride
                    : ((row as any).pic_path || picVal);
                const isPicPathEdited = rawPicPathOverride !== undefined;
                const isEditingPicPath = isFirstOfFig && editingPicPathFigKey === figKey;

                // Resolve Remark Flag
                const isExplicitX = (row as any).remark_flag === 'X';
                const figRowOffset = isExplicitX
                  ? 0
                  : (typeof (row as any).fig_row_offset === 'number'
                    ? (row as any).fig_row_offset
                    : (isFirstOfFig ? 0 : 99));
                const cellRemarkKey = `${figKey}__slot_${figRowOffset}`;
                const isFigureWithRemarks =
                  figsWithRemarks.has(figKey) ||
                  isExplicitX ||
                  Boolean((row as any).remark_flag);
                const isRemarkFlagEditable = isFigureWithRemarks && figRowOffset <= 5;
                const isEditingRemarkFlag = isRemarkFlagEditable && editingRemarkFlagKey === cellRemarkKey;

                const rawRemarkFlagOverride = editedRemarkFlags ? editedRemarkFlags[cellRemarkKey] : undefined;
                const currentRemarkFlagVal =
                  rawRemarkFlagOverride !== undefined
                    ? rawRemarkFlagOverride
                    : ((row as any).remark_flag !== undefined && (row as any).remark_flag !== ''
                      ? String((row as any).remark_flag)
                      : (isFigureWithRemarks && figRowOffset === 0 ? 'X' : ''));

                // Helper to check if a generic cell is being edited
                const isCellActive = (field: string) =>
                  editingCell?.originalIndex === originalIndex && editingCell?.field === field;

                return (
                  <tr
                    id={isFirstOfFig && row.fig_name === 'PART KITS & SETS' ? 'custom-section-part-kits' : undefined}
                    key={`${row.page}-${row.fig_no}-${row.ref_no}-${row.part_no}-${idx}`}
                    className={`hover:bg-blue-50/40 dark:hover:bg-blue-950/30 transition-colors h-8 ${
                      valInfo?.hasAnyIssue
                        ? 'bg-amber-50/30 dark:bg-amber-950/20'
                        : idx % 2 === 0
                        ? 'bg-white dark:bg-slate-900'
                        : 'bg-slate-50/50 dark:bg-slate-900/50'
                    }`}
                  >
                    {/* Index / Issue indicator column */}
                    <td className="px-1 py-1 text-center">
                      {valInfo?.hasAnyIssue ? (
                        <span
                          className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 font-bold text-[10px] cursor-help"
                          title={valInfo.issuesSummary.join(' • ')}
                        >
                          !
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-300 dark:text-slate-600 font-mono">
                          {idx + 1}
                        </span>
                      )}
                    </td>

                    <td className="px-3 py-2 text-center text-slate-500 dark:text-slate-400">
                      {isFirstOfFig ? row.page : isCustomSection ? <span className="inline-block h-4">&nbsp;</span> : ''}
                    </td>

                    <td className="px-3 py-2 text-center font-semibold text-slate-700 dark:text-slate-300">
                      {isFirstOfFig ? row.fig_no : ''}
                    </td>

                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300 font-mono font-medium">
                      {isFirstOfFig ? ((row as any).item_group || figModelCode || '') : ''}
                    </td>

                    <td className="px-3 py-2 text-center text-slate-600 dark:text-slate-400">
                      {(row as any).show_in_website || ''}
                    </td>

                    <td className="px-3 py-2 text-center text-slate-600 dark:text-slate-400">
                      {(row as any).ranking || ''}
                    </td>

                    <td
                      className="px-3 py-2 font-sans text-slate-800 dark:text-slate-200 truncate max-w-[200px]"
                      title={row.fig_name}
                    >
                      {isFirstOfFig ? row.fig_name : ''}
                    </td>

                    <td
                      className="px-3 py-2 font-mono font-bold text-slate-700 dark:text-slate-300 truncate max-w-[200px]"
                      title={catCode}
                    >
                      {isFirstOfFig ? catCode : ''}
                    </td>

                    {/* Inline-editable Model Name cell */}
                    <td className="px-2 py-1.5 min-w-[300px] max-w-[420px]">
                      {isFirstOfFig ? (
                        isEditingModelName ? (
                          <div className="flex flex-col gap-1 p-1.5 rounded-xl border-2 border-emerald-500 bg-white dark:bg-slate-900 shadow-md">
                            <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-slate-400 px-0.5">
                              <span className="font-semibold text-slate-700 dark:text-slate-300">
                                {figBrand} {figModelCode}
                              </span>
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold uppercase text-[9px] bg-emerald-50 dark:bg-emerald-950/60 px-1 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                                Model Only
                              </span>
                              <span className="font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[130px]" title={cleanFig}>
                                Series {cleanFig}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <input
                                ref={inputRef}
                                type="text"
                                value={draftValue}
                                onChange={(e) => setDraftValue(e.target.value)}
                                onBlur={() => commitEdit(figKey, figModelCode, cleanFig, figBrand)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') commitEdit(figKey, figModelCode, cleanFig, figBrand);
                                  if (e.key === 'Escape') setEditingFigKey(null);
                                }}
                                placeholder="Enter Model (e.g. FASCINO 125CC DISK, FZ-S FI)..."
                                className="flex-1 min-w-0 px-2 py-1 text-xs font-bold rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-100 outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                              />
                              <button
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  commitEdit(figKey, figModelCode, cleanFig, figBrand);
                                }}
                                className="shrink-0 p-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white transition-colors cursor-pointer shadow-xs"
                                title="Save Model"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            className={`group flex items-center justify-between gap-1.5 cursor-pointer rounded-lg px-2.5 py-1.5 transition-all ${
                              isModelEdited
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700'
                                : 'hover:bg-slate-100 dark:hover:bg-slate-800/80 border border-slate-200/60 dark:border-slate-800'
                            }`}
                            onClick={() => onModelNameEdit !== undefined && startEditing(figKey, rawModelVal)}
                            title={onModelNameEdit ? `Click to edit Model only. Full Record: ${composedModelName}` : composedModelName}
                          >
                            <div className="flex items-center gap-1 text-xs truncate">
                              <span className="font-semibold text-slate-500 dark:text-slate-400">
                                {figBrand} {figModelCode}
                              </span>
                              {rawModelVal ? (
                                <span className="font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/60 px-1.5 py-0.5 rounded text-[11px] font-mono">
                                  {rawModelVal}
                                </span>
                              ) : (
                                <span className="italic text-amber-600 dark:text-amber-400 font-medium text-[11px] bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                                  [Click to enter Model]
                                </span>
                              )}
                              <span className="font-semibold text-slate-500 dark:text-slate-400 truncate">Series {cleanFig}</span>
                            </div>
                            {onModelNameEdit && (
                              <Pencil
                                className={`w-3.5 h-3.5 shrink-0 transition-opacity ${
                                  isModelEdited
                                    ? 'text-emerald-600 opacity-80'
                                    : 'text-slate-400 opacity-0 group-hover:opacity-100'
                                }`}
                              />
                            )}
                          </div>
                        )
                      ) : (
                        ''
                      )}
                    </td>

                    <td
                      className="px-3 py-2 font-mono text-[11px] text-slate-600 dark:text-slate-400 truncate max-w-[210px]"
                      title={isFirstOfFig ? picVal : ''}
                    >
                      {isFirstOfFig && picVal ? (
                        <div className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                          <ImageIcon className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span className="truncate">{picVal}</span>
                        </div>
                      ) : (
                        ''
                      )}
                    </td>

                    {/* Inline-editable Pic Path cell */}
                    <td className="px-2 py-1.5 min-w-[220px] max-w-[340px]">
                      {isFirstOfFig ? (
                        isEditingPicPath ? (
                          <div className="flex items-center gap-1.5 p-1 rounded-xl border-2 border-blue-500 bg-white dark:bg-slate-900 shadow-md">
                            <input
                              ref={picPathInputRef}
                              type="text"
                              value={draftPicPath}
                              onChange={(e) => setDraftPicPath(e.target.value)}
                              onBlur={() => commitPicPathEdit(figKey)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitPicPathEdit(figKey);
                                if (e.key === 'Escape') setEditingPicPathFigKey(null);
                              }}
                              placeholder="Enter Pic Path (e.g. images/...)..."
                              className="flex-1 min-w-0 px-2 py-1 text-xs font-mono font-bold rounded-lg border border-blue-300 dark:border-blue-700 bg-blue-50/60 dark:bg-blue-950/40 text-blue-950 dark:text-blue-100 outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <button
                              onMouseDown={(e) => {
                                e.preventDefault();
                                commitPicPathEdit(figKey);
                              }}
                              className="shrink-0 p-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white transition-colors cursor-pointer shadow-xs"
                              title="Save Pic Path"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div
                            className={`group flex items-center justify-between gap-1.5 cursor-pointer rounded-lg px-2.5 py-1.5 transition-all ${
                              isPicPathEdited
                                ? 'bg-blue-50 dark:bg-blue-950/40 border border-blue-300 dark:border-blue-700'
                                : 'hover:bg-slate-100 dark:hover:bg-slate-800/80 border border-slate-200/60 dark:border-slate-800'
                            }`}
                            onClick={() => onPicPathEdit !== undefined && startEditingPicPath(figKey, activePicPath)}
                            title={onPicPathEdit ? `Click to edit / add text to Pic Path: ${activePicPath}` : activePicPath}
                          >
                            <div className="flex items-center gap-1.5 text-xs truncate">
                              {onPicPathEdit && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startEditingPicPath(figKey, activePicPath);
                                  }}
                                  className="p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-400 transition-colors cursor-pointer shrink-0"
                                  title="Edit / add text to Pic Path"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <span className="font-mono text-slate-700 dark:text-slate-300 truncate" title={activePicPath}>
                                {activePicPath}
                              </span>
                            </div>
                          </div>
                        )
                      ) : (
                        ''
                      )}
                    </td>

                    {/* Inline-editable Ref No cell */}
                    <td className="px-2 py-1 text-center">
                      {isCellActive('ref_no') ? (
                        <div className="flex items-center gap-1">
                          <input
                            ref={cellInputRef}
                            type="text"
                            value={draftCellVal}
                            onChange={(e) => setDraftCellVal(e.target.value)}
                            onBlur={commitCellEdit}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitCellEdit();
                              if (e.key === 'Escape') setEditingCell(null);
                            }}
                            className="w-14 px-1 py-0.5 text-center font-bold font-mono text-xs rounded border-2 border-blue-500 outline-none"
                          />
                        </div>
                      ) : (
                        <div
                          onClick={() => startCellEdit(originalIndex, 'ref_no', row.ref_no)}
                          className={`group cursor-pointer inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[11px] font-bold border transition-colors ${
                            valInfo?.hasDuplicateRef
                              ? 'bg-rose-100 text-rose-800 border-rose-400 dark:bg-rose-950/60 dark:text-rose-300'
                              : isContinuation
                              ? 'text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 border-transparent hover:border-blue-400'
                              : 'text-slate-900 dark:text-slate-100 bg-slate-200/80 dark:bg-slate-700/80 border-transparent hover:border-blue-400'
                          }`}
                          title={valInfo?.hasDuplicateRef ? `Duplicate Ref '${row.ref_no}' in this figure! Click to edit` : 'Click to edit Ref No'}
                        >
                          <span>{row.ref_no || '-'}</span>
                          <Pencil className="w-2.5 h-2.5 ml-1 opacity-0 group-hover:opacity-60" />
                        </div>
                      )}
                    </td>

                    {/* Inline-editable Part No cell */}
                    <td className="px-2 py-1">
                      {isCellActive('part_no') ? (
                        <div className="flex items-center gap-1">
                          <input
                            ref={cellInputRef}
                            type="text"
                            value={draftCellVal}
                            onChange={(e) => setDraftCellVal(e.target.value)}
                            onBlur={commitCellEdit}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitCellEdit();
                              if (e.key === 'Escape') setEditingCell(null);
                            }}
                            placeholder="Part No..."
                            className="w-full px-2 py-0.5 font-bold font-mono text-xs rounded border-2 border-blue-500 outline-none"
                          />
                        </div>
                      ) : (
                        <div
                          onClick={() => startCellEdit(originalIndex, 'part_no', row.part_no)}
                          className={`group cursor-pointer flex items-center justify-between gap-1 px-1.5 py-0.5 rounded border transition-colors ${
                            valInfo?.hasEmptyPartNo || valInfo?.hasInvalidPartNo
                              ? 'bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300'
                              : 'border-transparent hover:border-blue-300 dark:hover:border-blue-700'
                          }`}
                          title="Click to edit Part Number"
                        >
                          <span className="font-bold text-blue-900 dark:text-blue-300 tracking-wide select-all">
                            {displayPartNo || (
                              <span className="italic text-rose-500 text-xs">[Missing Part No]</span>
                            )}
                          </span>
                          <Pencil className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 shrink-0" />
                        </div>
                      )}
                    </td>

                    {/* Inline-editable Description cell */}
                    <td className="px-2 py-1">
                      {isCellActive('description') ? (
                        <div className="flex items-center gap-1">
                          <input
                            ref={cellInputRef}
                            type="text"
                            value={draftCellVal}
                            onChange={(e) => setDraftCellVal(e.target.value)}
                            onBlur={commitCellEdit}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitCellEdit();
                              if (e.key === 'Escape') setEditingCell(null);
                            }}
                            placeholder="Description..."
                            className="w-full px-2 py-0.5 font-sans text-xs rounded border-2 border-blue-500 outline-none"
                          />
                        </div>
                      ) : (
                        <div
                          onClick={() => startCellEdit(originalIndex, 'description', row.description)}
                          className={`group cursor-pointer flex items-center justify-between gap-1 px-1.5 py-0.5 rounded border transition-colors ${
                            valInfo?.hasMissingDesc
                              ? 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300'
                              : 'border-transparent hover:border-blue-300 dark:hover:border-blue-700'
                          }`}
                          title="Click to edit Description"
                        >
                          <span className="font-sans text-slate-900 dark:text-slate-100">
                            {cleanDescription(row.description) || (
                              <span className="italic text-amber-500 text-xs">[Missing Description]</span>
                            )}
                          </span>
                          <Pencil className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 shrink-0" />
                        </div>
                      )}
                    </td>

                    {/* Model quantities: Inline editable */}
                    {modelColumns.map((model) => {
                      const qty = row[model];
                      const isQtyActive = isCellActive(model);
                      return (
                        <td
                          key={model}
                          className="px-2 py-1 text-center font-bold text-slate-800 dark:text-slate-200 bg-blue-50/30 dark:bg-blue-950/10"
                        >
                          {isQtyActive ? (
                            <input
                              ref={cellInputRef}
                              type="text"
                              value={draftCellVal}
                              onChange={(e) => setDraftCellVal(e.target.value)}
                              onBlur={commitCellEdit}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitCellEdit();
                                if (e.key === 'Escape') setEditingCell(null);
                              }}
                              className="w-10 px-1 py-0.5 text-center font-bold text-xs rounded border-2 border-blue-500 outline-none"
                            />
                          ) : (
                            <div
                              onClick={() => startCellEdit(originalIndex, model, qty)}
                              className="group cursor-pointer inline-flex items-center justify-center p-0.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900/60"
                              title={`Click to edit quantity for ${model}`}
                            >
                              {qty !== undefined && qty !== '' ? (
                                <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200 text-xs font-semibold">
                                  {qty}
                                </span>
                              ) : isCustomSection ? null : (
                                <span className="text-slate-300 dark:text-slate-700">-</span>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}

                    {/* Remarks column: Inline editable */}
                    <td className="px-2 py-1 font-sans text-slate-600 dark:text-slate-400">
                      {isCellActive('remarks') ? (
                        <input
                          ref={cellInputRef}
                          type="text"
                          value={draftCellVal}
                          onChange={(e) => setDraftCellVal(e.target.value)}
                          onBlur={commitCellEdit}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitCellEdit();
                            if (e.key === 'Escape') setEditingCell(null);
                          }}
                          placeholder="Remarks..."
                          className="w-full px-2 py-0.5 font-sans text-xs rounded border-2 border-blue-500 outline-none"
                        />
                      ) : (
                        <div
                          onClick={() => startCellEdit(originalIndex, 'remarks', row.remarks)}
                          className="group cursor-pointer flex items-center justify-between gap-1 px-1.5 py-0.5 rounded border border-transparent hover:border-slate-300 dark:hover:border-slate-700"
                          title="Click to edit Remarks"
                        >
                          {(() => {
                            const displayRemarks = cleanRemarks(row.remarks);
                            return displayRemarks ? (
                              <span className="inline-block px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/80 text-amber-800 dark:text-amber-300 text-[11px] font-medium">
                                {displayRemarks}
                              </span>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600 italic text-[11px] group-hover:text-slate-400">
                                [Add Remark]
                              </span>
                            );
                          })()}
                          <Pencil className="w-2.5 h-2.5 text-slate-400 opacity-0 group-hover:opacity-100 shrink-0" />
                        </div>
                      )}
                    </td>

                    {/* Remark Flag column */}
                    <td className="px-2 py-1.5 text-center min-w-[75px]">
                      {isRemarkFlagEditable ? (
                        isEditingRemarkFlag ? (
                          <div className="inline-flex items-center gap-1 p-0.5 rounded-lg border-2 border-amber-500 bg-white dark:bg-slate-900 shadow-sm min-w-[70px]">
                            <input
                              ref={remarkFlagInputRef}
                              type="text"
                              value={draftRemarkFlag}
                              onChange={(e) => setDraftRemarkFlag(e.target.value)}
                              onBlur={() => commitRemarkFlagEdit(cellRemarkKey)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitRemarkFlagEdit(cellRemarkKey);
                                if (e.key === 'Escape') setEditingRemarkFlagKey(null);
                              }}
                              placeholder={figRowOffset === 0 ? 'X' : `Cell ${figRowOffset}`}
                              className="w-full px-1.5 py-0.5 text-xs font-mono font-bold rounded border border-amber-300 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-950/40 text-amber-950 dark:text-amber-100 outline-none focus:ring-1 focus:ring-amber-500 text-center"
                            />
                            <button
                              onMouseDown={(e) => {
                                e.preventDefault();
                                commitRemarkFlagEdit(cellRemarkKey);
                              }}
                              className="shrink-0 p-1 rounded bg-amber-500 hover:bg-amber-600 text-white transition-colors cursor-pointer shadow-xs"
                              title="Save Remark Flag"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                          </div>
                        ) : currentRemarkFlagVal ? (
                          <div
                            className={`group inline-flex items-center justify-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-mono font-extrabold cursor-pointer transition-all ${
                              figRowOffset === 0
                                ? 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/25 shadow-2xs'
                                : 'bg-amber-100/80 dark:bg-amber-950/50 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-200/80'
                            }`}
                            onClick={() => onRemarkFlagEdit !== undefined && startEditingRemarkFlag(cellRemarkKey, currentRemarkFlagVal)}
                            title={
                              onRemarkFlagEdit
                                ? `Click to edit Remark Flag (${figRowOffset === 0 ? 'Parent X' : `Cell ${figRowOffset} below X`}): ${currentRemarkFlagVal}`
                                : currentRemarkFlagVal
                            }
                          >
                            {onRemarkFlagEdit && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEditingRemarkFlag(cellRemarkKey, currentRemarkFlagVal);
                                }}
                                className="p-0.5 rounded hover:bg-amber-200 dark:hover:bg-amber-800/60 text-amber-700 dark:text-amber-400 transition-colors cursor-pointer shrink-0"
                                title="Edit Remark Flag"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            )}
                            <span>{currentRemarkFlagVal}</span>
                          </div>
                        ) : onRemarkFlagEdit ? (
                          <button
                            type="button"
                            onClick={() => startEditingRemarkFlag(cellRemarkKey, '')}
                            className="inline-flex items-center justify-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-mono text-slate-300 dark:text-slate-600 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 border border-dashed border-transparent hover:border-amber-300 transition-colors cursor-pointer"
                            title={`Click to add text to Cell ${figRowOffset} below X`}
                          >
                            <Pencil className="w-2.5 h-2.5" />
                            <span>+{figRowOffset}</span>
                          </button>
                        ) : null
                      ) : null}
                    </td>

                    {/* Delete Row button */}
                    <td className="px-1 py-1 text-center">
                      <button
                        type="button"
                        onClick={() => handleDeleteRow(originalIndex)}
                        className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                        title="Delete this row"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="px-4 py-3 bg-slate-50 dark:bg-slate-850 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
          <span>Rows per page:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-medium focus:ring-1 focus:ring-blue-500"
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={-1}>All ({sortedRowsWithIndex.length})</option>
          </select>
          <span className="ml-2 text-slate-500">
            Showing{' '}
            {displayedItems.length > 0
              ? (currentPage - 1) * (pageSize === -1 ? sortedRowsWithIndex.length : pageSize) + 1
              : 0}{' '}
            to{' '}
            {pageSize === -1
              ? sortedRowsWithIndex.length
              : Math.min(currentPage * pageSize, sortedRowsWithIndex.length)}{' '}
            of {sortedRowsWithIndex.length} parts
          </span>
        </div>

        {pageSize !== -1 && totalPages > 1 && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-200/70 dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none text-slate-700 dark:text-slate-300 transition-colors"
              title="Previous Page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="px-3 py-1 font-medium text-slate-700 dark:text-slate-300">
              Page {currentPage} of {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-200/70 dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none text-slate-700 dark:text-slate-300 transition-colors"
              title="Next Page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
