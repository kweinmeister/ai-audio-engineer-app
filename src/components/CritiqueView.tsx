/**
 * Render the acoustic diagnostic critique view, displaying high-frequency hiss,
 * low-frequency hum, saturation clipping, dynamic range variance, and engineer summary.
 */

import { ShieldAlert } from "lucide-react";
import type { AudioCritique } from "../types";

export interface CritiqueViewProps {
  critique: AudioCritique | null;
}

export function CritiqueView({ critique }: CritiqueViewProps) {
  if (!critique) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center text-slate-600 font-mono select-none">
        <ShieldAlert size={26} className="text-slate-700 mb-2" />
        <p className="text-xs tracking-wider uppercase">NO ANALYTICAL DATA FOUND</p>
        <p className="text-[10px] text-slate-500 font-sans mt-0.5 leading-relaxed">
          Submit raw audio. Gemini will generate deep diagnostic feedback on high-frequency hiss,
          humming resonances, clipping thresholds, and vocal focus ranges.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div
          className="p-3 bg-[#111721] border border-slate-800 rounded-xl"
          data-testid="critique-hiss"
        >
          <span className="text-[10px] font-mono text-cyan-400 font-bold tracking-wider block mb-1 uppercase">
            ⚡ Tone & Tape Hiss
          </span>
          <p className="text-xs text-slate-300 leading-relaxed font-sans">{critique.hiss}</p>
        </div>

        <div
          className="p-3 bg-[#111721] border border-slate-800 rounded-xl"
          data-testid="critique-hum"
        >
          <span className="text-[10px] font-mono text-emerald-400 font-bold tracking-wider block mb-1 uppercase">
            🔊 Low Hum Resonances
          </span>
          <p className="text-xs text-slate-300 leading-relaxed font-sans">{critique.hum}</p>
        </div>

        <div
          className="p-3 bg-[#111721] border border-slate-800 rounded-xl"
          data-testid="critique-clipping"
        >
          <span className="text-[10px] font-mono text-rose-400 font-bold tracking-wider block mb-1 uppercase">
            🚨 Saturation & Clipping
          </span>
          <p className="text-xs text-slate-300 leading-relaxed font-sans">{critique.clipping}</p>
        </div>

        <div
          className="p-3 bg-[#111721] border border-slate-800 rounded-xl"
          data-testid="critique-dynamics"
        >
          <span className="text-[10px] font-mono text-indigo-400 font-bold tracking-wider block mb-1 uppercase">
            📊 Sound Stage Dynamics
          </span>
          <p className="text-xs text-slate-300 leading-relaxed font-sans">
            {critique.dynamicRange}
          </p>
        </div>
      </div>

      <div
        className="p-3.5 bg-slate-900/45 border border-slate-800/80 rounded-xl text-xs flex gap-2"
        data-testid="critique-summary"
      >
        <span className="text-indigo-400 font-bold font-mono shrink-0">Engineer Summary:</span>
        <p className="text-slate-300 leading-relaxed font-sans">{critique.generalComments}</p>
      </div>
    </div>
  );
}
