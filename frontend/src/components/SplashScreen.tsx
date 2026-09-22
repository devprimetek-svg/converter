import React, { useState, useEffect } from 'react';
import { Zap, ChevronRight, Check } from 'lucide-react';

interface SplashScreenProps {
  onComplete: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  const [progressPct, setProgressPct] = useState<number>(0);
  const [currentStage, setCurrentStage] = useState<number>(0);
  const [isFadingOut, setIsFadingOut] = useState<boolean>(false);

  const stages = [
    'SYSTEM INITIALIZING',
    'PARSER ENGINE SYNCHRONIZED',
    'IMAGE & WATERMARK CORES READY',
    'VENTURE ENGINE ONLINE',
  ];

  useEffect(() => {
    const startTime = performance.now();
    const duration = 2200; // 2.2s clean animation

    const animateSweep = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      setProgressPct(Math.round(easeProgress * 100));

      if (progress < 0.28) {
        setCurrentStage(0);
      } else if (progress < 0.58) {
        setCurrentStage(1);
      } else if (progress < 0.88) {
        setCurrentStage(2);
      } else {
        setCurrentStage(3);
      }

      if (progress < 1) {
        requestAnimationFrame(animateSweep);
      } else {
        setTimeout(() => {
          triggerExit();
        }, 300);
      }
    };

    const frameId = requestAnimationFrame(animateSweep);
    return () => cancelAnimationFrame(frameId);
  }, []);

  const triggerExit = () => {
    setIsFadingOut(true);
    setTimeout(() => {
      onComplete();
    }, 500);
  };

  const radius = 72;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progressPct / 100) * circumference;

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-between bg-black text-white select-none overflow-hidden px-4 py-8 safe-top safe-bottom safe-left safe-right transition-opacity duration-500 ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Top Header */}
      <div className="w-full max-w-4xl flex items-center justify-between text-[11px] font-mono tracking-widest text-zinc-500 uppercase px-2 pt-2">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-white" />
          <span className="text-zinc-400 font-semibold">VENTURE // v2.6</span>
        </div>
        <button
          onClick={triggerExit}
          className="flex items-center gap-1 px-3 py-1 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 transition-all text-xs font-mono"
        >
          <span>Skip</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Center Stage: Minimalist Monochrome Gauge & Brand */}
      <div className="relative flex flex-col items-center justify-center my-auto w-full max-w-md text-center space-y-7">
        {/* Minimal Circular Progress Indicator */}
        <div className="relative w-44 h-44 sm:w-48 sm:h-48 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 180 180">
            {/* Background Track */}
            <circle
              cx="90"
              cy="90"
              r={radius}
              stroke="#27272a"
              strokeWidth="4"
              fill="transparent"
            />
            {/* Active Monochrome White Progress Arc */}
            <circle
              cx="90"
              cy="90"
              r={radius}
              stroke="#ffffff"
              strokeWidth="4"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              fill="transparent"
              strokeLinecap="round"
              className="transition-all duration-75"
            />
          </svg>

          {/* Central Minimalist Badge */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="w-14 h-14 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-center shadow-sm">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div className="mt-2 font-mono text-xs font-semibold text-zinc-400 tracking-wider">
              {progressPct}%
            </div>
          </div>
        </div>

        {/* Brand Typography */}
        <div className="space-y-2">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-wider uppercase text-white font-sans">
            Venture <span className="font-light text-zinc-400">Automation</span>
          </h1>

          <div className="flex items-center justify-center gap-3 pt-1">
            <span className="h-[1px] w-6 bg-zinc-800" />
            <p className="text-xs font-mono uppercase tracking-[0.28em] font-medium text-zinc-400">
              Extract and Build
            </p>
            <span className="h-[1px] w-6 bg-zinc-800" />
          </div>
        </div>

        {/* Minimal Progress Bar */}
        <div className="w-full max-w-xs mx-auto space-y-3">
          <div className="h-1 w-full bg-zinc-900 rounded-full overflow-hidden border border-zinc-900">
            <div
              className="h-full bg-white transition-all duration-100 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <div className="flex items-center justify-center gap-2 text-xs font-mono text-zinc-400">
            <Check className="w-3.5 h-3.5 text-white" />
            <span className="tracking-wider">{stages[currentStage]}</span>
          </div>
        </div>

        {/* Action Button */}
        <div className="pt-2">
          <button
            onClick={triggerExit}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-white hover:bg-zinc-200 text-black font-bold text-xs uppercase tracking-widest transition-all duration-150 active:scale-95"
          >
            <span>Enter</span>
            <ChevronRight className="w-3.5 h-3.5 text-black" />
          </button>
        </div>
      </div>

      {/* Bottom Footer */}
      <div className="w-full max-w-4xl flex items-center justify-between text-[11px] font-mono text-zinc-600 border-t border-zinc-900 pt-4 px-2">
        <span>VENTURE AUTOMATION</span>
        <span>EXTRACT AND BUILD</span>
        <span>2026</span>
      </div>
    </div>
  );
};
