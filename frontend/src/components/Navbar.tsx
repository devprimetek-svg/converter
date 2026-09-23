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
  Tag,
} from 'lucide-react';

export type ActiveTab = 'auto-pipeline' | 'catalogue' | 'meta-generator' | 'pdf-images' | 'resizer' | 'watermark';

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
      id: 'meta-generator' as ActiveTab,
      label: 'SEO & Metadata',
      icon: Tag,
      badge: 'New',
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
        <nav className="hidden lg:flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-medium">
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all duration-150 ${
                  isActive
                    ? 'bg-black text-white dark:bg-white dark:text-black font-bold shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-200/70 dark:hover:bg-zinc-900'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white dark:text-black' : 'text-zinc-500 dark:text-zinc-400'}`} />
                <span>{t.label}</span>
                {t.badge && (
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded-md font-mono uppercase tracking-wider ${
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

        {/* Right Controls: Replay Splash & Theme Toggle */}
        <div className="flex items-center gap-2">
          {onReplaySplash && (
            <button
              onClick={onReplaySplash}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-950 hover:bg-zinc-200 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all text-xs font-mono font-medium"
              title="Replay Venture Automation Startup Screen"
            >
              <RotateCcw className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-300" />
              <span className="hidden sm:inline">Splash</span>
            </button>
          )}

          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white bg-zinc-100 dark:bg-zinc-950 hover:bg-zinc-200 dark:hover:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors cursor-pointer"
            title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label="Toggle theme"
          >
            {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-zinc-700" />}
          </button>
        </div>
      </div>

      {/* Mobile Device Browser Tab Navigation Bar */}
      <div className="lg:hidden flex items-center justify-start border-t border-zinc-200 dark:border-zinc-800/80 px-2 py-2 bg-white dark:bg-black text-xs font-medium overflow-x-auto no-scrollbar gap-1.5 safe-bottom">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg whitespace-nowrap min-h-[40px] text-xs transition-all ${
                isActive
                  ? 'bg-black text-white dark:bg-white dark:text-black font-bold shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white bg-zinc-100 dark:bg-zinc-950'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white dark:text-black' : 'text-zinc-500 dark:text-zinc-400'}`} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>
    </header>
  );
};

