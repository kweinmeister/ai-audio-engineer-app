/**
 * Render the main AI Audio Engineer studio application, orchestrating audio playback,
 * Web Audio DSP filtering, acoustic diagnostics, and Gemini AI plan refinements.
 */

import {
  Download,
  FileText,
  Pause,
  Play,
  Radio,
  Send,
  ShieldAlert,
  Sliders,
  Sparkles,
  Trash,
} from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import AudioAnalyzerDeck from "./components/AudioAnalyzerDeck";
import { CritiqueView } from "./components/CritiqueView";
import { ExportModal } from "./components/ExportModal";
import MarkdownReport from "./components/MarkdownReport";
import { SpectralSpecs } from "./components/SpectralSpecs";
import { StudioRack } from "./components/StudioRack";
import { useAudioPipeline } from "./hooks/useAudioPipeline";
import { useAudioVisualizer } from "./hooks/useAudioVisualizer";
import { analyzeAudio, fetchAppConfig, refineMasteringPlan } from "./lib/api";
import { getErrorMessage } from "./lib/errors";
import { formatBytes, formatSecs } from "./lib/format";
import {
  type AnalyzeResponse,
  type AsyncStatus,
  type AudioFeatures,
  DEFAULT_GEMINI_MODEL,
  type MasteringPlan,
} from "./types";

const SUGGESTIONS = [
  {
    label: "Add warm tube bass 🔊",
    prompt:
      "Add warmer analog low-end presence, boost the bass EQ shelving filters significantly, and keep mids clean.",
  },
  {
    label: "Tame acoustic hiss 🧹",
    prompt:
      "Filter details of harsh friction hiss on top frequencies. Drop lowpass cut target down to around 11000 - 13000 Hz.",
  },
  {
    label: "Studio radio vocals 🎙️",
    prompt:
      "Optimize for cozy vocal-forward radio levels. Target mid boost at around 1500Hz with compression makeup.",
  },
  {
    label: "Loudness Maximizer ⚡",
    prompt:
      "Push makeup gain and threshold limits high with slight dynamics taming to maximize master volume intensity without clipping.",
  },
];

/**
 * Format a Date object as a zero-padded UTC HH:MM:SS string.
 */
