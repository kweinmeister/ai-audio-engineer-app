/**
 * Studio master audio bounce & export modal.
 *
 * Renders an accessible, pro-audio dialog allowing users to configure
 * PCM bit depth (24-bit studio vs 16-bit dithered CD), toggle DSP mastering,
 * set EBU/AES True Peak ceiling normalization, and instantly download the WAV master.
 */

import { AlertCircle, Check, Disc3, Download, Loader2, Sliders, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import {
  encodeWav,
  formatWavSizeEstimate,
  renderOfflineMasteredAudio,
  triggerBlobDownload,
} from "../lib/audioExport";
import { formatSecs } from "../lib/format";
import type { MasteringPlan } from "../types";

export interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  audioBuffer: AudioBuffer | null;
  masteringPlan: MasteringPlan;
  originalFileName?: string;
  defaultDspActive?: boolean;
}

export function ExportModal({
  isOpen,
  onClose,
  audioBuffer,
  masteringPlan,
  originalFileName = "master-output",
  defaultDspActive = true,
}: ExportModalProps) {
  const [bitDepth, setBitDepth] = useState<16 | 24>(24);
  const [applyDsp, setApplyDsp] = useState<boolean>(defaultDspActive);
  const [ceilingPreset, setCeilingPreset] = useState<"streaming" | "cd" | "raw">("streaming");
  const [customFileName, setCustomFileName] = useState<string>("");
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [renderStatus, setRenderStatus] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  const titleId = useId();
  const descId = useId();
  const normSelectId = useId();
  const filenameInputId = useId();

  // Reset or initialize default filename when modal opens
  useEffect(() => {
    if (isOpen) {
      const baseName = originalFileName.replace(/\.[^/.]+$/, "");
      setCustomFileName(`${baseName}-mastered.wav`);
      setApplyDsp(defaultDspActive);
      setErrorMessage(null);
      setSuccess(false);
      setIsRendering(false);
    }
  }, [isOpen, originalFileName, defaultDspActive]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isRendering) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isRendering, onClose]);

  if (!isOpen || !audioBuffer) return null;

  const durationSec = audioBuffer.duration;
  const sampleRate = audioBuffer.sampleRate;
  const numChannels = audioBuffer.numberOfChannels;
  const sizeEstimate = formatWavSizeEstimate(durationSec, sampleRate, numChannels, bitDepth);

  const handleExport = async () => {
    if (!audioBuffer) return;

    setIsRendering(true);
    setErrorMessage(null);
    setSuccess(false);

    try {
      setRenderStatus("Rendering DSP chain via OfflineAudioContext...");

      const normalizeCeilingDb =
        ceilingPreset === "streaming" ? -1.0 : ceilingPreset === "cd" ? -0.1 : null;

      // Render DSP audio faster than realtime
      const renderedBuffer = await renderOfflineMasteredAudio(audioBuffer, masteringPlan, {
        applyDsp,
        normalizeCeilingDb,
      });

      setRenderStatus(`Encoding ${bitDepth}-bit PCM WAV...`);
      // Allow DOM to update progress
      await new Promise((resolve) => setTimeout(resolve, 20));

      const blob = encodeWav(renderedBuffer, {
        bitDepth,
        dither: bitDepth === 16,
      });

      setRenderStatus("Initiating download...");
      const finalFileName = customFileName.trim().endsWith(".wav")
        ? customFileName.trim()
        : `${customFileName.trim()}.wav`;

      triggerBlobDownload(blob, finalFileName);

      setSuccess(true);
      setRenderStatus("Export complete!");
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      console.error("Export rendering failed:", err);
      setErrorMessage(err instanceof Error ? err.message : "Failed to render and export audio.");
    } finally {
      setIsRendering(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <div className="bg-[#0b0f15] border border-slate-800/90 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden relative font-sans flex flex-col text-slate-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800/80 flex items-center justify-between bg-[#0e131b]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-cyan-950/80 border border-cyan-700/60 flex items-center justify-center text-cyan-400">
              <Download size={16} />
            </div>
            <div>
              <h2
                id={titleId}
                className="text-sm font-mono font-bold text-white tracking-wide uppercase"
              >
                Export Master Audio
              </h2>
              <p id={descId} className="text-[11px] text-slate-400">
                Faster-than-realtime DSP bounce with lossless PCM encoding
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isRendering}
            className="text-slate-400 hover:text-slate-100 p-1.5 rounded-lg hover:bg-slate-800 transition"
            aria-label="Close export dialog"
          >
            <X size={16} />
          </button>
        </div>

        {/* Audio Telemetry Banner */}
        <div className="px-5 py-2.5 bg-[#080b0f] border-b border-slate-800/60 flex items-center justify-between text-[11px] font-mono text-slate-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Disc3 size={13} className="text-cyan-400" />
              {numChannels === 1 ? "Mono" : "Stereo"}
            </span>
            <span>{(sampleRate / 1000).toFixed(1)} kHz</span>
            <span>{formatSecs(durationSec)}</span>
          </div>
          <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-cyan-300 font-bold">
            ~{sizeEstimate}
          </span>
        </div>

        {/* Form Controls */}
        <div className="p-5 space-y-4 text-xs">
          {/* Output Format / Bit Depth */}
          <div>
            <div className="block text-[11px] font-mono font-bold text-slate-300 uppercase tracking-wider mb-2">
              PCM Bit Depth & Fidelity
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setBitDepth(24)}
                disabled={isRendering}
                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                  bitDepth === 24
                    ? "bg-cyan-950/30 border-cyan-500 text-white shadow-lg shadow-cyan-950/20"
                    : "bg-[#0f141c] border-slate-800 text-slate-400 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono font-bold text-xs text-cyan-300">WAV 24-bit</span>
                  {bitDepth === 24 && <Check size={14} className="text-cyan-400" />}
                </div>
                <p className="text-[10px] text-slate-400 leading-tight">
                  Studio Master standard (-144 dBFS noise floor). Apple Digital Masters & DAW
                  hand-off.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setBitDepth(16)}
                disabled={isRendering}
                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                  bitDepth === 16
                    ? "bg-cyan-950/30 border-cyan-500 text-white shadow-lg shadow-cyan-950/20"
                    : "bg-[#0f141c] border-slate-800 text-slate-400 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono font-bold text-xs text-cyan-300">WAV 16-bit</span>
                  {bitDepth === 16 && <Check size={14} className="text-cyan-400" />}
                </div>
                <p className="text-[10px] text-slate-400 leading-tight">
                  Standard CD/Broadcast with TPDF dither. Maximum universal device compatibility.
                </p>
              </button>
            </div>
          </div>

          {/* Peak Ceiling Normalization */}
          <div>
            <label
              htmlFor={normSelectId}
              className="block text-[11px] font-mono font-bold text-slate-300 uppercase tracking-wider mb-1.5"
            >
              Ceiling Normalization
            </label>
            <div className="relative">
              <select
                id={normSelectId}
                value={ceilingPreset}
                onChange={(e) => setCeilingPreset(e.target.value as "streaming" | "cd" | "raw")}
                disabled={isRendering}
                className="w-full px-3 py-2 bg-[#0f141c] border border-slate-800 rounded-lg text-slate-200 text-xs font-mono focus:outline-none focus:border-cyan-500 transition"
              >
                <option value="streaming">
                  Streaming Target (-1.0 dBFS Peak Ceiling - Spotify / Apple / EBU)
                </option>
                <option value="cd">Maximum Peak (-0.1 dBFS Peak Ceiling - Red Book CD)</option>
                <option value="raw">Raw DSP Levels (No Peak Normalization)</option>
              </select>
            </div>
            <p className="text-[10px] text-slate-500 mt-1 font-sans">
              -1.0 dBFS protects against inter-sample distortion when files undergo lossy encoding
              on Spotify or YouTube.
            </p>
          </div>

          {/* Apply DSP Switch */}
          <div className="p-3 bg-[#0f141c] border border-slate-800 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Sliders size={16} className={applyDsp ? "text-cyan-400" : "text-slate-600"} />
              <div>
                <span className="font-mono font-bold text-xs text-slate-200 block">
                  Apply Vantage DSP Chain
                </span>
                <span className="text-[10px] text-slate-400 font-sans">
                  Include preamp gain, highpass/lowpass filters, 3-band EQ, and dynamics compressor
                </span>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={applyDsp}
                onChange={(e) => setApplyDsp(e.target.checked)}
                disabled={isRendering}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500" />
            </label>
          </div>

          {/* Filename Input */}
          <div>
            <label
              htmlFor={filenameInputId}
              className="block text-[11px] font-mono font-bold text-slate-300 uppercase tracking-wider mb-1.5"
            >
              Destination Filename
            </label>
            <input
              id={filenameInputId}
              type="text"
              value={customFileName}
              onChange={(e) => setCustomFileName(e.target.value)}
              disabled={isRendering}
              className="w-full px-3 py-2 bg-[#0f141c] border border-slate-800 rounded-lg text-slate-200 text-xs font-mono focus:outline-none focus:border-cyan-500 transition"
              placeholder="filename-mastered.wav"
            />
          </div>

          {/* Error display */}
          {errorMessage && (
            <div className="p-2.5 bg-rose-950/40 border border-rose-900/60 rounded-lg text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle size={14} className="shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Progress / Status display */}
          {isRendering && (
            <div className="p-3 bg-cyan-950/40 border border-cyan-800/60 rounded-xl text-cyan-300 text-xs flex items-center gap-2.5">
              <Loader2 size={16} className="animate-spin text-cyan-400 shrink-0" />
              <span className="font-mono">{renderStatus}</span>
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-emerald-300 text-xs flex items-center gap-2.5">
              <Check size={16} className="text-emerald-400 shrink-0" />
              <span className="font-mono font-bold">
                Master successfully rendered and downloaded!
              </span>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 py-3.5 border-t border-slate-800/80 bg-[#0e131b] flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isRendering}
            className="px-3.5 py-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition text-xs font-mono"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={isRendering || !customFileName.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-slate-950 rounded-lg font-mono font-bold text-xs shadow-lg shadow-cyan-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isRendering ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Rendering...
              </>
            ) : (
              <>
                <Download size={14} />
                Render & Download WAV
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
