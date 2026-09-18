import React from 'react';
import { AlertTriangle, FileWarning, RotateCcw } from 'lucide-react';

interface ErrorAlertProps {
  message: string;
  onRetry: () => void;
}

export const ErrorAlert: React.FC<ErrorAlertProps> = ({ message, onRetry }) => {
  const isNoTextLayer =
    message.toLowerCase().includes('no extractable text layer') ||
    message.toLowerCase().includes('scanned image') ||
    message.toLowerCase().includes('ocr');

  return (
    <div className="w-full max-w-2xl mx-auto p-6 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 rounded-2xl shadow-sm">
      <div className="flex items-start gap-4">
        <div className="p-2.5 rounded-xl bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 shrink-0">
          {isNoTextLayer ? (
            <FileWarning className="w-6 h-6" />
          ) : (
            <AlertTriangle className="w-6 h-6" />
          )}
        </div>

        <div className="flex-1">
          <h3 className="text-base font-bold text-red-900 dark:text-red-200">
            {isNoTextLayer ? 'Scanned PDF Detected (OCR Not Supported)' : 'Processing Error'}
          </h3>

          <p className="mt-1 text-sm text-red-700 dark:text-red-300 leading-relaxed">
            {message}
          </p>

          {isNoTextLayer && (
            <div className="mt-3 p-3 bg-white/60 dark:bg-slate-900/60 rounded-xl text-xs text-slate-600 dark:text-slate-400 border border-red-200/50 dark:border-red-900/40">
              <strong>Tip:</strong> This converter operates directly on vector coordinate text layers
              within digital PDF catalogues. Please export or supply a digital vector PDF rather than a flattened scan/photo.
            </div>
          )}

          <div className="mt-4">
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-bold shadow-sm transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Try Another PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