function formatUtcTime(date: Date): string {
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

export default function App() {
  const pipeline = useAudioPipeline();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Hook up canvas visualizer loop
  useAudioVisualizer({
    canvasRef,
    analyserNodeRef: pipeline.analyserNodeRef,
    isActive: true,
  });

  // Acoustic analysis and remote AI state
  const [rawAudioFeatures, setRawAudioFeatures] = useState<AudioFeatures | null>(null);
  const [analysisResponse, setAnalysisResponse] = useState<AnalyzeResponse | null>(null);
  const [analyzingState, setAnalyzingState] = useState<AsyncStatus>({
    loading: false,
    error: null,
  });

  // Live ticking UTC clock
  const [utcTime, setUtcTime] = useState<string>(() => formatUtcTime(new Date()));

  useEffect(() => {
    const timer = setInterval(() => {
      setUtcTime(formatUtcTime(new Date()));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Active AI model dynamically provided by the server
  const [activeModel, setActiveModel] = useState<string>(DEFAULT_GEMINI_MODEL);

  useEffect(() => {
    fetchAppConfig().then((cfg) => {
      if (cfg?.model) {
        setActiveModel(cfg.model);
      }
    });
  }, []);

  // Natural language refinement state
  const [userFeedback, setUserFeedback] = useState<string>("");
  const [refinementState, setRefinementState] = useState<AsyncStatus>({
    loading: false,
    error: null,
  });

  // UI view tab state
  const [activeReportTab, setActiveReportTab] = useState<"critique" | "markdown" | "studio">(
    "critique",
  );

  // Audio export modal state
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);

  /**
   * Handle decoded audio file, bootstrap DSP chain, and trigger Gemini analysis.
   */
  const handleAnalysisComplete = async (
    features: AudioFeatures,
    base64Data: string,
    mimeTypeStr: string,
    audioBufferObj: AudioBuffer,
  ) => {
    setRawAudioFeatures(features);
    pipeline.setRawAudioBuffer(audioBufferObj);

    // Bootstrap Web Audio node graph
    await pipeline.initAudioChain(audioBufferObj);

    // Request AI analysis from backend
    setAnalyzingState({ loading: true, error: null });
    try {
      const data = await analyzeAudio(features, base64Data, mimeTypeStr);
      setAnalysisResponse(data);
      if (data.model) {
        setActiveModel(data.model);
      }
      pipeline.setMasteringPlan(data.masteringPlan);
    } catch (err) {
      console.error(err);
      setAnalyzingState({
        loading: false,
        error: getErrorMessage(err, "Could not analyze the audio."),
      });
    } finally {
      setAnalyzingState((prev) => ({ ...prev, loading: false }));
    }
  };

  /**
   * Reset active audio, pipeline, and analysis data.
   */
  const handleClearAudio = () => {
    pipeline.resetPipeline();
    setRawAudioFeatures(null);
    setAnalysisResponse(null);
    setUserFeedback("");
    setRefinementState({ loading: false, error: null });
  };

  /**
   * Submit natural language instruction to refine mastering plan.
   */
  const handleRefineMastering = async (feedbackText: string) => {
    if (!feedbackText.trim() || !analysisResponse) return;

    setRefinementState({ loading: true, error: null });
    setActiveReportTab("studio");

    try {
      const data = await refineMasteringPlan(
        pipeline.masteringPlan,
        feedbackText,
        analysisResponse.critique,
      );

      setAnalysisResponse((prev) =>
        prev
          ? {
              ...prev,
              masteringPlan: data.masteringPlan,
            }
          : null,
      );
      pipeline.setMasteringPlan(data.masteringPlan);
      setUserFeedback("");
    } catch (err) {
      console.error(err);
      setRefinementState({
        loading: false,
        error: getErrorMessage(err, "Failed to refine mastering plan via Gemini."),
      });
    } finally {
      setRefinementState((prev) => ({ ...prev, loading: false }));
    }
  };

  /**
   * Scrub playback timeline on click.
   */
  const handleTimelineScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!pipeline.rawAudioBuffer) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    pipeline.seekToTime(pct * pipeline.rawAudioBuffer.duration);
  };

  /**
   * Handle keyboard seek on timeline.
   */
  const handleTimelineKeys = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!pipeline.rawAudioBuffer) return;
    const step = 5; // seconds
    const current = pipeline.currentTime;
    const keyedTargets: Record<string, number> = {
      ArrowLeft: current - step,
      ArrowRight: current + step,
      Home: 0,
      End: pipeline.duration,
    };

    const target = keyedTargets[e.key];
    if (target === undefined) return;

    e.preventDefault();
    pipeline.seekToTime(target);
  };

  return (
    <div
      id="vantage-workspace"
      className="min-h-screen bg-[#06080b] text-slate-100 p-4 md:p-6 flex flex-col justify-between font-sans"
    >
      {/* Header */}
      <header className="flex items-center justify-between px-2 h-14 mb-4 border-b border-slate-900">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-cyan-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg font-mono font-bold text-white text-base">
            Φ
          </div>
          <div>
            <span className="text-base font-mono font-bold tracking-tight text-slate-100 flex items-center gap-2">
              VANTAGE AUDIO OS
              <span className="px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-mono text-[9px] rounded-full uppercase tracking-widest font-black">
                PRO
              </span>
            </span>
            <p className="text-[10px] text-slate-500 font-mono -mt-0.5">
              Real-time Web Audio API DSP & Gemini AI Mastering Laboratory
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div
            className="px-2.5 py-1 bg-[#10141c] border border-slate-800 rounded-lg text-[10px] font-mono text-cyan-400 font-medium"
            data-testid="utc-clock"
          >
            UTC: {utcTime}
          </div>
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-500 to-indigo-500 border border-slate-800 flex items-center justify-center text-xs font-mono font-bold text-slate-950">
            KW
          </div>
        </div>
      </header>

      {/* Main Studio Grid */}
      <main id="bento-space" className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Step 1 & Audio Deck (col-span-7) */}
        <div
          id="master-deck-card"
          className="col-span-12 md:col-span-7 bg-[#0b0f15] border border-slate-800 rounded-2xl p-6 flex flex-col justify-between overflow-hidden relative shadow-md"
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 blur-[90px] pointer-events-none" />

          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-cyan-950/40 text-cyan-300 border border-cyan-800/60 rounded font-mono text-[10px] font-bold uppercase tracking-wider">
                  {pipeline.isPlaying ? "ACTIVE PLAYBACK" : "STANDBY"}
                </span>
                <span className="text-slate-500 font-mono text-[10px] tracking-tight">
                  Rack Status: Online
                </span>
              </div>

              {pipeline.rawAudioBuffer && (
                <div className="flex items-center gap-2 bg-[#121822] border border-slate-800 p-1 rounded-lg">
                  <span
                    className={`text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 transition rounded ${
                      !pipeline.isDspActive ? "bg-amber-600/20 text-amber-400" : "text-slate-500"
                    }`}
                  >
                    {!pipeline.isDspActive ? "RAW BYPASS" : "By-Pass"}
                  </span>
                  <button
                    type="button"
                    onClick={pipeline.toggleDsp}
                    className={`w-9 h-5 rounded-full p-0.5 transition-colors relative ${
                      pipeline.isDspActive ? "bg-cyan-500" : "bg-slate-700"
                    }`}
                    id="bypass-master-switch"
                    title="Toggle Mastering (DSP Processing) or hear Original Raw Audio"
                  >
                    <div
                      className={`w-4 h-4 bg-slate-950 rounded-full transition-transform ${
                        pipeline.isDspActive ? "transform translate-x-4" : ""
                      }`}
                    />
                  </button>
                  <span
                    className={`text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 transition rounded ${
                      pipeline.isDspActive ? "bg-cyan-900/40 text-cyan-300" : "text-slate-500"
                    }`}
                  >
                    AI DSP ON
                  </span>
                </div>
              )}
            </div>

            <h2 className="text-2xl font-mono font-bold leading-tight text-white flex items-center gap-2">
              <Radio size={20} className="text-rose-500 shrink-0" />
              AI Audio Mastering Deck
            </h2>
            <p className="text-slate-400 text-xs mt-1 max-w-lg leading-relaxed font-sans">
              Deploy advanced high-fidelity corrective filters and levels makeup. Hear the immediate
              improvement by engaging the system toggle switch!
            </p>
          </div>

          <div className="my-5">
            {/* Waveform and Spectrum Canvas */}
            <div className="h-32 bg-[#0c1015] border border-slate-800 rounded-xl overflow-hidden relative shadow-inner">
              <canvas ref={canvasRef} width={580} height={128} className="w-full h-full block" />
              {!pipeline.rawAudioBuffer && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-slate-950/80 text-center">
                  <Sliders className="text-slate-600 animate-bounce mb-2" size={28} />
                  <p className="text-xs font-mono text-slate-400 tracking-wider">
                    WAITING FOR RAW DIGITAL AUDIO SOURCE...
                  </p>
                  <p className="text-[10px] text-slate-600 font-sans mt-0.5">
                    Please import a file below or use your device microphone to start.
                  </p>
                </div>
              )}
              {pipeline.rawAudioBuffer && analyzingState.loading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-slate-950/85 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-cyan-400 border-t-transparent mb-2" />
                  <p className="text-xs font-mono text-cyan-400">
                    GEMINI AI ACOUSTIC EXPERT ASSESSING RECORDING...
                  </p>
                  <p className="text-[10px] text-slate-500 font-sans mt-1">
                    Generating spectral profiles, analyzing hum frequencies, and structuring DSP
                    parameters...
                  </p>
                </div>
              )}
            </div>

            {/* Playback Controls */}
            {pipeline.rawAudioBuffer && (
              <div className="mt-4 bg-[#111721] border border-slate-800/60 rounded-xl p-4">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1.5">
                  <span>{formatSecs(pipeline.currentTime)}</span>
                  <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-indigo-300 font-bold uppercase">
                    {pipeline.isDspActive ? "DSP ACTIVE (Corrected)" : "RAW BYPASS (Original)"}
                  </span>
                  <span>{formatSecs(pipeline.duration)}</span>
                </div>

                <div
                  onClick={handleTimelineScrub}
                  onKeyDown={handleTimelineKeys}
                  role="slider"
                  tabIndex={0}
                  aria-label="Playback position"
                  aria-valuemin={0}
                  aria-valuemax={Math.round(pipeline.duration)}
                  aria-valuenow={Math.round(pipeline.currentTime)}
                  aria-valuetext={formatSecs(pipeline.currentTime)}
                  className="h-2 bg-[#0c1015] rounded-full overflow-hidden mb-4 cursor-pointer relative group"
                >
                  <div
                    className="absolute top-0 left-0 bottom-0 bg-gradient-to-r from-cyan-500 to-indigo-500 group-hover:from-cyan-400 group-hover:to-indigo-400 transition-all"
                    style={{ width: `${pipeline.playbackProgress * 100}%` }}
                  />
                  <div
                    className="absolute top-0 bottom-0 w-1 bg-white shadow"
                    style={{ left: `${pipeline.playbackProgress * 100}%` }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={pipeline.togglePlayPause}
                      className="w-10 h-10 rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-slate-950 flex items-center justify-center shadow-lg transition transform active:scale-95"
                      id="play-pause-btn"
                    >
                      {pipeline.isPlaying ? (
                        <Pause size={18} fill="#090d14" />
                      ) : (
                        <Play size={18} fill="#090d14" className="translate-x-0.5" />
                      )}
                    </button>
                    <div>
                      <p className="text-xs font-mono font-bold text-slate-200">
                        {rawAudioFeatures?.fileName || "Microphone Capture"}
                      </p>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                        {formatBytes(rawAudioFeatures?.fileSize || 0)} /{" "}
                        {rawAudioFeatures?.mimeType}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsExportModalOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 hover:from-cyan-500/30 hover:to-indigo-500/30 text-cyan-300 border border-cyan-500/40 rounded-lg transition text-[10px] font-mono font-bold shadow-sm cursor-pointer"
                      id="bento-export-audio"
                      title="Export Mastered Audio as Lossless WAV"
                    >
                      <Download size={12} />
                      Export Master
                    </button>

                    <button
                      type="button"
                      onClick={handleClearAudio}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-[#171f2c] hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 border border-slate-800 hover:border-rose-900/40 rounded-lg transition text-[10px] font-mono cursor-pointer"
                      id="bento-clear-audio"
                    >
                      <Trash size={12} />
                      Reset Deck
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="relative">
            <AudioAnalyzerDeck
              onAnalysisComplete={handleAnalysisComplete}
              audioBuffer={pipeline.rawAudioBuffer}
            />
          </div>
        </div>

        {/* Modular Hardware Rack (col-span-5) */}
        <div className="col-span-12 md:col-span-5">
          <StudioRack
            masteringPlan={pipeline.masteringPlan}
            onPlanChange={(updated: MasteringPlan) => pipeline.setMasteringPlan(updated)}
            isDspActive={pipeline.isDspActive}
            onToggleDsp={pipeline.toggleDsp}
            disabled={!pipeline.rawAudioBuffer}
            hasAiPlan={Boolean(analysisResponse)}
            onResetToAi={() => {
              if (analysisResponse) {
                pipeline.setMasteringPlan(analysisResponse.masteringPlan);
              }
            }}
            onExportMaster={() => setIsExportModalOpen(true)}
          />
        </div>

        {/* Acoustic Diagnostics specs box (col-span-4) */}
        <SpectralSpecs features={rawAudioFeatures} score={analysisResponse?.score ?? null} />

        {/* AI Critique & Reports (col-span-8) */}
        <div
          id="ai-diagnostics-report-card"
          className="col-span-12 md:col-span-8 bg-[#0b0f15] border border-slate-800 rounded-2xl p-6 overflow-hidden flex flex-col justify-between shadow-md"
        >
          <div className="flex flex-col h-full">
            {/* Tab selection bar */}
            <div className="flex items-center justify-between border-b border-slate-900 pb-3 mb-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setActiveReportTab("critique")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition ${
                    activeReportTab === "critique"
                      ? "bg-slate-800 text-cyan-300 border border-slate-700"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                  id="tab-critique-btn"
                >
                  <ShieldAlert size={13} />
                  Diagnostic Critique
                </button>
                <button
                  type="button"
                  onClick={() => setActiveReportTab("markdown")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition ${
                    activeReportTab === "markdown"
                      ? "bg-slate-800 text-cyan-300 border border-slate-700"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                  id="tab-report-btn"
                >
                  <FileText size={13} />
                  Deep Technical Report
                </button>
                <button
                  type="button"
                  onClick={() => setActiveReportTab("studio")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition ${
                    activeReportTab === "studio"
                      ? "bg-slate-800 text-cyan-300 border border-slate-700"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                  id="tab-studio-btn"
                >
                  <Sparkles size={13} />
                  Refinement Studio
                  {refinementState.loading && (
                    <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-ping" />
                  )}
                </button>
              </div>

              <span
                className="text-[10px] text-slate-500 font-mono md:inline hidden"
                data-testid="gemini-model-badge"
              >
                Gemini AI Model: {activeModel}
              </span>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto pr-1 max-h-[300px]">
              {activeReportTab === "critique" && (
                <CritiqueView critique={analysisResponse?.critique ?? null} />
              )}

              {activeReportTab === "markdown" && (
                <div className="bg-[#0b0e12] border border-slate-900 rounded-xl p-4 leading-relaxed max-w-full overflow-x-hidden">
                  {analysisResponse ? (
                    <div className="prose prose-invert prose-xs max-w-none text-slate-300">
                      <MarkdownReport markdown={analysisResponse.reportMarkdown} />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-12 text-center text-slate-600 font-mono select-none">
                      <FileText size={26} className="text-slate-700 mb-2" />
                      <p className="text-xs tracking-wider uppercase">
                        NO WRITTEN REPORT GENERATED
                      </p>
                      <p className="text-[10px] text-slate-500 font-sans mt-0.5">
                        Please import/record and allow the model to analyze your acoustic structure.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {activeReportTab === "studio" && (
                <div className="space-y-4">
                  {analysisResponse ? (
                    <>
                      <div className="p-3.5 bg-[#0f141c]/80 border border-slate-800 rounded-xl">
                        <span className="text-xs font-mono font-bold text-slate-300 block mb-2">
                          💡 Quick Adapt Shortcut Presets
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {SUGGESTIONS.map((s) => (
                            <button
                              type="button"
                              key={s.label}
                              onClick={() => handleRefineMastering(s.prompt)}
                              className="px-3 py-2 bg-[#17202d] hover:bg-[#1e2a3c] border border-slate-800 text-slate-300 text-left text-[11px] font-mono rounded-lg transition-all hover:-translate-y-0.5 active:translate-y-0 text-ellipsis truncate"
                              disabled={refinementState.loading}
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {refinementState.error && (
                        <div className="bg-rose-950/40 text-rose-200 border border-rose-900/60 px-3 py-2 rounded-lg text-xs font-mono">
                          Error: {refinementState.error}
                        </div>
                      )}

                      <div className="p-3 bg-slate-950/40 border border-slate-800 rounded-xl">
                        <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest block mb-1">
                          Active Mastering Target Plan:
                        </span>
                        <p className="text-xs font-sans text-slate-300 leading-relaxed font-semibold">
                          Gain:{" "}
                          <span className="text-cyan-400">
                            {pipeline.masteringPlan.gainDb > 0 ? "+" : ""}
                            {pipeline.masteringPlan.gainDb}dB
                          </span>
                          , HPF Cutoff:{" "}
                          <span className="text-indigo-400">
                            {pipeline.masteringPlan.highpassHz}Hz
                          </span>
                          , LPF Cutoff:{" "}
                          <span className="text-indigo-400">
                            {pipeline.masteringPlan.lowpassHz}Hz
                          </span>
                          , Bass Boost:{" "}
                          <span className="text-emerald-400">
                            {pipeline.masteringPlan.eq.bass.gain}dB
                          </span>
                          , Mid Boost:{" "}
                          <span className="text-blue-400">
                            {pipeline.masteringPlan.eq.mid.gain}dB
                          </span>
                          , Treble Boost:{" "}
                          <span className="text-cyan-400">
                            {pipeline.masteringPlan.eq.treble.gain}dB
                          </span>
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-12 text-center text-slate-600 font-mono select-none">
                      <Sparkles size={26} className="text-slate-700 mb-2" />
                      <p className="text-xs tracking-wider uppercase">STUDIO STANDBY</p>
                      <p className="text-[10px] text-slate-500 font-sans mt-0.5">
                        Acoustic models must be analyzed before entering parameter adaptation modes.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Conversational prompt input bar */}
            {analysisResponse && (
              <div className="mt-4 border-t border-slate-900 pt-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={userFeedback}
                    onChange={(e) => setUserFeedback(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !refinementState.loading && userFeedback.trim()) {
                        handleRefineMastering(userFeedback);
                      }
                    }}
                    placeholder={
                      refinementState.loading
                        ? "Calculating fresh mastering parameters..."
                        : "Instruct the engineer (e.g. 'Can you drop tape hiss and boost vocal presence?')..."
                    }
                    className="flex-1 bg-[#0c1015] border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 font-sans"
                    disabled={refinementState.loading}
                    id="conversational-feedback-input"
                  />
                  <button
                    type="button"
                    onClick={() => handleRefineMastering(userFeedback)}
                    className="px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 rounded-xl text-slate-950 flex items-center justify-center transition font-mono text-xs font-bold shrink-0 gap-1"
                    disabled={refinementState.loading || !userFeedback.trim()}
                    id="submit-refinement-btn"
                  >
                    {refinementState.loading ? (
                      <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-slate-950 border-t-transparent" />
                    ) : (
                      <>
                        <Send size={12} fill="#0c1015" />
                        SEND
                      </>
                    )}
                  </button>
                </div>
                <p className="text-[8px] text-slate-500 font-mono mt-1 text-right">
                  Adaptive models will automatically rewrite DSP equalizer bands and compressors
                  based on your description.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="h-10 mt-6 px-2 flex items-center justify-between text-[10px] text-slate-500 font-mono uppercase tracking-widest border-t border-slate-900 pt-2 shrink-0">
        <div className="flex gap-5">
          <span>
            Session: <span className="text-emerald-400 font-bold">● ACTIVE</span>
          </span>
          <span>Core Node ID: AIS-WEST-2</span>
          <span>
            {pipeline.rawAudioBuffer
              ? `Buffer: ${formatSecs(pipeline.duration)} (${(pipeline.rawAudioBuffer.sampleRate / 1000).toFixed(1)} kHz)`
              : "Engine: Web Audio 32-bit Float"}
          </span>
        </div>
        <div>Copyright © 2026 Vantage Systems Corp.</div>
      </footer>

      {/* Studio Master Audio Export Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        audioBuffer={pipeline.rawAudioBuffer}
        masteringPlan={pipeline.masteringPlan}
        originalFileName={rawAudioFeatures?.fileName}
        defaultDspActive={pipeline.isDspActive}
      />
    </div>
  );
}
