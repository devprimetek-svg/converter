import React from 'react';
import { Loader2, FileText } from 'lucide-react';
import type { ExtractionStatus } from '../types';

interface ProgressBarProps {
  status: ExtractionStatus;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ status }) => {
  const { current_page, total_pages, current_fig_no, current_fig_name } = status;
  const percent = total_pages > 0 ? Math.min(100, Math.round((current_page / total_pages) * 100)) : 10;

  return (
    <div className="w-full max-w-2xl mx-auto p-6 sm:p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-md">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Parsing Parts Catalogue...
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {total_pages > 0
                ? `Reading page ${current_page} of ${total_pages}`
                : 'Initializing PDF document reader...'}
            </p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-xl font-extrabold text-blue-600 dark:text-blue-400">
            {percent}%
          </span>
        </div>
      </div>

      {/* Progress Track */}
      <div className="w-full bg-slate-100 dark:bg-slate-800 h-3 rounded-full overflow-hidden p-0.5">
        <div
          className="bg-gradient-to-r from-blue-600 to-indigo-600 h-full rounded-full transition-all duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Current figure badge */}
      {current_fig_no && (
        <div className="mt-4 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 px-3.5 py-2 rounded-xl border border-slate-200/70 dark:border-slate-700/60">
          <div className="flex items-center gap-2 truncate">
            <FileText className="w-4 h-4 text-blue-500 shrink-0" />
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              FIG. {current_fig_no}
            </span>
            <span className="truncate">{current_fig_name}</span>
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0 ml-2">
            Table active
          </span>
        </div>
      )}
    </div>
  );
};
