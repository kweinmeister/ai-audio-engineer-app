import React, { useState, useRef, useEffect } from "react";
import { 
  Volume2, Play, Pause, TrendingUp, Sparkles, Sliders, Activity, 
  Send, ShieldAlert, Check, HelpCircle, FileText, Settings, Radio,
  ChevronRight, ArrowUpRight, Maximize2, Trash, CheckSquare
} from "lucide-react";
import AudioAnalyzerDeck from "./components/AudioAnalyzerDeck";
import { AudioFeatures, AnalyzeResponse, MasteringPlan } from "./types";

const defaultMasteringPlan: MasteringPlan = {
  gainDb: 0,
  highpassHz: 20,
  lowpassHz: 20000,
  eqBassHz: 80,
  eqBassGain: 0,
  eqMidHz: 1200,
  eqMidGain: 0,
  eqTrebleHz: 10000,
  eqTrebleGain: 0,
  compressorThreshold: -24,
  compressorRatio: 1.0,
  verbDescription: "Neutral flat reference mastering scheme. Bypass is currently active or no corrective coefficients are calculated yet."
};

export default function App() {
  // Primary raw audio states
  const [rawAudioFeatures, setRawAudioFeatures] = useState<AudioFeatures | null>(null);
  const [base64AudioData, setBase64AudioData] = useState<string>("");
  const [mimeType, setMimeType] = useState<string>("");
  const [rawAudioBuffer, setRawAudioBuffer] = useState<AudioBuffer | null>(null);

  // Analysis result
  const [analysisResponse, setAnalysisResponse] = useState<AnalyzeResponse | null>(null);
  const [analyzingState, setAnalyzingState] = useState<{ loading: boolean; error: string | null }>({
    loading: false,
    error: null
  });

  // Active DSP settings (modified either by Gemini or manually by the user on the bento controls!)
  const [masteringPlan, setMasteringPlan] = useState<MasteringPlan>(defaultMasteringPlan);
  const [isDspActive, setIsDspActive] = useState<boolean>(true);

  // Refinement feedback states
  const [userFeedback, setUserFeedback] = useState<string>("");
  const [refinementState, setRefinementState] = useState<{ loading: boolean; error: string | null }>({
    loading: false,
    error: null
  });

  // Interactive UI tab management
  const [activeReportTab, setActiveReportTab] = useState<"critique" | "markdown" | "studio">("critique");

  // Web Audio Context & Node Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const highpassNodeRef = useRef<BiquadFilterNode | null>(null);
  const lowpassNodeRef = useRef<BiquadFilterNode | null>(null);
  const bassEQNodeRef = useRef<BiquadFilterNode | null>(null);
  const midEQNodeRef = useRef<BiquadFilterNode | null>(null);
  const trebleEQNodeRef = useRef<BiquadFilterNode | null>(null);
  const compressorNodeRef = useRef<DynamicsCompressorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);

  // Canvas visualizer details
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);

  // Playback timer & position states
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackProgress, setPlaybackProgress] = useState<number>(0); // 0 to 1
  const [currentTime, setCurrentTime] = useState<number>(0);

  // Precision tracking refs to avoid stale loops
  const isPlayingRef = useRef<boolean>(false);
  const rawAudioBufferRef = useRef<AudioBuffer | null>(null);
  const startCtxTimeRef = useRef<number>(0);
  const playbackOffsetRef = useRef<number>(0);

  // Sync state changes with loop reference variables
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    rawAudioBufferRef.current = rawAudioBuffer;
  }, [rawAudioBuffer]);

  // Decoded sample analysis wrapper
  const handleAnalysisComplete = async (
    features: AudioFeatures, 
    base64Data: string, 
    mimeTypeStr: string, 
    audioBufferObj: AudioBuffer
  ) => {
    setRawAudioFeatures(features);
    setBase64AudioData(base64Data);
    setMimeType(mimeTypeStr);
    setRawAudioBuffer(audioBufferObj);

    // Bootstrap Web Audio context and chain
    await initAudioChain(audioBufferObj);

    // Call server API for generative engineering analysis
    setAnalyzingState({ loading: true, error: null });
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          features,
          base64Audio: base64Data,
          mimeType: mimeTypeStr
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Analysis server error.");
      }

      const data: AnalyzeResponse = await response.json();
      setAnalysisResponse(data);
      setMasteringPlan(data.masteringPlan);

      // Instantly inject AI coefficients to Web Audio filters
      updateDspNodeParameters(data.masteringPlan, isDspActive);
    } catch (err: any) {
      console.error(err);
      setAnalyzingState({ loading: false, error: err.message || "Could not analyze the audio." });
    } finally {
      setAnalyzingState(prev => ({ ...prev, loading: false }));
    }
  };

  const handleClearAudio = () => {
    // Cease active playing units
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch(e){}
      sourceNodeRef.current = null;
    }
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch(e){}
      audioContextRef.current = null;
    }
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }

    setRawAudioFeatures(null);
    setRawAudioBuffer(null);
    setBase64AudioData("");
    setMimeType("");
    setAnalysisResponse(null);
    setIsPlaying(false);
    setPlaybackProgress(0);
    setCurrentTime(0);
    playbackOffsetRef.current = 0;
    setMasteringPlan(defaultMasteringPlan);
    setUserFeedback("");
    setRefinementState({ loading: false, error: null });
  };

  // Build the live Web Audio Master Chain:
  // Source -> High-pass filter -> Low-pass filter -> Bass EQ -> Mid EQ -> Treble EQ -> Compressor -> Makeup Gain -> Spectral Analyser -> Output Destination
  const initAudioChain = async (buffer: AudioBuffer) => {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioContextRef.current = ctx;

    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.setValueAtTime(20, ctx.currentTime);

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.setValueAtTime(20000, ctx.currentTime);

    const bassEQ = ctx.createBiquadFilter();
    bassEQ.type = "peaking";
    bassEQ.Q.setValueAtTime(1.0, ctx.currentTime);

    const midEQ = ctx.createBiquadFilter();
    midEQ.type = "peaking";
    midEQ.Q.setValueAtTime(1.0, ctx.currentTime);

    const trebleEQ = ctx.createBiquadFilter();
    trebleEQ.type = "peaking";
    trebleEQ.Q.setValueAtTime(1.0, ctx.currentTime);

    const compressor = ctx.createDynamicsCompressor();
    const gainNode = ctx.createGain();

    const analyzer = ctx.createAnalyser();
    analyzer.fftSize = 256;

    // Direct wires connection
    highpass.connect(lowpass);
    lowpass.connect(bassEQ);
    bassEQ.connect(midEQ);
    midEQ.connect(trebleEQ);
    trebleEQ.connect(compressor);
    compressor.connect(gainNode);
    gainNode.connect(analyzer);
    analyzer.connect(ctx.destination);

    // Save nodes to ref registers
    highpassNodeRef.current = highpass;
    lowpassNodeRef.current = lowpass;
    bassEQNodeRef.current = bassEQ;
    midEQNodeRef.current = midEQ;
    trebleEQNodeRef.current = trebleEQ;
    compressorNodeRef.current = compressor;
    gainNodeRef.current = gainNode;
    analyserNodeRef.current = analyzer;

    // Implement default plan rules
    updateDspNodeParameters(masteringPlan, isDspActive);
  };

  // Instant hardware settings update logic
  const updateDspNodeParameters = (plan: MasteringPlan, dspEnabled: boolean) => {
    if (!gainNodeRef.current || !highpassNodeRef.current || !lowpassNodeRef.current || 
        !bassEQNodeRef.current || !midEQNodeRef.current || !trebleEQNodeRef.current || 
        !compressorNodeRef.current) return;

    const ctx = audioContextRef.current;
    if (!ctx) return;

    const now = ctx.currentTime;

    if (dspEnabled) {
      // Linear makeup gain
      const linearGain = Math.pow(10, plan.gainDb / 20);
      gainNodeRef.current.gain.linearRampToValueAtTime(linearGain, now + 0.05);

      // Highpass (sub rumbles low-cut cutoff)
      if (plan.highpassHz > 15) {
        highpassNodeRef.current.type = "highpass";
        highpassNodeRef.current.frequency.setValueAtTime(plan.highpassHz, now);
      } else {
        highpassNodeRef.current.type = "allpass";
      }

      // Lowpass (noise tape hiss high-cut cutoff)
      if (plan.lowpassHz < 19500) {
        lowpassNodeRef.current.type = "lowpass";
        lowpassNodeRef.current.frequency.setValueAtTime(plan.lowpassHz, now);
      } else {
        lowpassNodeRef.current.type = "allpass";
      }

      // EQ Nodes (Center frequency + clean gain modifiers)
      bassEQNodeRef.current.frequency.setValueAtTime(plan.eqBassHz, now);
      bassEQNodeRef.current.gain.linearRampToValueAtTime(plan.eqBassGain, now + 0.05);

      midEQNodeRef.current.frequency.setValueAtTime(plan.eqMidHz, now);
      midEQNodeRef.current.gain.linearRampToValueAtTime(plan.eqMidGain, now + 0.05);

      trebleEQNodeRef.current.frequency.setValueAtTime(plan.eqTrebleHz, now);
      trebleEQNodeRef.current.gain.linearRampToValueAtTime(plan.eqTrebleGain, now + 0.05);

      // Dynamics compression thresholds and ratio weights
      if (plan.compressorRatio > 1.01) {
        compressorNodeRef.current.threshold.setValueAtTime(plan.compressorThreshold, now);
        compressorNodeRef.current.ratio.setValueAtTime(plan.compressorRatio, now);
        compressorNodeRef.current.attack.setValueAtTime(0.012, now);
        compressorNodeRef.current.release.setValueAtTime(0.220, now);
        compressorNodeRef.current.knee.setValueAtTime(25, now);
      } else {
        compressorNodeRef.current.ratio.setValueAtTime(1.0, now); // clean bypass
      }
    } else {
      // MASTERING DISABLED (Bypass reference mode)
      gainNodeRef.current.gain.linearRampToValueAtTime(1.0, now + 0.05);
      highpassNodeRef.current.type = "allpass";
      lowpassNodeRef.current.type = "allpass";
      bassEQNodeRef.current.gain.linearRampToValueAtTime(0, now + 0.05);
      midEQNodeRef.current.gain.linearRampToValueAtTime(0, now + 0.05);
      trebleEQNodeRef.current.gain.linearRampToValueAtTime(0, now + 0.05);
      compressorNodeRef.current.ratio.setValueAtTime(1.0, now);
    }
  };

  // Toggle mastering DSP active state
  const handleToggleDsp = () => {
    const nextState = !isDspActive;
    setIsDspActive(nextState);
    updateDspNodeParameters(masteringPlan, nextState);
  };

  // Interactive precision timing progress loop & canvas visual renderer
  const playTicker = useRef<number | null>(null);

  const drawVisualizer = () => {
    if (!canvasRef.current || !analyserNodeRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = analyserNodeRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const timeDomainArray = new Uint8Array(bufferLength);

    const render = () => {
      if (!analyserNodeRef.current) return;
      animationFrameIdRef.current = requestAnimationFrame(render);

      const width = canvas.width;
      const height = canvas.height;

      analyserNodeRef.current.getByteFrequencyData(dataArray);
      analyserNodeRef.current.getByteTimeDomainData(timeDomainArray);

      // Background draw slate
      ctx.fillStyle = "#0c1016";
      ctx.fillRect(0, 0, width, height);

      // Drawing dark retro grid mesh patterns for bento styling
      ctx.strokeStyle = "rgba(148, 163, 184, 0.08)";
      ctx.lineWidth = 1;

      for (let tx = 0; tx < width; tx += 24) {
        ctx.beginPath();
        ctx.moveTo(tx, 0);
        ctx.lineTo(tx, height);
        ctx.stroke();
      }
      for (let ty = 0; ty < height; ty += 16) {
        ctx.beginPath();
        ctx.moveTo(0, ty);
        ctx.lineTo(width, ty);
        ctx.stroke();
      }

      // Draw active colorful bars representing frequency bands
      const barWidth = (width / bufferLength) * 2.8;
      let barHeight;
      let bx = 0;

      // Glow linear gradient
      const grad = ctx.createLinearGradient(0, height, 0, 0);
      grad.addColorStop(0, "#4f46e5"); // deep indigo
      grad.addColorStop(0.4, "#06b6d4"); // neon cyan
      grad.addColorStop(1, "#10b981"); // vibrant emerald

      for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * height * 0.85;

        if (barHeight > 0) {
          ctx.fillStyle = grad;
          ctx.fillRect(bx, height - barHeight, barWidth - 1, barHeight);
        }
        bx += barWidth;
      }

      // Overlap with glowing oscilloscope timeline wave
      ctx.beginPath();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
      
      const sliceWidth = width / bufferLength;
      let wx = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = timeDomainArray[i] / 128.0;
        const wy = (v * height) / 2;

        if (i === 0) {
          ctx.moveTo(wx, wy);
        } else {
          ctx.lineTo(wx, wy);
        }
        wx += sliceWidth;
      }
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      // Trigger standard timeline updates
      if (isPlayingRef.current && rawAudioBufferRef.current) {
        const elapsed = audioContextRef.current!.currentTime - startCtxTimeRef.current;
        const totalDuration = rawAudioBufferRef.current.duration;
        const rawTime = Math.min(totalDuration, playbackOffsetRef.current + elapsed);
        
        setCurrentTime(rawTime);
        setPlaybackProgress(rawTime / totalDuration);

        if (rawTime >= totalDuration) {
          // Playback finished cycle
          setIsPlaying(false);
          setCurrentTime(0);
          setPlaybackProgress(0);
          playbackOffsetRef.current = 0;
          if (sourceNodeRef.current) {
            try { sourceNodeRef.current.stop(); } catch(e){}
            sourceNodeRef.current = null;
          }
        }
      }
    };

    render();
  };

  const togglePlayPause = async () => {
    if (!rawAudioBuffer) return;

    if (!audioContextRef.current) {
      await initAudioChain(rawAudioBuffer);
    }

    const ctx = audioContextRef.current!;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    if (isPlaying) {
      // Pause sound channel
      setIsPlaying(false);
      if (sourceNodeRef.current) {
        try { sourceNodeRef.current.stop(); } catch(e){}
        sourceNodeRef.current = null;
      }

      const elapsed = ctx.currentTime - startCtxTimeRef.current;
      playbackOffsetRef.current = Math.min(rawAudioBuffer.duration, playbackOffsetRef.current + elapsed);
    } else {
      // Trigger tape play head
      setIsPlaying(true);

      const sourceNode = ctx.createBufferSource();
      sourceNode.buffer = rawAudioBuffer;
      sourceNode.connect(highpassNodeRef.current || ctx.destination);
      sourceNodeRef.current = sourceNode;

      startCtxTimeRef.current = ctx.currentTime;
      updateDspNodeParameters(masteringPlan, isDspActive);

      const durationLeft = Math.max(0, rawAudioBuffer.duration - playbackOffsetRef.current);
      sourceNode.start(0, playbackOffsetRef.current);

      // Start rendering frame rates
      drawVisualizer();
    }
  };

  // Immediate timeline interactive scrubbing
  const handleTimelineScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!rawAudioBuffer) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    const targetScrubTime = pct * rawAudioBuffer.duration;

    setPlaybackProgress(pct);
    setCurrentTime(targetScrubTime);
    playbackOffsetRef.current = targetScrubTime;

    if (isPlaying) {
      // Stop previous playing source, trigger new buffer start from scrub offset
      if (sourceNodeRef.current) {
        try { sourceNodeRef.current.stop(); } catch(err){}
        sourceNodeRef.current = null;
      }

      const ctx = audioContextRef.current!;
      const sourceNode = ctx.createBufferSource();
      sourceNode.buffer = rawAudioBuffer;
      sourceNode.connect(highpassNodeRef.current || ctx.destination);
      sourceNodeRef.current = sourceNode;

      startCtxTimeRef.current = ctx.currentTime;
      sourceNode.start(0, targetScrubTime);
    }
  };

  // Manual interactive slider hardware feedback updates
  const handleManualPlanChange = (key: keyof MasteringPlan, value: string | number) => {
    setMasteringPlan(prev => {
      const updated = {
        ...prev,
        [key]: typeof value === "string" ? parseFloat(value) : value
      } as MasteringPlan;

      // Realtime hot patch parameters updates inside filters
      updateDspNodeParameters(updated, isDspActive);
      return updated;
    });
  };

  // Gemini Plan Adaptation API Trigger
  const handleRefineMastering = async (feedbackText: string) => {
    if (!feedbackText.trim() || !analysisResponse) return;

    setRefinementState({ loading: true, error: null });
    setActiveReportTab("studio");
    try {
      const response = await fetch("/api/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPlan: masteringPlan,
          userFeedback: feedbackText,
          critique: analysisResponse.critique
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Refinement server error.");
      }

      const data = await response.json();
      if (data.masteringPlan) {
        setMasteringPlan(data.masteringPlan);
        // Instant updates filters coefficients
        updateDspNodeParameters(data.masteringPlan, isDspActive);
      }
      setUserFeedback("");
    } catch (err: any) {
      console.error(err);
      setRefinementState({ loading: false, error: err.message || "Failed to refine plan." });
    } finally {
      setRefinementState(prev => ({ ...prev, loading: false }));
    }
  };

  // Format Helper timestamps
  const formatSecs = (val: number) => {
    const mins = Math.floor(val / 60);
    const secs = Math.floor(val % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  // Human File Converter size
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Safe cleaner markdown renderer without requiring heavy npm parsing libraries
  const renderMarkdownText = (mdStr: string) => {
    if (!mdStr) return null;
    return mdStr.split("\n").map((line, idx) => {
      const cleanLine = line.trim();
      if (cleanLine.startsWith("### ")) {
        return <h4 key={idx} className="text-xs font-mono font-bold text-cyan-400 mt-4 mb-2 tracking-wider flex items-center gap-1.5"><ChevronRight size={12} />{cleanLine.replace("### ", "")}</h4>;
      }
      if (cleanLine.startsWith("## ")) {
        return <h3 key={idx} className="text-sm font-mono font-bold text-indigo-400 mt-5 mb-3 border-b border-slate-800 pb-1 uppercase tracking-wide">{cleanLine.replace("## ", "")}</h3>;
      }
      if (cleanLine.startsWith("# ")) {
        return <h2 key={idx} className="text-base font-mono font-bold text-slate-100 mt-6 mb-4 font-semibold uppercase">{cleanLine.replace("# ", "")}</h2>;
      }
      if (cleanLine.startsWith("- ") || cleanLine.startsWith("* ")) {
        return (
          <ul key={idx} className="list-disc list-inside text-slate-300 ml-2 py-0.5 text-xs font-sans leading-relaxed">
            {formatBoldSegments(cleanLine.substring(2))}
          </ul>
        );
      }
      if (cleanLine === "") return <div key={idx} className="h-2"></div>;
      return <p key={idx} className="text-slate-300 text-xs font-sans leading-relaxed my-1">{formatBoldSegments(line)}</p>;
    });
  };

  const formatBoldSegments = (text: string) => {
    const segments = text.split(/(\*\*.*?\*\*)/g);
    return segments.map((seg, i) => {
      if (seg.startsWith("**") && seg.endsWith("**")) {
        return <strong key={i} className="text-cyan-300 font-semibold">{seg.slice(2, -2)}</strong>;
      }
      return seg;
    });
  };

  // Quick-touch prompt options for instant testing
  const suggestions = [
    { label: "Add warm tube bass 🔊", prompt: "Add warmer analog low-end presence, boost the bass EQ shelving filters significantly, and keep mids clean." },
    { label: "Tame acoustic hiss 🧹", prompt: "Filter details of harsh friction hiss on top frequencies. Drop lowpass cut target down to around 11000 - 13000 Hz." },
    { label: "Studio radio vocals 🎙️", prompt: "Optimize for cozy vocal-forward radio levels. Target mid boost at around 1500Hz with compression makeup." },
    { label: "Loudness Maximizer ⚡", prompt: "Push makeup gain and threshold limits high with slight dynamics taming to maximize master volume intensity without clipping." },
  ];

  return (
    <div id="vantage-workspace" className="min-h-screen bg-[#06080b] text-slate-100 p-4 md:p-6 flex flex-col justify-between font-sans">
      
      {/* Dynamic Header */}
      <header className="flex items-center justify-between px-2 h-14 mb-4 border-b border-slate-900">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-cyan-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg font-mono font-bold text-white text-base">
            Φ
          </div>
          <div>
            <span className="text-base font-mono font-bold tracking-tight text-slate-100 flex items-center gap-2">
              VANTAGE AUDIO OS
              <span className="px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-mono text-[9px] rounded-full uppercase tracking-widest font-black">PRO</span>
            </span>
            <p className="text-[10px] text-slate-500 font-mono -mt-0.5">Real-time Web Audio API DSP & Gemini AI Mastering Laboratory</p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-slate-400 font-medium font-mono md:flex hidden">
          <span className="text-slate-100 border-b-2 border-cyan-500 pb-1">AI Console</span>
          <span className="hover:text-slate-200 cursor-pointer">Dsp Mastering</span>
          <span className="hover:text-slate-200 cursor-pointer">Acoustic Specs</span>
          <span className="hover:text-slate-200 cursor-pointer">Refinement Studio</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-2.5 py-1 bg-[#10141c] border border-slate-800 rounded-lg text-[10px] font-mono text-cyan-400 font-medium">
            UTC: 15:01
          </div>
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-500 to-indigo-500 border border-slate-800 flex items-center justify-center text-xs font-mono font-bold text-slate-950">
            KW
          </div>
        </div>
      </header>

      {/* Main Bento Grid layout */}
      <main id="bento-space" className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-4">
        
        {/* Step 1 & AI Playback Deck (col-span-7 row-span-3) */}
        <div id="master-deck-card" className="col-span-12 md:col-span-7 bg-[#0b0f15] border border-slate-800 rounded-2xl p-6 flex flex-col justify-between overflow-hidden relative shadow-md">
          <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 blur-[90px] pointer-events-none"></div>
          
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-cyan-950/40 text-cyan-300 border border-cyan-800/60 rounded font-mono text-[10px] font-bold uppercase tracking-wider">
                  {isPlaying ? "ACTIVE PLAYBACK" : "STANDBY"}
                </span>
                <span className="text-slate-500 font-mono text-[10px] tracking-tight">Rack Status: Online</span>
              </div>
              
              {/* Mechanical bypass switch */}
              {rawAudioBuffer && (
                <div className="flex items-center gap-2 bg-[#121822] border border-slate-800 p-1 rounded-lg">
                  <span className={`text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 transition rounded ${
                    !isDspActive ? "bg-amber-600/20 text-amber-400" : "text-slate-500"
                  }`}>
                    By-Pass
                  </span>
                  <button 
                    onClick={handleToggleDsp}
                    className={`w-9 h-5 rounded-full p-0.5 transition-colors relative ${
                      isDspActive ? "bg-cyan-505 bg-cyan-500" : "bg-slate-700"
                    }`}
                    id="bypass-master-switch"
                    title="Toggle Mastering (DSP Processing) or hear Original Raw Audio"
                  >
                    <div className={`w-4 h-4 bg-slate-950 rounded-full transition-transform ${
                      isDspActive ? "transform translate-x-4" : ""
                    }`}></div>
                  </button>
                  <span className={`text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 transition rounded ${
                    isDspActive ? "bg-cyan-900/40 text-cyan-300" : "text-slate-500"
                  }`}>
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
              Deploy advanced high-fidelity corrective filters and levels makeup. Hear the immediate improvement by engaging the system toggle switch!
            </p>
          </div>

          <div className="my-5">
            {/* Direct dynamic Waveform and Spectrum View */}
            <div className="h-32 bg-[#0c1015] border border-slate-800 rounded-xl overflow-hidden relative shadow-inner">
              <canvas 
                ref={canvasRef} 
                width={580} 
                height={128} 
                className="w-full h-full block"
              />
              {!rawAudioBuffer && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-slate-950/80 text-center">
                  <Sliders className="text-slate-600 animate-bounce mb-2" size={28} />
                  <p className="text-xs font-mono text-slate-400 tracking-wider">WAITING FOR RAW DIGITAL AUDIO SOURCE...</p>
                  <p className="text-[10px] text-slate-600 font-sans mt-0.5">Please import a file below or use your device microphone to start.</p>
                </div>
              )}
              {rawAudioBuffer && analyzingState.loading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-slate-950/85 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-cyan-400 border-t-transparent mb-2"></div>
                  <p className="text-xs font-mono text-cyan-400">GEMINI AI ACOUSTIC EXPERT ASSESSING RECORDING...</p>
                  <p className="text-[10px] text-slate-500 font-sans mt-1">Generating spectral profiles, analyzing hum frequencies, and structuring DSP parameters...</p>
                </div>
              )}
            </div>

            {/* Custom Interactive Player Controller */}
            {rawAudioBuffer && (
              <div className="mt-4 bg-[#111721] border border-slate-800/60 rounded-xl p-4">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1.5">
                  <span>{formatSecs(currentTime)}</span>
                  <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-indigo-300 font-bold uppercase">
                    {isDspActive ? "DSP ACTIVE (Corrected)" : "RAW BYPASS (Original)"}
                  </span>
                  <span>{formatSecs(rawAudioBuffer.duration)}</span>
                </div>

                {/* Timeline seeker track */}
                <div 
                  onClick={handleTimelineScrub}
                  className="h-2 bg-[#0c1015] rounded-full overflow-hidden mb-4 cursor-pointer relative group"
                >
                  <div 
                    className="absolute top-0 left-0 bottom-0 bg-gradient-to-r from-cyan-500 to-indigo-500 group-hover:from-cyan-400 group-hover:to-indigo-400 transition-all"
                    style={{ width: `${playbackProgress * 100}%` }}
                  ></div>
                  <div 
                    className="absolute top-0 bottom-0 w-1 bg-white shadow"
                    style={{ left: `${playbackProgress * 100}%` }}
                  ></div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={togglePlayPause}
                      className="w-10 h-10 rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-slate-950 flex items-center justify-center shadow-lg transition transform active:scale-95"
                      id="play-pause-btn"
                    >
                      {isPlaying ? <Pause size={18} fill="#090d14" /> : <Play size={18} fill="#090d14" className="translate-x-0.5" />}
                    </button>
                    <div>
                      <p className="text-xs font-mono font-bold text-slate-200">
                        {rawAudioFeatures?.fileName || "Microphone Capture"}
                      </p>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                        {formatBytes(rawAudioFeatures?.fileSize || 0)} / {rawAudioFeatures?.mimeType}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={handleClearAudio}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-[#171f2c] hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 border border-slate-800 hover:border-rose-900/40 rounded-lg transition text-[10px] font-mono"
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

          {/* Import Source Interface (Direct in-line Bento component) */}
          <div className="relative">
            <AudioAnalyzerDeck 
              onAnalysisComplete={handleAnalysisComplete}
              audioBuffer={rawAudioBuffer}
              onClear={handleClearAudio}
            />
          </div>
        </div>

        {/* Dynamic Hardware DSP Configurer Box (col-span-12 md:col-span-5 row-span-3) */}
        <div id="dsp-master-config" className="col-span-12 md:col-span-5 bg-[#0b0f15] border border-slate-800 rounded-2xl p-6 flex flex-col justify-between shadow-md">
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-mono font-bold text-white flex items-center gap-2">
                <Sliders size={18} className="text-cyan-400" />
                DSP COMPILER RACK
              </h2>
              <span className="text-[10px] font-mono bg-indigo-900/40 border border-indigo-800 text-indigo-300 px-2 py-0.5 rounded uppercase">
                {isDspActive ? "LIVE FEEDBACK" : "BYPASS ACTIVE"}
              </span>
            </div>

            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed font-sans mb-5">
              These precision calculated parameters modify the real-time node network in your browser. Drag or adjust them to fine-tune.
            </p>

            {/* Hardware Fader Layout Stack */}
            <div className="space-y-4">
              
              {/* Absolute Makeup Volume Gain Slider */}
              <div className="p-3 bg-[#0f141c]/60 border border-slate-800/60 rounded-xl">
                <div className="flex justify-between items-center text-xs font-mono mb-1">
                  <span className="text-slate-300 flex items-center gap-1 font-bold">
                    Makeup Gain
                  </span>
                  <span className="text-cyan-400 font-bold">
                    {masteringPlan.gainDb > 0 ? "+" : ""}{masteringPlan.gainDb.toFixed(1)} dB
                  </span>
                </div>
                <input 
                  type="range"
                  min="-12"
                  max="12"
                  step="0.5"
                  value={masteringPlan.gainDb}
                  onChange={(e) => handleManualPlanChange("gainDb", e.target.value)}
                  className="w-full text-cyan-400 accent-cyan-500 h-1 bg-slate-900 rounded-lg cursor-pointer"
                  disabled={!rawAudioBuffer}
                />
                <p className="text-[9px] text-slate-500 mt-1">Raises target amplitude floor after high/low dynamic taming cuts.</p>
              </div>

              {/* Sub Rumble Cut & Hiss Cut Filters */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-[#0f141c]/60 border border-slate-800/60 rounded-xl">
                  <div className="flex justify-between items-center text-xs font-mono mb-1">
                    <span className="text-slate-300 text-[11px]">HPF Low-Cut</span>
                    <span className="text-indigo-400 text-[10px]">{masteringPlan.highpassHz} Hz</span>
                  </div>
                  <input 
                    type="range"
                    min="0"
                    max="180"
                    step="5"
                    value={masteringPlan.highpassHz}
                    onChange={(e) => handleManualPlanChange("highpassHz", e.target.value)}
                    className="w-full accent-indigo-500 h-1 bg-slate-900 rounded-lg cursor-pointer"
                    disabled={!rawAudioBuffer}
                  />
                  <p className="text-[8px] text-slate-500 mt-0.5">Clears low-end sub mud rumble.</p>
                </div>

                <div className="p-3 bg-[#0f141c]/60 border border-slate-800/60 rounded-xl">
                  <div className="flex justify-between items-center text-xs font-mono mb-1">
                    <span className="text-slate-300 text-[11px]">LPF High-Cut</span>
                    <span className="text-indigo-400 text-[10px]">{masteringPlan.lowpassHz} Hz</span>
                  </div>
                  <input 
                    type="range"
                    min="3000"
                    max="20000"
                    step="200"
                    value={masteringPlan.lowpassHz}
                    onChange={(e) => handleManualPlanChange("lowpassHz", e.target.value)}
                    className="w-full accent-indigo-500 h-1 bg-slate-900 rounded-lg cursor-pointer"
                    disabled={!rawAudioBuffer}
                  />
                  <p className="text-[8px] text-slate-500 mt-0.5">Cleans high-frequency surface hiss.</p>
                </div>
              </div>

              {/* Dynamic Equalizer EQ Section */}
              <div className="p-3.5 bg-[#0f141c]/60 border border-slate-800/60 rounded-xl">
                <span className="text-[10px] font-mono font-bold text-indigo-300 uppercase tracking-wider block mb-2">Parametric Equalizer</span>
                <div className="space-y-2.5">
                  {/* Bass band */}
                  <div className="flex items-center gap-3">
                    <span className="w-14 text-[10px] text-slate-400 font-mono">Bass ({masteringPlan.eqBassHz}Hz)</span>
                    <input 
                      type="range"
                      min="-9"
                      max="9"
                      step="0.5"
                      value={masteringPlan.eqBassGain}
                      onChange={(e) => handleManualPlanChange("eqBassGain", e.target.value)}
                      className="flex-1 accent-emerald-500 h-1 bg-slate-900 rounded-lg"
                      disabled={!rawAudioBuffer}
                    />
                    <span className="w-12 text-right text-[10px] font-mono text-emerald-400 font-bold">
                      {masteringPlan.eqBassGain > 0 ? "+" : ""}{masteringPlan.eqBassGain.toFixed(1)} dB
                    </span>
                  </div>

                  {/* Mid range band */}
                  <div className="flex items-center gap-3">
                    <span className="w-14 text-[10px] text-slate-400 font-mono">Mids ({masteringPlan.eqMidHz}Hz)</span>
                    <input 
                      type="range"
                      min="-9"
                      max="9"
                      step="0.5"
                      value={masteringPlan.eqMidGain}
                      onChange={(e) => handleManualPlanChange("eqMidGain", e.target.value)}
                      className="flex-1 accent-blue-500 h-1 bg-slate-900 rounded-lg"
                      disabled={!rawAudioBuffer}
                    />
                    <span className="w-12 text-right text-[10px] font-mono text-blue-400 font-bold">
                      {masteringPlan.eqMidGain > 0 ? "+" : ""}{masteringPlan.eqMidGain.toFixed(1)} dB
                    </span>
                  </div>

                  {/* Treble band */}
                  <div className="flex items-center gap-3">
                    <span className="w-14 text-[10px] text-slate-400 font-mono">Treble ({masteringPlan.eqTrebleHz}Hz)</span>
                    <input 
                      type="range"
                      min="-9"
                      max="9"
                      step="0.5"
                      value={masteringPlan.eqTrebleGain}
                      onChange={(e) => handleManualPlanChange("eqTrebleGain", e.target.value)}
                      className="flex-1 accent-cyan-500 h-1 bg-slate-900 rounded-lg"
                      disabled={!rawAudioBuffer}
                    />
                    <span className="w-12 text-right text-[10px] font-mono text-cyan-400 font-bold">
                      {masteringPlan.eqTrebleGain > 0 ? "+" : ""}{masteringPlan.eqTrebleGain.toFixed(1)} dB
                    </span>
                  </div>
                </div>
              </div>

              {/* Dynamic Range Compressor */}
              <div className="p-3 bg-[#0f141c]/60 border border-slate-800/60 rounded-xl">
                <div className="flex justify-between items-center text-xs font-mono mb-1.5">
                  <span className="text-slate-300 font-semibold text-[11px]">Dynamics Compressor</span>
                  <span className="text-amber-400 text-[10px]">Ratio: {masteringPlan.compressorRatio.toFixed(1)}:1</span>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-1">
                  <div>
                    <label className="text-[9px] text-slate-500 font-mono">Threshold (dB)</label>
                    <input 
                      type="range"
                      min="-50"
                      max="0"
                      step="1"
                      value={masteringPlan.compressorThreshold}
                      onChange={(e) => handleManualPlanChange("compressorThreshold", e.target.value)}
                      className="w-full accent-amber-500 h-1 bg-slate-900 rounded-lg mt-1"
                      disabled={!rawAudioBuffer || masteringPlan.compressorRatio <= 1.0}
                    />
                    <span className="text-[10px] text-slate-400 font-mono block mt-0.5 text-right">
                      {masteringPlan.compressorThreshold} dB
                    </span>
                  </div>

                  <div>
                    <label className="text-[9px] text-slate-500 font-mono">Compressor Ratio</label>
                    <input 
                      type="range"
                      min="1.0"
                      max="20.0"
                      step="0.5"
                      value={masteringPlan.compressorRatio}
                      onChange={(e) => handleManualPlanChange("compressorRatio", e.target.value)}
                      className="w-full accent-amber-500 h-1 bg-slate-900 rounded-lg mt-1"
                      disabled={!rawAudioBuffer}
                    />
                    <span className="text-[10px] text-slate-400 font-mono block mt-0.5 text-right">
                      {masteringPlan.compressorRatio <= 1.0 ? "Bypass" : `${masteringPlan.compressorRatio.toFixed(1)}:1`}
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
            <p className="text-[10px] text-slate-300 leading-relaxed font-mono">
              {masteringPlan.verbDescription}
            </p>
          </div>
        </div>

        {/* Acoustic Diagnostics specs box (col-span-12 md:col-span-4 row-span-3) */}
        <div id="raw-acoustics-diagnostics" className="col-span-12 md:col-span-4 bg-[#0b0f15] border border-slate-800 rounded-2xl p-6 flex flex-col justify-between shadow-md">
          <div>
            <h2 className="text-lg font-mono font-bold text-white flex items-center gap-2 mb-4">
              <Activity size={18} className="text-emerald-400" />
              SAMPLED SPECTRAL SPECS
            </h2>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed font-sans mb-4">
              These statistical parameters represent scientific client-side acoustic properties parsed directly from decoded buffer arrays in your local context.
            </p>

            {rawAudioFeatures ? (
              <div className="space-y-4">
                
                {/* Audio Health Gauge */}
                <div className="p-3 bg-slate-900/60 border border-slate-800/60 rounded-xl">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[11px] font-mono text-slate-400 uppercase">QUALITY SCORE</span>
                    <span className="text-sm font-mono font-bold text-emerald-400">{analysisResponse ? `${analysisResponse.score}/100` : "TBD"}</span>
                  </div>
                  <div className="w-full bg-[#121822] h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-red-500 via-amber-400 to-emerald-400 h-full transition-all duration-300" 
                      style={{ width: `${analysisResponse ? analysisResponse.score : 0}%` }}
                    />
                  </div>
                  <p className="text-[8px] text-slate-500 font-mono mt-1">Calculated via acoustic noise density & gain balance ratios.</p>
                </div>

                {/* DB Level Gauges */}
                <div className="space-y-2.5">
                  
                  {/* Maximum volume */}
                  <div>
                    <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-0.5">
                      <span>Peak Volume (dBFS)</span>
                      <span className={rawAudioFeatures.maxVolumeDb > -1.5 ? "text-rose-400 font-semibold" : "text-slate-200"}>
                        {rawAudioFeatures.maxVolumeDb.toFixed(1)} dBFS
                      </span>
                    </div>
                    <div className="w-full bg-[#121822] h-1.5 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${rawAudioFeatures.maxVolumeDb > -1.5 ? "bg-rose-500" : "bg-cyan-500"}`} 
                        style={{ width: `${Math.max(0, 100 + rawAudioFeatures.maxVolumeDb)}%` }}
                      />
                    </div>
                  </div>

                  {/* Average dynamic loudness */}
                  <div>
                    <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-0.5">
                      <span>Average RMS Loudness</span>
                      <span className="text-slate-200 font-mono">
                        {rawAudioFeatures.avgVolumeDb.toFixed(1)} dBFS
                      </span>
                    </div>
                    <div className="w-full bg-[#121822] h-1.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-indigo-500 h-full" 
                        style={{ width: `${Math.max(0, 100 + rawAudioFeatures.avgVolumeDb)}%` }}
                      />
                    </div>
                  </div>

                  {/* Noise Floor */}
                  <div>
                    <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-0.5">
                      <span>Estimated Backdrop Noise Floor</span>
                      <span className={rawAudioFeatures.estimatedNoiseFloorDb > -45 ? "text-amber-400" : "text-emerald-400"}>
                        {rawAudioFeatures.estimatedNoiseFloorDb.toFixed(1)} dBFS
                      </span>
                    </div>
                    <div className="w-full bg-[#121822] h-1.5 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${rawAudioFeatures.estimatedNoiseFloorDb > -45 ? "bg-amber-500" : "bg-emerald-500"}`} 
                        style={{ width: `${Math.max(0, 100 + rawAudioFeatures.estimatedNoiseFloorDb)}%` }}
                      />
                    </div>
                  </div>

                  {/* Clipping indicator */}
                  <div className="flex items-center justify-between p-2.5 bg-[#121822] border border-slate-800 rounded-lg">
                    <span className="text-[10px] font-mono text-slate-400 uppercase">Digital Clipping Detected:</span>
                    <span className={`px-2 py-0.5 font-mono text-[9px] rounded font-bold uppercase border ${
                      rawAudioFeatures.clippingDetected 
                        ? "bg-rose-950/40 text-rose-300 border-rose-950 animate-pulse" 
                        : "bg-emerald-950/40 text-emerald-300 border-emerald-950"
                    }`}>
                      {rawAudioFeatures.clippingDetected ? "CLIPPING WARNING" : "SAFE / BALANCED"}
                    </span>
                  </div>

                  {/* Identified peaks */}
                  <div>
                    <span className="text-[9px] text-slate-500 font-mono uppercase tracking-wider block mb-1">Identified Frequency Resonance Peak Bands</span>
                    <div className="flex flex-wrap gap-1.5">
                      {rawAudioFeatures.frequencyPeaks.map((peak, idx) => (
                        <span 
                          key={idx} 
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
                <p className="text-[10px] font-mono text-slate-600 tracking-wider">SPECS RACK STANDBY</p>
                <p className="text-[9px] text-slate-600 font-sans leading-relaxed mt-0.5">Statistical measurements will render here dynamically.</p>
              </div>
            )}
          </div>

          <div className="border-t border-slate-805 border-slate-900 pt-4 mt-4">
            <span className="text-[9px] font-mono font-bold text-slate-500 tracking-wide block mb-1 uppercase">Sample Hardware Constraints</span>
            <div className="flex justify-between text-[10px] font-mono text-slate-400">
              <span>Sample Rate</span>
              <span>{rawAudioFeatures ? `${rawAudioFeatures.sampleRate} Hz` : "44100 Hz Reference"}</span>
            </div>
            <div className="flex justify-between text-[10px] font-mono text-slate-400 mt-1">
              <span>Total Duration</span>
              <span>{rawAudioFeatures ? `${rawAudioFeatures.duration.toFixed(2)}s` : "0.00s"}</span>
            </div>
          </div>
        </div>

        {/* AI Critique, Technical Markdown Report & Refinement Unit (col-span-12 md:col-span-8 row-span-3) */}
        <div id="ai-diagnostics-report-card" className="col-span-12 md:col-span-8 bg-[#0b0f15] border border-slate-800 rounded-2xl p-6 overflow-hidden flex flex-col justify-between shadow-md">
          <div className="flex flex-col h-full">
            
            {/* Custom Tab Panel bar */}
            <div className="flex items-center justify-between border-b border-slate-900 pb-3 mb-4">
              <div className="flex gap-2">
                <button
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
                    <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-ping"></span>
                  )}
                </button>
              </div>

              <span className="text-[10px] text-slate-500 font-mono md:inline hidden">Gemini AI Model: gemini-3.5-flash</span>
            </div>

            {/* Display contents */}
            <div className="flex-1 overflow-y-auto pr-1 max-h-[300px]">
              
              {/* TAB 1: Real-time diagnostic split details critique */}
              {activeReportTab === "critique" && (
                <div>
                  {analysisResponse ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="p-3 bg-[#111721] border border-slate-800 rounded-xl">
                          <span className="text-[10px] font-mono text-cyan-400 font-bold tracking-wider block mb-1 uppercase">⚡ Tone & Tape Hiss</span>
                          <p className="text-xs text-slate-350 leading-relaxed font-sans">{analysisResponse.critique.hiss}</p>
                        </div>
                        <div className="p-3 bg-[#111721] border border-slate-800 rounded-xl">
                          <span className="text-[10px] font-mono text-emerald-400 font-bold tracking-wider block mb-1 uppercase">🔊 Low Hum Resonances</span>
                          <p className="text-xs text-slate-350 leading-relaxed font-sans">{analysisResponse.critique.hum}</p>
                        </div>
                        <div className="p-3 bg-[#111721] border border-slate-800 rounded-xl">
                          <span className="text-[10px] font-mono text-rose-400 font-bold tracking-wider block mb-1 uppercase">🚨 Saturation & Clipping</span>
                          <p className="text-xs text-slate-350 leading-relaxed font-sans">{analysisResponse.critique.clipping}</p>
                        </div>
                        <div className="p-3 bg-[#111721] border border-slate-800 rounded-xl">
                          <span className="text-[10px] font-mono text-indigo-400 font-bold tracking-wider block mb-1 uppercase">📊 Sound Stage Dynamics</span>
                          <p className="text-xs text-slate-350 leading-relaxed font-sans">{analysisResponse.critique.dynamicRange}</p>
                        </div>
                      </div>

                      <div className="p-3.5 bg-slate-900/45 border border-slate-800/80 rounded-xl text-xs flex gap-2">
                        <span className="text-indigo-400 font-bold font-mono shrink-0">Engineer Summary:</span>
                        <p className="text-slate-300 leading-relaxed font-sans">{analysisResponse.critique.generalComments}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-12 text-center text-slate-600 font-mono select-none">
                      <ShieldAlert size={26} className="text-slate-700 mb-2" />
                      <p className="text-xs tracking-wider uppercase">NO ANALYTICAL DATA FOUND</p>
                      <p className="text-[10px] text-slate-650 font-sans mt-0.5 leading-relaxed">Submit raw audio. Gemini will generate deep diagnostic feedback on highfrequency hiss, humming resonances, clipping thresholds, and vocal focus ranges.</p>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: Markdown Expert Technical Review */}
              {activeReportTab === "markdown" && (
                <div className="bg-[#0b0e12] border border-slate-900 rounded-xl p-4 font-mono leading-relaxed max-w-full overflow-x-hidden">
                  {analysisResponse ? (
                    <div className="prose prose-invert prose-xs max-w-none text-slate-300">
                      {renderMarkdownText(analysisResponse.reportMarkdown)}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-12 text-center text-slate-600 font-mono select-none">
                      <FileText size={26} className="text-slate-700 mb-2" />
                      <p className="text-xs tracking-wider uppercase">NO WRITTEN REPORT GENERATED</p>
                      <p className="text-[10px] text-slate-650 font-sans mt-0.5">Please import/record and allow the model to analyze your acoustic structure.</p>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: Refinement Studio */}
              {activeReportTab === "studio" && (
                <div className="space-y-4">
                  {analysisResponse ? (
                    <>
                      <div className="p-3.5 bg-[#0f141c]/80 border border-slate-800 rounded-xl">
                        <span className="text-xs font-mono font-bold text-slate-300 block mb-2">💡 Quick Adapt Shortcut Presets</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {suggestions.map((s, idx) => (
                            <button
                              key={idx}
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
                        <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest block mb-1">Active Mastering Target Plan:</span>
                        <p className="text-xs font-sans text-slate-300 leading-relaxed font-semibold">
                          Gain: <span className="text-cyan-400">{masteringPlan.gainDb > 0 ? "+" : ""}{masteringPlan.gainDb}dB</span>, 
                          HPF Cutoff: <span className="text-indigo-400">{masteringPlan.highpassHz}Hz</span>, 
                          LPF Cutoff: <span className="text-indigo-400">{masteringPlan.lowpassHz}Hz</span>, 
                          Bass Boost: <span className="text-emerald-400">{masteringPlan.eqBassGain}dB</span>, 
                          Mid Boost: <span className="text-blue-400">{masteringPlan.eqMidGain}dB</span>, 
                          Treble Boost: <span className="text-cyan-400">{masteringPlan.eqTrebleGain}dB</span>
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-12 text-center text-slate-600 font-mono select-none">
                      <Sparkles size={26} className="text-slate-700 mb-2" />
                      <p className="text-xs tracking-wider uppercase">STUDIO STANDBY</p>
                      <p className="text-[10px] text-slate-650 font-sans mt-0.5">Acoustic models must be analyzed before entering parameter adaptation modes.</p>
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* In-context message box */}
            {analysisResponse && (
              <div className="mt-4 border-t border-slate-900 pt-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={userFeedback}
                    onChange={(e) => setUserFeedback(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRefineMastering(userFeedback);
                    }}
                    placeholder={refinementState.loading ? "Calculating fresh mastering parameters..." : "Instruct the engineer (e.g. 'Can you drop tape hiss and boost vocal presence?')..."}
                    className="flex-1 bg-[#0c1015] border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 font-sans"
                    disabled={refinementState.loading}
                    id="conversational-feedback-input"
                  />
                  <button
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
                <p className="text-[8px] text-slate-500 font-mono mt-1 text-right">Adaptive models will automatically rewrite DSP equalizer bands and compressors based on your description.</p>
              </div>
            )}

          </div>
        </div>

      </main>

      {/* Footer system */}
      <footer className="h-10 mt-6 px-2 flex items-center justify-between text-[10px] text-slate-500 font-mono uppercase tracking-widest border-t border-slate-900 pt-2 shrink-0">
        <div className="flex gap-5">
          <span>Session: <span className="text-emerald-400 font-bold">● ACTIVE</span></span>
          <span>Core Node ID: AIS-WEST-2</span>
          <span>Buffer Sample Limit: 120s max</span>
        </div>
        <div>
          Copyright © 2026 Vantage Systems Corp.
        </div>
      </footer>

    </div>
  );
}
