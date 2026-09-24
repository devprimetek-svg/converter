import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { PartRow } from '../types';
import { cleanPartNumber } from '../utils/cleanPartNo';

interface PartsTableProps {
  rows: PartRow[];
  modelColumns: string[];
  cleanParts: boolean;
}

type SortField = 'page' | 'fig_no' | 'fig_name' | 'ref_no' | 'part_no' | 'description' | 'remarks' | string;
type SortDirection = 'asc' | 'desc';

export const PartsTable: React.FC<PartsTableProps> = ({ rows, modelColumns, cleanParts }) => {
  const [sortField, setSortField] = useState<SortField>('page');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sortedRows = useMemo(() => {
    const list = [...rows];
    list.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (sortField === 'part_no' && cleanParts) {
        valA = cleanPartNumber(String(valA || ''));
        valB = cleanPartNumber(String(valB || ''));
      }

      // Handle numbers
      if (sortField === 'page' || sortField === 'ref_no' || sortField === 'fig_no') {
        const numA = parseInt(String(valA).replace(/\D/g, ''), 10);
        const numB = parseInt(String(valB).replace(/\D/g, ''), 10);
        if (!isNaN(numA) && !isNaN(numB)) {
          if (numA !== numB) {
            return sortDir === 'asc' ? numA - numB : numB - numA;
          }
          // Tie-break identical numbers with alphabetical suffix (e.g. 1A vs 1B)
          const strA = String(valA || '').toLowerCase();
          const strB = String(valB || '').toLowerCase();
          return sortDir === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
        }
      }

      valA = String(valA || '').toLowerCase();
      valB = String(valB || '').toLowerCase();

      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [rows, sortField, sortDir, cleanParts]);

  // Pagination calculation
  const totalPages = pageSize === -1 ? 1 : Math.ceil(sortedRows.length / pageSize);
  const displayedRows = useMemo(() => {
    if (pageSize === -1) return sortedRows;
    const start = (currentPage - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, currentPage, pageSize]);

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400 opacity-40 group-hover:opacity-100 transition-opacity" />;
    }
    return sortDir === 'asc' ? (
      <ChevronUp className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
    ) : (
      <ChevronDown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
    );
  };

  return (
    <div className="flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
      {/* Table Container */}
      <div className="overflow-x-auto max-h-[620px] scrollbar-thin">
        <table className="w-full text-left border-collapse text-xs sm:text-sm">
          <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-800/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200">
            <tr>
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
                onClick={() => handleSort('fig_name')}
                className="group px-3 py-3 font-bold cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors whitespace-nowrap min-w-[160px]"
              >
                <div className="flex items-center gap-1">
                  <span>Parts Name (Fig Heading)</span>
                  {renderSortIcon('fig_name')}
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
                className="group px-3 py-3 font-bold cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors whitespace-nowrap min-w-[150px]"
              >
                <div className="flex items-center gap-1">
                  <span>Part No.</span>
                  {renderSortIcon('part_no')}
                </div>
              </th>

              <th
                onClick={() => handleSort('description')}
                className="group px-4 py-3 font-bold cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors whitespace-nowrap min-w-[200px]"
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
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono text-xs">
            {displayedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={7 + modelColumns.length}
                  className="px-6 py-12 text-center text-slate-500 dark:text-slate-400 font-sans"
                >
                  No parts match the current filter or search criteria.
                </td>
              </tr>
            ) : (
              displayedRows.map((row, idx) => {
                const displayPartNo = cleanParts ? cleanPartNumber(row.part_no) : row.part_no;
                const isContinuation = idx > 0 && displayedRows[idx - 1].ref_no === row.ref_no && displayedRows[idx - 1].fig_no === row.fig_no;

                return (
                  <tr
                    key={`${row.page}-${row.fig_no}-${row.ref_no}-${row.part_no}-${idx}`}
                    className={`hover:bg-blue-50/40 dark:hover:bg-blue-950/30 transition-colors ${
                      idx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/50 dark:bg-slate-900/50'
                    }`}
                  >
                    <td className="px-3 py-2 text-center text-slate-500 dark:text-slate-400">
                      {row.page}
                    </td>

                    <td className="px-3 py-2 text-center font-semibold text-slate-700 dark:text-slate-300">
                      {row.fig_no}
                    </td>

                    <td className="px-3 py-2 font-sans text-slate-800 dark:text-slate-200 truncate max-w-[200px]" title={row.fig_name}>
                      {row.fig_name}
                    </td>

                    <td className="px-3 py-2 text-center">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-bold ${
                        isContinuation
                          ? 'text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800'
                          : 'text-slate-900 dark:text-slate-100 bg-slate-200/80 dark:bg-slate-700/80'
                      }`}>
                        {row.ref_no}
                      </span>
                    </td>

                    <td className="px-3 py-2 font-bold text-blue-900 dark:text-blue-300 tracking-wide select-all">
                      {displayPartNo}
                    </td>

                    <td className="px-4 py-2 font-sans text-slate-900 dark:text-slate-100">
                      {row.description}
                    </td>

                    {/* Model quantities */}
                    {modelColumns.map((model) => {
                      const qty = row[model];
                      return (
                        <td
                          key={model}
                          className="px-3 py-2 text-center font-bold text-slate-800 dark:text-slate-200 bg-blue-50/30 dark:bg-blue-950/10"
                        >
                          {qty !== undefined && qty !== '' ? (
                            <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200 text-xs font-semibold">
                              {qty}
                            </span>
                          ) : (
                            <span className="text-slate-300 dark:text-slate-700">-</span>
                          )}
                        </td>
                      );
                    })}

                    <td className="px-4 py-2 font-sans text-slate-600 dark:text-slate-400">
                      {row.remarks ? (
                        <span className="inline-block px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/80 text-amber-800 dark:text-amber-300 text-[11px] font-medium">
                          {row.remarks}
                        </span>
                      ) : null}
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
            <option value={-1}>All ({sortedRows.length})</option>
          </select>
          <span className="ml-2 text-slate-500">
            Showing {displayedRows.length > 0 ? (currentPage - 1) * (pageSize === -1 ? sortedRows.length : pageSize) + 1 : 0} to{' '}
            {pageSize === -1 ? sortedRows.length : Math.min(currentPage * pageSize, sortedRows.length)} of {sortedRows.length} parts
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
