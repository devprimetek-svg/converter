import React, { useState, useEffect } from 'react';
import { Gauge, Zap, ChevronRight, CheckCircle2 } from 'lucide-react';

interface SplashScreenProps {
  onComplete: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  const [rpmPct, setRpmPct] = useState<number>(0);
  const [currentStage, setCurrentStage] = useState<number>(0);
  const [isFadingOut, setIsFadingOut] = useState<boolean>(false);

  const stages = [
    'CALIBRATING TELEMETRY SENSORS',
    'PARSER ENGINE SYNCHRONIZED',
    'WATERMARK & RESIZE CORES ARMED',
    'ENGINES PRIMED • LAUNCH READY',
  ];

  useEffect(() => {
    // RPM dial sweep animation
    const startTime = performance.now();
    const duration = 2400; // 2.4s total animation

    const animateSweep = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Non-linear tachometer rev acceleration (ease-out-cubic with slight rev-bounce)
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      setRpmPct(Math.round(easeProgress * 100));

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
        // Complete sweep, pause briefly then fade out
        setTimeout(() => {
          triggerExit();
        }, 350);
      }
    };

    const frameId = requestAnimationFrame(animateSweep);
    return () => cancelAnimationFrame(frameId);
  }, []);

  const triggerExit = () => {
    setIsFadingOut(true);
    setTimeout(() => {
      onComplete();
    }, 600);
  };

  // SVG Gauge calculations
  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (rpmPct / 100) * (circumference * 0.666);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-between bg-[#07090e] bg-carbon-pattern text-slate-100 select-none overflow-hidden px-4 py-8 safe-top safe-bottom safe-left safe-right transition-opacity duration-600 ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* Top HUD Telemetry Bar */}
      <div className="w-full max-w-5xl flex items-center justify-between text-[11px] font-mono tracking-widest text-slate-500 uppercase px-2 pt-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          <span className="text-cyan-400 font-bold">SYS.INIT // v2.6.4</span>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-slate-400">
          <span>THROTTLE: {(rpmPct * 1.1).toFixed(0)}%</span>
          <span>•</span>
          <span>LATENCY: 12ms</span>
          <span>•</span>
          <span className="text-emerald-400">ONLINE</span>
        </div>
        <button
          onClick={triggerExit}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800/80 transition-all text-xs font-semibold"
        >
          <span>Skip</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Center Stage: Tachometer HUD & Brand Reveal */}
      <div className="relative flex flex-col items-center justify-center my-auto w-full max-w-lg text-center space-y-6">
        {/* Dynamic Neon Background Halo */}
        <div className="absolute -inset-10 bg-radial from-cyan-500/15 via-transparent to-transparent blur-3xl pointer-events-none" />

        {/* Tachometer RPM Gauge Ring */}
        <div className="relative w-48 h-48 sm:w-56 sm:h-56 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 200 200">
            {/* Background Arc */}
            <circle
              cx="100"
              cy="100"
              r={radius}
              stroke="rgba(30, 41, 59, 0.7)"
              strokeWidth="10"
              strokeDasharray={circumference * 0.666}
              strokeDashoffset="0"
              fill="transparent"
              strokeLinecap="round"
            />
            {/* Active Cyan Sweep Arc */}
            <circle
              cx="100"
              cy="100"
              r={radius}
              stroke="url(#rpmGradient)"
              strokeWidth="10"
              strokeDasharray={circumference * 0.666}
              strokeDashoffset={strokeDashoffset}
              fill="transparent"
              strokeLinecap="round"
              className="transition-all duration-75"
            />
            <defs>
              <linearGradient id="rpmGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00f0ff" />
                <stop offset="70%" stopColor="#06b6d4" />
                <stop offset="100%" stopColor="#f59e0b" />
              </linearGradient>
            </defs>
          </svg>

          {/* Central Speedometer Emblem */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-slate-900 via-[#0b1322] to-cyan-950/40 border border-cyan-500/40 flex items-center justify-center shadow-glow-cyan-sm animate-gauge-pulse">
              <Zap className="w-8 h-8 sm:w-10 sm:h-10 text-cyan-400 drop-shadow-[0_0_12px_rgba(0,240,255,0.8)]" />
            </div>
            <div className="mt-2 font-mono text-xs sm:text-sm font-bold text-cyan-400 tracking-wider">
              {rpmPct}% RPM
            </div>
          </div>
        </div>

        {/* Brand Typography */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 text-[11px] font-mono tracking-widest uppercase">
            <Gauge className="w-3 h-3 text-cyan-400 animate-spin" />
            Automotive Intelligence Core
          </div>

          <h1
            className="text-3xl sm:text-5xl font-black tracking-wider uppercase text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.2)]"
            style={{ fontFamily: "'Orbitron', sans-serif" }}
          >
            Venture{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-300 to-amber-400">
              Automation
            </span>
          </h1>

          <div className="flex items-center justify-center gap-3 pt-1">
            <span className="h-[1px] w-8 sm:w-12 bg-gradient-to-r from-transparent to-cyan-500/80" />
            <p className="text-xs sm:text-sm font-mono uppercase tracking-[0.28em] font-semibold text-cyan-300 drop-shadow-[0_0_10px_rgba(0,240,255,0.6)]">
              Extract and Build
            </p>
            <span className="h-[1px] w-8 sm:w-12 bg-gradient-to-l from-transparent to-cyan-500/80" />
          </div>
        </div>

        {/* Live Diagnostics Progress Bar */}
        <div className="w-full max-w-sm mx-auto space-y-2.5 pt-2">
          <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
            <div
              className="h-full bg-gradient-to-r from-cyan-400 via-sky-400 to-amber-400 transition-all duration-100 ease-out"
              style={{ width: `${rpmPct}%` }}
            />
          </div>

          <div className="flex items-center justify-center gap-2 text-xs font-mono text-slate-400">
            <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span className="tracking-wider">{stages[currentStage]}</span>
          </div>
        </div>

        {/* Cockpit Ignition Action */}
        <div className="pt-4">
          <button
            onClick={triggerExit}
            className="group relative inline-flex items-center gap-2.5 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs sm:text-sm uppercase tracking-widest shadow-glow-cyan transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
            style={{ fontFamily: "'Orbitron', sans-serif" }}
          >
            <span>Enter Cockpit</span>
            <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </button>
        </div>
      </div>

      {/* Bottom Telemetry Footer */}
      <div className="w-full max-w-5xl flex items-center justify-between text-[11px] font-mono text-slate-600 border-t border-slate-900/80 pt-4 px-2">
        <span>DEVPRIMETEK AUTOMOTIVE ENGINE</span>
        <span className="hidden sm:inline">HIGH-SPEED MATRIX DEPLOYED</span>
        <span>© 2026 VENTURE AUTOMATION</span>
      </div>
    </div>
  );
};
