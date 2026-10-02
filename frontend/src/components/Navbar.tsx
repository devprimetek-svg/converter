import React, { useState, useRef, useEffect } from 'react';
import {
  Moon,
  Sun,
  FileSpreadsheet,
  FileImage,
  Crop,
  Droplet,
  Sparkles,
  Zap,
  RotateCcw,
  MoreVertical,
  Send,
  Barcode,
  Sliders,
  X,
  ExternalLink,
} from 'lucide-react';

export type ActiveTab = 'auto-pipeline' | 'catalogue' | 'pdf-images' | 'resizer' | 'watermark';

interface NavbarProps {
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onReplaySplash?: () => void;
  enableErpSync: boolean;
  enableBarcodeLabels: boolean;
  onToggleErpSync: () => void;
  onToggleBarcodeLabels: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  darkMode,
  setDarkMode,
  activeTab,
  setActiveTab,
  onReplaySplash,
  enableErpSync,
  enableBarcodeLabels,
  onToggleErpSync,
  onToggleBarcodeLabels,
}) => {
  const [showThreeDotMenu, setShowThreeDotMenu] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowThreeDotMenu(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowThreeDotMenu(false);
      }
    };
    if (showThreeDotMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showThreeDotMenu]);
  const tabs = [
    {
      id: 'auto-pipeline' as ActiveTab,
      label: 'Auto Pipeline',
      icon: Sparkles,
      badge: 'All-in-1',
    },
    {
      id: 'catalogue' as ActiveTab,
      label: 'Parts to Excel',
      icon: FileSpreadsheet,
      badge: 'Yamaha',
    },
    {
      id: 'pdf-images' as ActiveTab,
      label: 'Extract PDF Images',
      icon: FileImage,
      badge: 'New',
    },
    {
      id: 'resizer' as ActiveTab,
      label: 'Bulk Resizer',
      icon: Crop,
      badge: 'New',
    },
    {
      id: 'watermark' as ActiveTab,
      label: 'Watermark',
      icon: Droplet,
      badge: 'New',
    },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 dark:border-zinc-800/80 bg-white/90 dark:bg-black/90 backdrop-blur-xl transition-colors">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
        {/* Brand & Tagline */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-zinc-100 dark:bg-zinc-950 flex items-center justify-center text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-800 shadow-sm">
            <Zap className="w-5 h-5 text-zinc-900 dark:text-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm sm:text-base font-extrabold tracking-wider text-zinc-900 dark:text-white uppercase font-sans">
                Venture <span className="font-light text-zinc-500 dark:text-zinc-400">Automation</span>
              </h1>
            </div>
            <div className="text-[10px] sm:text-[11px] font-mono tracking-widest text-zinc-500 dark:text-zinc-400 uppercase font-medium">
              Extract and Build
            </div>
          </div>
        </div>

        {/* Center Minimalist Tab Navigation */}
        <nav className="hidden md:flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 text-[11px] font-medium whitespace-nowrap">
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all duration-150 whitespace-nowrap shrink-0 text-[11px] cursor-pointer ${
                  isActive
                    ? 'bg-black text-white dark:bg-white dark:text-black font-semibold shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-200/70 dark:hover:bg-zinc-900'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-white dark:text-black' : 'text-zinc-500 dark:text-zinc-400'}`} />
                <span className="whitespace-nowrap">{t.label}</span>
                {t.badge && (
                  <span
                    className={`text-[8px] px-1 py-0.5 rounded font-mono uppercase tracking-wider whitespace-nowrap shrink-0 ${
                      isActive
                        ? 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-black'
                        : 'bg-zinc-200 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    {t.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Right Controls: Three Dots Menu, Replay Splash & Theme Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Three Dots More Menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowThreeDotMenu(!showThreeDotMenu)}
              className={`relative p-1.5 rounded-lg border transition-all cursor-pointer shrink-0 ${
                showThreeDotMenu
                  ? 'bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white border-zinc-300 dark:border-zinc-700'
                  : 'bg-zinc-100 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-900 border-zinc-200 dark:border-zinc-800'
              }`}
              title="Extensions & Modules (Sync to ERP, Barcodes & Labels)"
              aria-label="Extensions and modules"
              aria-expanded={showThreeDotMenu}
            >
              <MoreVertical className="w-4 h-4" />
              {(enableErpSync || enableBarcodeLabels) && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-black" />
              )}
            </button>

            {/* Dropdown Menu */}
            {showThreeDotMenu && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-2xl z-50 p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/80 pb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                      <Sliders className="w-3.5 h-3.5 text-zinc-800 dark:text-zinc-200" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-white">
                        Extension Modules
                      </h3>
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                        Enable or hide features in Auto Pipeline
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowThreeDotMenu(false)}
                    className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Option 1: Sync to ERP */}
                <div className={`p-3 rounded-xl border transition-all ${
                  enableErpSync
                    ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60'
                    : 'bg-zinc-50 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800'
                }`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <div className={`p-2 rounded-lg shrink-0 ${
                        enableErpSync
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                      }`}>
                        <Send className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-zinc-900 dark:text-white">
                            Sync to ERP
                          </span>
                          <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold uppercase ${
                            enableErpSync
                              ? 'bg-emerald-100 dark:bg-emerald-900/70 text-emerald-800 dark:text-emerald-300'
                              : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                          }`}>
                            {enableErpSync ? 'Active in Pipeline' : 'Hidden'}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug">
                          Simplify ERP direct sync &amp; catalogue table editor
                        </p>
                      </div>
                    </div>

                    {/* Toggle Switch */}
                    <button
                      type="button"
                      onClick={onToggleErpSync}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        enableErpSync ? 'bg-emerald-600' : 'bg-zinc-300 dark:bg-zinc-700'
                      }`}
                      role="switch"
                      aria-checked={enableErpSync}
                      title={enableErpSync ? 'Disable in Auto Pipeline' : 'Enable in Auto Pipeline'}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          enableErpSync ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {enableErpSync && (
                    <div className="mt-2.5 pt-2 border-t border-emerald-200/60 dark:border-emerald-900/40 flex items-center justify-between">
                      <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-mono font-medium">
                        ✓ Visible in Auto Pipeline
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setShowThreeDotMenu(false);
                          setActiveTab('auto-pipeline');
                          window.dispatchEvent(new CustomEvent('open-erp-sync'));
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold shadow-xs cursor-pointer"
                      >
                        Launch
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Option 2: Barcode & Labels */}
                <div className={`p-3 rounded-xl border transition-all ${
                  enableBarcodeLabels
                    ? 'bg-blue-50/60 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/60'
                    : 'bg-zinc-50 dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800'
                }`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <div className={`p-2 rounded-lg shrink-0 ${
                        enableBarcodeLabels
                          ? 'bg-slate-900 dark:bg-white text-white dark:text-black shadow-xs'
                          : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                      }`}>
                        <Barcode className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-zinc-900 dark:text-white">
                            Barcode &amp; Labels
                          </span>
                          <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold uppercase ${
                            enableBarcodeLabels
                              ? 'bg-blue-100 dark:bg-blue-900/70 text-blue-800 dark:text-blue-300'
                              : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                          }`}>
                            {enableBarcodeLabels ? 'Active in Pipeline' : 'Hidden'}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug">
                          Warehouse Code128 / QR label generator &amp; picklist printing
                        </p>
                      </div>
                    </div>

                    {/* Toggle Switch */}
                    <button
                      type="button"
                      onClick={onToggleBarcodeLabels}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        enableBarcodeLabels ? 'bg-blue-600' : 'bg-zinc-300 dark:bg-zinc-700'
                      }`}
                      role="switch"
                      aria-checked={enableBarcodeLabels}
                      title={enableBarcodeLabels ? 'Disable in Auto Pipeline' : 'Enable in Auto Pipeline'}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          enableBarcodeLabels ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {enableBarcodeLabels && (
                    <div className="mt-2.5 pt-2 border-t border-blue-200/60 dark:border-blue-900/40 flex items-center justify-between">
                      <span className="text-[10px] text-blue-700 dark:text-blue-400 font-mono font-medium">
                        ✓ Visible in Auto Pipeline
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setShowThreeDotMenu(false);
                          setActiveTab('auto-pipeline');
                          window.dispatchEvent(new CustomEvent('open-warehouse-studio'));
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 dark:bg-white hover:bg-black dark:hover:bg-zinc-200 text-white dark:text-black text-[10px] font-bold shadow-xs cursor-pointer"
                      >
                        Launch
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Footer hint */}
                <div className="p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-900/80 text-[10px] text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span>Toggle ON to display action buttons in Auto Pipeline. Toggle OFF to hide them.</span>
                </div>
              </div>
            )}
          </div>

          {onReplaySplash && (
            <button
              onClick={onReplaySplash}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-950 hover:bg-zinc-200 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all text-[11px] font-mono font-medium whitespace-nowrap shrink-0 cursor-pointer"
              title="Replay Venture Automation Startup Screen"
            >
              <RotateCcw className="w-3 h-3 text-zinc-600 dark:text-zinc-300 shrink-0" />
              <span className="hidden sm:inline whitespace-nowrap">Splash</span>
            </button>
          )}

          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-1.5 rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white bg-zinc-100 dark:bg-zinc-950 hover:bg-zinc-200 dark:hover:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors cursor-pointer shrink-0"
            title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label="Toggle theme"
          >
            {darkMode ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-zinc-700" />}
          </button>
        </div>
      </div>

      {/* Mobile Device Browser Tab Navigation Bar */}
      <div className="md:hidden flex items-center justify-start border-t border-zinc-200 dark:border-zinc-800/80 px-2 py-1.5 bg-white dark:bg-black text-[11px] font-medium overflow-x-auto no-scrollbar gap-1 safe-bottom">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg whitespace-nowrap shrink-0 text-[11px] transition-all cursor-pointer ${
                isActive
                  ? 'bg-black text-white dark:bg-white dark:text-black font-semibold shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white bg-zinc-100 dark:bg-zinc-950'
              }`}
            >
              <Icon className={`w-3 h-3 shrink-0 ${isActive ? 'text-white dark:text-black' : 'text-zinc-500 dark:text-zinc-400'}`} />
              <span className="whitespace-nowrap">{t.label}</span>
            </button>
          );
        })}
      </div>
    </header>
  );
};

