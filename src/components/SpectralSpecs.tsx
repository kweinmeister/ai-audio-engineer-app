/**
 * Render scientific client-side acoustic statistics including quality score,
 * peak volume, RMS loudness, noise floor, clipping indicators, and frequency peaks.
 */

import { Activity } from "lucide-react";
import type { AudioFeatures } from "../types";

export interface SpectralSpecsProps {
  features: AudioFeatures | null;
  score?: number | null;
}

function getScoreColor(score: number | null | undefined): string {
  if (score === null || score === undefined) return "text-slate-400";
  if (score >= 75) return "text-emerald-400";
  if (score >= 50) return "text-amber-400";
  return "text-rose-400";
}

export function SpectralSpecs({ features, score }: SpectralSpecsProps) {
  const scoreColor = getScoreColor(score);

  return (
    <div
      id="raw-acoustics-diagnostics"
      className="col-span-12 md:col-span-4 bg-[#0b0f15] border border-slate-800 rounded-2xl p-6 flex flex-col justify-between shadow-md"
    >
      <div>
        <h2 className="text-lg font-mono font-bold text-white flex items-center gap-2 mb-4">
          <Activity size={18} className="text-emerald-400" />
          SAMPLED SPECTRAL SPECS
        </h2>
        <p className="text-[11px] text-slate-400 mt-1 leading-relaxed font-sans mb-4">
          These statistical parameters represent scientific client-side acoustic properties parsed
          directly from decoded buffer arrays in your local context.
        </p>

        {features ? (
          <div className="space-y-4">
            {/* Audio Health Gauge */}
            <div className="p-3 bg-slate-900/60 border border-slate-800/60 rounded-xl">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[11px] font-mono text-slate-400 uppercase">
                  QUALITY SCORE
                </span>
                <span
                  className={`text-sm font-mono font-bold ${scoreColor}`}
                  data-testid="score-readout"
                >
                  {score !== null && score !== undefined ? `${score}/100` : "TBD"}
                </span>
              </div>
              <div className="w-full bg-[#121822] h-2 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-red-500 via-amber-400 to-emerald-400 h-full transition-all duration-300"
                  style={{ width: `${score ?? 0}%` }}
                />
              </div>
              <p className="text-[8px] text-slate-500 font-mono mt-1">
                Calculated via acoustic noise density & gain balance ratios.
              </p>
            </div>

            {/* DB Level Gauges */}
            <div className="space-y-2.5">
              {/* Maximum volume */}
              <div>
                <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-0.5">
                  <span>Peak Volume (dBFS)</span>
                  <span
                    className={
                      features.maxVolumeDb > -1.5 ? "text-rose-400 font-semibold" : "text-slate-200"
                    }
                    data-testid="peak-volume-readout"
                  >
                    {features.maxVolumeDb.toFixed(1)} dBFS
                  </span>
                </div>
                <div className="w-full bg-[#121822] h-1.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${features.maxVolumeDb > -1.5 ? "bg-rose-500" : "bg-cyan-500"}`}
                    style={{ width: `${Math.max(0, 100 + features.maxVolumeDb)}%` }}
                  />
                </div>
              </div>

              {/* Average dynamic loudness */}
              <div>
                <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-0.5">
                  <span>Average RMS Loudness</span>
                  <span className="text-slate-200 font-mono" data-testid="avg-loudness-readout">
                    {features.avgVolumeDb.toFixed(1)} dBFS
                  </span>
                </div>
                <div className="w-full bg-[#121822] h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-indigo-500 h-full"
                    style={{ width: `${Math.max(0, 100 + features.avgVolumeDb)}%` }}
                  />
                </div>
              </div>

              {/* Noise Floor */}
              <div>
                <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-0.5">
                  <span>Estimated Backdrop Noise Floor</span>
                  <span
                    className={
                      features.estimatedNoiseFloorDb > -45 ? "text-amber-400" : "text-emerald-400"
                    }
                    data-testid="noise-floor-readout"
                  >
                    {features.estimatedNoiseFloorDb.toFixed(1)} dBFS
                  </span>
                </div>
                <div className="w-full bg-[#121822] h-1.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${features.estimatedNoiseFloorDb > -45 ? "bg-amber-500" : "bg-emerald-500"}`}
                    style={{
                      width: `${Math.max(0, 100 + features.estimatedNoiseFloorDb)}%`,
                    }}
                  />
                </div>
              </div>

              {/* Clipping indicator */}
              <div className="flex items-center justify-between p-2.5 bg-[#121822] border border-slate-800 rounded-lg">
                <span className="text-[10px] font-mono text-slate-400 uppercase">
                  Digital Clipping Detected:
                </span>
                <span
                  className={`px-2 py-0.5 font-mono text-[9px] rounded font-bold uppercase border ${
                    features.clippingDetected
                      ? "bg-rose-950/40 text-rose-300 border-rose-950 animate-pulse"
                      : "bg-emerald-950/40 text-emerald-300 border-emerald-950"
                  }`}
                  data-testid="clipping-badge"
                >
                  {features.clippingDetected ? "CLIPPING WARNING" : "SAFE / BALANCED"}
                </span>
              </div>

              {/* Identified peaks */}
              <div>
                <span className="text-[9px] text-slate-500 font-mono uppercase tracking-wider block mb-1">
                  Identified Frequency Resonance Peak Bands
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {features.frequencyPeaks.map((peak) => (
                    <span
                      key={peak}
                      className="px-2 py-0.5 bg-[#121822] border border-slate-800 text-[10px] font-mono rounded text-slate-300"
                    >
                      {peak} Hz
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-8 border border-dashed border-slate-800 rounded-xl bg-slate-950/40 text-center min-h-[180px]">
            <Activity size={24} className="text-slate-700 mb-2" />
            <p className="text-[10px] font-mono text-slate-600 tracking-wider">
              SPECS RACK STANDBY
            </p>
            <p className="text-[9px] text-slate-600 font-sans leading-relaxed mt-0.5">
              Statistical measurements will render here dynamically.
            </p>
          </div>
        )}
      </div>

      <div className="border-t border-slate-900 pt-4 mt-4">
        <span className="text-[9px] font-mono font-bold text-slate-500 tracking-wide block mb-1 uppercase">
          Sample Hardware Constraints
        </span>
        <div className="flex justify-between text-[10px] font-mono text-slate-400">
          <span>Sample Rate</span>
          <span>{features ? `${features.sampleRate} Hz` : "44100 Hz Reference"}</span>
        </div>
        <div className="flex justify-between text-[10px] font-mono text-slate-400 mt-1">
          <span>Total Duration</span>
          <span>{features ? `${features.duration.toFixed(2)}s` : "0.00s"}</span>
        </div>
      </div>
    </div>
  );
}
