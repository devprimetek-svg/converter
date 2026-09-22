import React from 'react';
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
} from 'lucide-react';

export type ActiveTab = 'auto-pipeline' | 'catalogue' | 'pdf-images' | 'resizer' | 'watermark';

interface NavbarProps {
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onReplaySplash?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  darkMode,
  setDarkMode,
  activeTab,
  setActiveTab,
  onReplaySplash,
}) => {
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
    <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#07090e]/95 backdrop-blur-xl shadow-lg transition-colors">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 sm:h-18 flex items-center justify-between gap-3">
        {/* Brand & Tagline */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-slate-900 via-[#0c1628] to-cyan-950/70 flex items-center justify-center text-cyan-400 border border-cyan-500/30 shadow-glow-cyan-sm">
            <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-400 drop-shadow-[0_0_8px_rgba(0,240,255,0.7)]" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#07090e] animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1
                className="text-base sm:text-lg font-black tracking-wider text-white uppercase"
                style={{ fontFamily: "'Orbitron', sans-serif" }}
              >
                Venture <span className="text-cyan-400">Automation</span>
              </h1>
            </div>
            <div className="flex items-center gap-2 text-[10px] sm:text-[11px] font-mono tracking-widest text-cyan-300/80 uppercase font-semibold">
              <span>Extract and Build</span>
              <span className="hidden sm:inline text-slate-600">•</span>
              <span className="hidden sm:inline text-slate-400 font-normal">Automotive Intelligence</span>
            </div>
          </div>
        </div>

        {/* Center Cockpit Instrument Cluster Navigation */}
        <nav className="hidden lg:flex items-center gap-1 p-1 bg-slate-900/90 rounded-xl border border-slate-800/90 text-xs font-semibold">
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all duration-150 ${
                  isActive
                    ? 'bg-gradient-to-r from-cyan-950/80 to-slate-900 text-cyan-300 border border-cyan-500/40 shadow-glow-cyan-sm font-bold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
                <span>{t.label}</span>
                {t.badge && (
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded-md font-mono uppercase tracking-wider ${
                      isActive
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {t.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Right Controls: Replay Splash & Theme */}
        <div className="flex items-center gap-2">
          {onReplaySplash && (
            <button
              onClick={onReplaySplash}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 border border-slate-800 hover:border-cyan-500/40 transition-all text-xs font-mono font-semibold"
              title="Replay Venture Automation Startup Sequence"
            >
              <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Startup HUD</span>
            </button>
          )}

          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-lg text-slate-400 hover:text-white bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 transition-colors"
            title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label="Toggle theme"
          >
            {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-cyan-400" />}
          </button>
        </div>
      </div>

      {/* Mobile Device Browser Tab Navigation Bar */}
      <div className="lg:hidden flex items-center justify-start border-t border-slate-800/80 px-2 py-2 bg-[#07090e]/95 text-xs font-semibold overflow-x-auto no-scrollbar gap-1.5 safe-bottom">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg whitespace-nowrap min-h-[40px] text-xs transition-all ${
                isActive
                  ? 'bg-cyan-950/70 text-cyan-300 border border-cyan-500/40 shadow-glow-cyan-sm font-bold'
                  : 'text-slate-400 hover:text-white bg-slate-900/40'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>
    </header>
  );
};

