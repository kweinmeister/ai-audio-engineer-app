/**
 * Render hardware-style DSP mastering rack controls, including bypass toggle,
 * makeup gain, filter cutoffs, 3-band parametric EQ, and dynamics compressor.
 */

import { Download, Sliders, ToggleLeft, ToggleRight, Undo2 } from "lucide-react";
import type { MasteringPlan } from "../types";

export interface StudioRackProps {
  masteringPlan: MasteringPlan;
  onPlanChange: (updated: MasteringPlan) => void;
  isDspActive: boolean;
  onToggleDsp: () => void;
  disabled?: boolean;
  onResetToAi?: () => void;
  hasAiPlan?: boolean;
  onExportMaster?: () => void;
}

export function StudioRack({
  masteringPlan,
  onPlanChange,
  isDspActive,
  onToggleDsp,
  disabled = false,
  onResetToAi,
  hasAiPlan = false,
  onExportMaster,
}: StudioRackProps) {
  const updateField = <K extends keyof MasteringPlan>(key: K, value: MasteringPlan[K]) => {
    onPlanChange({
      ...masteringPlan,
      [key]: value,
    });
  };

  const updateEqGain = (band: "bass" | "mid" | "treble", gain: number) => {
    onPlanChange({
      ...masteringPlan,
      eq: {
        ...masteringPlan.eq,
        [band]: {
          ...masteringPlan.eq[band],
          gain,
        },
      },
    });
  };

  return (
    <div className="bg-[#0b0e14] border border-slate-800/80 rounded-2xl p-5 shadow-2xl relative overflow-hidden flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-4">
          <div className="flex items-center gap-2">
            <Sliders size={18} className="text-cyan-400" />
            <h2 className="text-xs font-mono font-bold tracking-widest text-slate-200 uppercase">
              Analog Hardware Rack Emulation
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {hasAiPlan && onResetToAi && (
              <button
                type="button"
                onClick={onResetToAi}
                className="text-[10px] font-mono flex items-center gap-1 text-slate-400 hover:text-cyan-300 transition-colors px-2 py-1 bg-slate-900 border border-slate-800 rounded-md"
                title="Reset sliders back to AI recommended targets"
              >
                <Undo2 size={12} />
                Reset
              </button>
            )}

            {onExportMaster && (
              <button
                type="button"
                onClick={onExportMaster}
                disabled={disabled}
                className="text-[10px] font-mono font-bold flex items-center gap-1 text-slate-300 hover:text-cyan-300 transition px-2.5 py-1 bg-cyan-950/40 hover:bg-cyan-900/40 border border-cyan-800/60 rounded-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title="Export mastered audio as lossless WAV"
                id="rack-export-master-btn"
              >
                <Download size={12} className="text-cyan-400" />
                Export
              </button>
            )}

            <button
              type="button"
              onClick={onToggleDsp}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-bold transition-all ${
                isDspActive
                  ? "bg-cyan-500/10 border border-cyan-500/40 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.2)]"
                  : "bg-amber-500/10 border border-amber-500/40 text-amber-300"
              }`}
              disabled={disabled}
            >
              {isDspActive ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
              {isDspActive ? "MASTERING ON" : "BYPASS (RAW)"}
            </button>
          </div>
        </div>

        {/* Hardware Fader Layout Stack */}
        <div className="space-y-4">
          {/* Makeup Gain Slider */}
          <div className="p-3 bg-[#0f141c]/60 border border-slate-800/60 rounded-xl">
            <div className="flex justify-between items-center text-xs font-mono mb-1">
              <span className="text-slate-300 font-bold">Makeup Gain</span>
              <span className="text-cyan-400 font-bold" data-testid="gain-readout">
                {masteringPlan.gainDb > 0 ? "+" : ""}
                {masteringPlan.gainDb.toFixed(1)} dB
              </span>
            </div>
            <input
              type="range"
              min="-12"
              max="12"
              step="0.5"
              aria-label="Makeup Gain"
              value={masteringPlan.gainDb}
              onChange={(e) => updateField("gainDb", Number.parseFloat(e.target.value))}
              className="w-full text-cyan-400 accent-cyan-500 h-1 bg-slate-900 rounded-lg cursor-pointer"
              disabled={disabled}
            />
            <p className="text-[9px] text-slate-500 mt-1">
              Raises target amplitude floor after dynamic cuts.
            </p>
          </div>

          {/* Sub Rumble Cut & Hiss Cut Filters */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-[#0f141c]/60 border border-slate-800/60 rounded-xl">
              <div className="flex justify-between items-center text-xs font-mono mb-1">
                <span className="text-slate-300 text-[11px]">HPF Low-Cut</span>
                <span className="text-indigo-400 text-[10px]" data-testid="hpf-readout">
                  {masteringPlan.highpassHz === 0 ? "Off (Flat)" : `${masteringPlan.highpassHz} Hz`}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="180"
                step="5"
                aria-label="HPF Low-Cut"
                value={masteringPlan.highpassHz}
                onChange={(e) => updateField("highpassHz", Number.parseInt(e.target.value, 10))}
                className="w-full accent-indigo-500 h-1 bg-slate-900 rounded-lg cursor-pointer"
                disabled={disabled}
              />
              <p className="text-[8px] text-slate-500 mt-0.5">Clears low-end sub mud rumble.</p>
            </div>

            <div className="p-3 bg-[#0f141c]/60 border border-slate-800/60 rounded-xl">
              <div className="flex justify-between items-center text-xs font-mono mb-1">
                <span className="text-slate-300 text-[11px]">LPF High-Cut</span>
                <span className="text-indigo-400 text-[10px]" data-testid="lpf-readout">
                  {masteringPlan.lowpassHz >= 20000
                    ? "Off (20 kHz)"
                    : `${masteringPlan.lowpassHz} Hz`}
                </span>
              </div>
              <input
                type="range"
                min="3000"
                max="20000"
                step="200"
                aria-label="LPF High-Cut"
                value={masteringPlan.lowpassHz}
                onChange={(e) => updateField("lowpassHz", Number.parseInt(e.target.value, 10))}
                className="w-full accent-indigo-500 h-1 bg-slate-900 rounded-lg cursor-pointer"
                disabled={disabled}
              />
              <p className="text-[8px] text-slate-500 mt-0.5">Cleans high-frequency tape hiss.</p>
            </div>
          </div>

          {/* 3-Band Parametric Equalizer Section */}
          <div className="p-3.5 bg-[#0f141c]/60 border border-slate-800/60 rounded-xl">
            <span className="text-[10px] font-mono font-bold text-indigo-300 uppercase tracking-wider block mb-2">
              Parametric Equalizer
            </span>
            <div className="space-y-2.5">
              {/* Bass band */}
              <div className="flex items-center gap-3">
                <span className="w-16 text-[10px] text-slate-400 font-mono">
                  Bass ({masteringPlan.eq.bass.hz}Hz)
                </span>
                <input
                  type="range"
                  min="-9"
                  max="9"
                  step="0.5"
                  aria-label="Bass Gain"
                  value={masteringPlan.eq.bass.gain}
                  onChange={(e) => updateEqGain("bass", Number.parseFloat(e.target.value))}
                  className="flex-1 accent-emerald-500 h-1 bg-slate-900 rounded-lg cursor-pointer"
                  disabled={disabled}
                />
                <span
                  className="w-12 text-right text-[10px] font-mono text-emerald-400 font-bold"
                  data-testid="bass-readout"
                >
                  {masteringPlan.eq.bass.gain > 0 ? "+" : ""}
                  {masteringPlan.eq.bass.gain.toFixed(1)} dB
                </span>
              </div>

              {/* Mid band */}
              <div className="flex items-center gap-3">
                <span className="w-16 text-[10px] text-slate-400 font-mono">
                  Mids ({masteringPlan.eq.mid.hz}Hz)
                </span>
                <input
                  type="range"
                  min="-9"
                  max="9"
                  step="0.5"
                  aria-label="Mid Gain"
                  value={masteringPlan.eq.mid.gain}
                  onChange={(e) => updateEqGain("mid", Number.parseFloat(e.target.value))}
                  className="flex-1 accent-blue-500 h-1 bg-slate-900 rounded-lg cursor-pointer"
                  disabled={disabled}
                />
                <span
                  className="w-12 text-right text-[10px] font-mono text-blue-400 font-bold"
                  data-testid="mid-readout"
                >
                  {masteringPlan.eq.mid.gain > 0 ? "+" : ""}
                  {masteringPlan.eq.mid.gain.toFixed(1)} dB
                </span>
              </div>

              {/* Treble band */}
              <div className="flex items-center gap-3">
                <span className="w-16 text-[10px] text-slate-400 font-mono">
                  Treble ({masteringPlan.eq.treble.hz}Hz)
                </span>
                <input
                  type="range"
                  min="-9"
                  max="9"
                  step="0.5"
                  aria-label="Treble Gain"
                  value={masteringPlan.eq.treble.gain}
                  onChange={(e) => updateEqGain("treble", Number.parseFloat(e.target.value))}
                  className="flex-1 accent-cyan-500 h-1 bg-slate-900 rounded-lg cursor-pointer"
                  disabled={disabled}
                />
                <span
                  className="w-12 text-right text-[10px] font-mono text-cyan-400 font-bold"
                  data-testid="treble-readout"
                >
                  {masteringPlan.eq.treble.gain > 0 ? "+" : ""}
                  {masteringPlan.eq.treble.gain.toFixed(1)} dB
                </span>
              </div>
            </div>
          </div>

          {/* Dynamic Range Compressor */}
          <div className="p-3 bg-[#0f141c]/60 border border-slate-800/60 rounded-xl">
            <div className="flex justify-between items-center text-xs font-mono mb-1.5">
              <span className="text-slate-300 font-semibold text-[11px]">Dynamics Compressor</span>
              <span className="text-amber-400 text-[10px]" data-testid="compressor-ratio-readout">
                {masteringPlan.compressorRatio <= 1.0
                  ? "Bypass (1.0:1)"
                  : `Ratio: ${masteringPlan.compressorRatio.toFixed(1)}:1`}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-1">
              <div>
                <label
                  htmlFor="rack-compressor-threshold"
                  className="text-[9px] text-slate-500 font-mono"
                >
                  Threshold (dB)
                </label>
                <input
                  type="range"
                  min="-50"
                  max="0"
                  step="1"
                  id="rack-compressor-threshold"
                  aria-label="Compressor Threshold"
                  value={masteringPlan.compressorThreshold}
                  onChange={(e) =>
                    updateField("compressorThreshold", Number.parseFloat(e.target.value))
                  }
                  className="w-full accent-amber-500 h-1 bg-slate-900 rounded-lg mt-1 cursor-pointer"
                  disabled={disabled || masteringPlan.compressorRatio <= 1.0}
                />
                <span className="text-[10px] text-slate-400 font-mono block mt-0.5 text-right">
                  {masteringPlan.compressorThreshold} dB
                </span>
              </div>

              <div>
                <label
                  htmlFor="rack-compressor-ratio"
                  className="text-[9px] text-slate-500 font-mono"
                >
                  Compressor Ratio
                </label>
                <input
                  type="range"
                  min="1.0"
                  max="20.0"
                  step="0.5"
                  id="rack-compressor-ratio"
                  aria-label="Compressor Ratio"
                  value={masteringPlan.compressorRatio}
                  onChange={(e) =>
                    updateField("compressorRatio", Number.parseFloat(e.target.value))
                  }
                  className="w-full accent-amber-500 h-1 bg-slate-900 rounded-lg mt-1 cursor-pointer"
                  disabled={disabled}
                />
                <span className="text-[10px] text-slate-400 font-mono block mt-0.5 text-right">
                  {masteringPlan.compressorRatio <= 1.0
                    ? "Bypass"
                    : `${masteringPlan.compressorRatio.toFixed(1)}:1`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[#121822] border border-slate-800 rounded-xl p-3.5 mt-4">
        <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-widest block mb-1">
          Active Plan Synthesis Notes
        </span>
        <p
          className="text-[10px] text-slate-300 leading-relaxed font-mono"
          data-testid="plan-description-readout"
        >
          {masteringPlan.planDescription}
        </p>
      </div>
    </div>
  );
}
