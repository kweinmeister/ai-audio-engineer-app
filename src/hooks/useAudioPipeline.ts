/**
 * Provide a React hook for managing the Web Audio API DSP node graph,
 * audio playback timeline, and real-time parameter modulation.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createAudioContext } from "../lib/audioContext";
import { DEFAULT_MASTERING_PLAN, type MasteringPlan } from "../types";

export interface AudioPipelineHook {
  rawAudioBuffer: AudioBuffer | null;
  setRawAudioBuffer: (buffer: AudioBuffer | null) => void;
  masteringPlan: MasteringPlan;
  setMasteringPlan: (plan: MasteringPlan | ((prev: MasteringPlan) => MasteringPlan)) => void;
  isDspActive: boolean;
  setIsDspActive: (active: boolean | ((prev: boolean) => boolean)) => void;
  toggleDsp: () => void;
  isPlaying: boolean;
  playbackProgress: number; // 0 to 1
  currentTime: number; // in seconds
  duration: number; // in seconds
  initAudioChain: (buffer: AudioBuffer) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  seekToTime: (timeSeconds: number) => void;
  stopPlayback: () => void;
  resetPipeline: () => void;
  analyserNodeRef: React.RefObject<AnalyserNode | null>;
  audioContextRef: React.RefObject<AudioContext | null>;
}

export function useAudioPipeline(): AudioPipelineHook {
  const [rawAudioBuffer, setRawAudioBuffer] = useState<AudioBuffer | null>(null);
  const [masteringPlan, setMasteringPlan] = useState<MasteringPlan>(DEFAULT_MASTERING_PLAN);
  const [isDspActive, setIsDspActive] = useState<boolean>(true);

  // Playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackProgress, setPlaybackProgress] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);

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

  // Precision tracking refs to avoid stale animation / timer loops
  const isPlayingRef = useRef<boolean>(false);
  const rawAudioBufferRef = useRef<AudioBuffer | null>(null);
  const startCtxTimeRef = useRef<number>(0);
  const playbackOffsetRef = useRef<number>(0);
  const timerFrameRef = useRef<number | null>(null);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    rawAudioBufferRef.current = rawAudioBuffer;
  }, [rawAudioBuffer]);

  /**
   * Apply current mastering parameters to active Web Audio DSP nodes.
   */
  const updateDspNodeParameters = useCallback((plan: MasteringPlan, dspEnabled: boolean) => {
    if (
      !gainNodeRef.current ||
      !highpassNodeRef.current ||
      !lowpassNodeRef.current ||
      !bassEQNodeRef.current ||
      !midEQNodeRef.current ||
      !trebleEQNodeRef.current ||
      !compressorNodeRef.current
    ) {
      return;
    }

    const ctx = audioContextRef.current;
    if (!ctx) return;

    const now = ctx.currentTime;

    if (dspEnabled) {
      // Linear makeup gain: 10^(dB/20) maps decibels to linear scalar amplitude
      const linearGain = 10 ** (plan.gainDb / 20);
      gainNodeRef.current.gain.linearRampToValueAtTime(linearGain, now + 0.05);

      // Highpass (low-cut): Cleans subsonic rumble (20-40Hz) and speech plosives (60-100Hz).
      // Bypassed (allpass) at <= 15Hz to avoid non-physical DC phase distortion.
      if (plan.highpassHz > 15) {
        highpassNodeRef.current.type = "highpass";
        highpassNodeRef.current.frequency.setValueAtTime(plan.highpassHz, now);
      } else {
        highpassNodeRef.current.type = "allpass";
      }

      // Lowpass (high-cut): Rolls off tape hiss / ultrasonic noise (14-18kHz).
      // Bypassed (allpass) at >= 19500Hz to preserve full audible brilliance.
      if (plan.lowpassHz < 19500) {
        lowpassNodeRef.current.type = "lowpass";
        lowpassNodeRef.current.frequency.setValueAtTime(plan.lowpassHz, now);
      } else {
        lowpassNodeRef.current.type = "allpass";
      }

      // 3-Band Parametric EQ: Wide mastering Q of 1.0 (~1.4 octaves) for musical tone shaping
      bassEQNodeRef.current.frequency.setValueAtTime(plan.eq.bass.hz, now);
      bassEQNodeRef.current.gain.linearRampToValueAtTime(plan.eq.bass.gain, now + 0.05);

      midEQNodeRef.current.frequency.setValueAtTime(plan.eq.mid.hz, now);
      midEQNodeRef.current.gain.linearRampToValueAtTime(plan.eq.mid.gain, now + 0.05);

      trebleEQNodeRef.current.frequency.setValueAtTime(plan.eq.treble.hz, now);
      trebleEQNodeRef.current.gain.linearRampToValueAtTime(plan.eq.treble.gain, now + 0.05);

      // Dynamics Compressor:
      // - 12ms attack preserves punchy initial consonants and percussion transients.
      // - 220ms release prevents pumping while maintaining transparent leveling.
      // - 25dB soft knee smoothly rounds onset around the threshold.
      if (plan.compressorRatio > 1.01) {
        compressorNodeRef.current.threshold.setValueAtTime(plan.compressorThreshold, now);
        compressorNodeRef.current.ratio.setValueAtTime(plan.compressorRatio, now);
        compressorNodeRef.current.attack.setValueAtTime(0.012, now);
        compressorNodeRef.current.release.setValueAtTime(0.22, now);
        compressorNodeRef.current.knee.setValueAtTime(25, now);
      } else {
        compressorNodeRef.current.ratio.setValueAtTime(1.0, now);
      }
    } else {
      // Transparent bypass mode: unity gain, allpass filters, flat EQ, 1:1 compression
      gainNodeRef.current.gain.linearRampToValueAtTime(1.0, now + 0.05);
      highpassNodeRef.current.type = "allpass";
      lowpassNodeRef.current.type = "allpass";
      bassEQNodeRef.current.gain.linearRampToValueAtTime(0, now + 0.05);
      midEQNodeRef.current.gain.linearRampToValueAtTime(0, now + 0.05);
      trebleEQNodeRef.current.gain.linearRampToValueAtTime(0, now + 0.05);
      compressorNodeRef.current.ratio.setValueAtTime(1.0, now);
    }
  }, []);

  // Update nodes whenever plan or bypass state updates
  useEffect(() => {
    updateDspNodeParameters(masteringPlan, isDspActive);
  }, [masteringPlan, isDspActive, updateDspNodeParameters]);

  /**
   * Build the Web Audio DSP node chain and initialize registers.
   */
  const initAudioChain = useCallback(
    async (_buffer: AudioBuffer) => {
      const ctx = createAudioContext();
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

      // Connect node chain
      highpass.connect(lowpass);
      lowpass.connect(bassEQ);
      bassEQ.connect(midEQ);
      midEQ.connect(trebleEQ);
      trebleEQ.connect(compressor);
      compressor.connect(gainNode);
      gainNode.connect(analyzer);
      analyzer.connect(ctx.destination);

      // Store in refs
      highpassNodeRef.current = highpass;
      lowpassNodeRef.current = lowpass;
      bassEQNodeRef.current = bassEQ;
      midEQNodeRef.current = midEQ;
      trebleEQNodeRef.current = trebleEQ;
      compressorNodeRef.current = compressor;
      gainNodeRef.current = gainNode;
      analyserNodeRef.current = analyzer;

      updateDspNodeParameters(masteringPlan, isDspActive);
    },
    [masteringPlan, isDspActive, updateDspNodeParameters],
  );

  /**
   * Update playback progress smoothly on animation frame.
   */
  const updatePlaybackProgress = useCallback(() => {
    if (isPlayingRef.current && rawAudioBufferRef.current && audioContextRef.current) {
      const elapsed = audioContextRef.current.currentTime - startCtxTimeRef.current;
      const totalDuration = rawAudioBufferRef.current.duration;
      const rawTime = Math.min(totalDuration, playbackOffsetRef.current + elapsed);

      setCurrentTime(rawTime);
      setPlaybackProgress(totalDuration > 0 ? rawTime / totalDuration : 0);

      if (rawTime >= totalDuration) {
        setIsPlaying(false);
        setCurrentTime(0);
        setPlaybackProgress(0);
        playbackOffsetRef.current = 0;
        if (sourceNodeRef.current) {
          try {
            sourceNodeRef.current.stop();
          } catch (_e) {
            // Ignore stop errors if already completed
          }
          sourceNodeRef.current = null;
        }
        return;
      }

      timerFrameRef.current = requestAnimationFrame(updatePlaybackProgress);
    }
  }, []);

  /**
   * Stop active playback source and clear timer frames.
   */
  const stopPlayback = useCallback(() => {
    setIsPlaying(false);
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
      } catch (_e) {
        // Ignore already stopped error
      }
      sourceNodeRef.current = null;
    }
    if (timerFrameRef.current) {
      cancelAnimationFrame(timerFrameRef.current);
      timerFrameRef.current = null;
    }
  }, []);

  /**
   * Seek playback to an absolute time in seconds.
   */
  const seekToTime = useCallback(
    (targetTimeSeconds: number) => {
      if (!rawAudioBufferRef.current) return;

      const duration = rawAudioBufferRef.current.duration;
      const clamped = Math.max(0, Math.min(duration, targetTimeSeconds));

      playbackOffsetRef.current = clamped;
      setCurrentTime(clamped);
      setPlaybackProgress(duration > 0 ? clamped / duration : 0);

      if (isPlayingRef.current) {
        if (sourceNodeRef.current) {
          try {
            sourceNodeRef.current.stop();
          } catch (_e) {
            // Ignore
          }
          sourceNodeRef.current = null;
        }

        const ctx = audioContextRef.current;
        if (!ctx) return;

        const sourceNode = ctx.createBufferSource();
        sourceNode.buffer = rawAudioBufferRef.current;
        sourceNode.connect(highpassNodeRef.current || ctx.destination);
        sourceNodeRef.current = sourceNode;

        startCtxTimeRef.current = ctx.currentTime;
        updateDspNodeParameters(masteringPlan, isDspActive);

        sourceNode.start(0, clamped);
      }
    },
    [masteringPlan, isDspActive, updateDspNodeParameters],
  );

  /**
   * Toggle between play and pause states.
   */
  const togglePlayPause = useCallback(async () => {
    if (!rawAudioBuffer) return;

    if (!audioContextRef.current) {
      await initAudioChain(rawAudioBuffer);
    }

    const ctx = audioContextRef.current;
    if (!ctx) return;

    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    if (isPlaying) {
      setIsPlaying(false);
      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.stop();
        } catch (_e) {
          // Ignore
        }
        sourceNodeRef.current = null;
      }

      const elapsed = ctx.currentTime - startCtxTimeRef.current;
      playbackOffsetRef.current = Math.min(
        rawAudioBuffer.duration,
        playbackOffsetRef.current + elapsed,
      );

      if (timerFrameRef.current) {
        cancelAnimationFrame(timerFrameRef.current);
        timerFrameRef.current = null;
      }
    } else {
      setIsPlaying(true);

      const sourceNode = ctx.createBufferSource();
      sourceNode.buffer = rawAudioBuffer;
      sourceNode.connect(highpassNodeRef.current || ctx.destination);
      sourceNodeRef.current = sourceNode;

      startCtxTimeRef.current = ctx.currentTime;
      updateDspNodeParameters(masteringPlan, isDspActive);

      sourceNode.start(0, playbackOffsetRef.current);

      timerFrameRef.current = requestAnimationFrame(updatePlaybackProgress);
    }
  }, [
    rawAudioBuffer,
    isPlaying,
    initAudioChain,
    updateDspNodeParameters,
    masteringPlan,
    isDspActive,
    updatePlaybackProgress,
  ]);

  /**
   * Toggle the bypass state for DSP processing.
   */
  const toggleDsp = useCallback(() => {
    setIsDspActive((prev) => !prev);
  }, []);

  /**
   * Reset audio graph, playback positions, and plan settings.
   */
  const resetPipeline = useCallback(() => {
    stopPlayback();
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (_e) {
        // Ignore
      }
      audioContextRef.current = null;
    }

    setRawAudioBuffer(null);
    setIsPlaying(false);
    setPlaybackProgress(0);
    setCurrentTime(0);
    playbackOffsetRef.current = 0;
    setMasteringPlan(DEFAULT_MASTERING_PLAN);
    setIsDspActive(true);
  }, [stopPlayback]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopPlayback();
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
        } catch (_e) {
          // Ignore
        }
      }
    };
  }, [stopPlayback]);

  return {
    rawAudioBuffer,
    setRawAudioBuffer,
    masteringPlan,
    setMasteringPlan,
    isDspActive,
    setIsDspActive,
    toggleDsp,
    isPlaying,
    playbackProgress,
    currentTime,
    duration: rawAudioBuffer?.duration ?? 0,
    initAudioChain,
    togglePlayPause,
    seekToTime,
    stopPlayback,
    resetPipeline,
    analyserNodeRef,
    audioContextRef,
  };
}
