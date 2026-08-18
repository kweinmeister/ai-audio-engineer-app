import { AlertCircle, Mic, Sparkles, Trash2, Upload } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { analyzeAudioBuffer } from "../lib/audioAnalysis";
import { formatSecs } from "../lib/format";
import type { AudioFeatures } from "../types";

interface AudioAnalyzerDeckProps {
  onAnalysisComplete: (
    features: AudioFeatures,
    base64Data: string,
    mimeType: string,
    audioBuffer: AudioBuffer,
  ) => void;
  audioBuffer: AudioBuffer | null;
  onClear: () => void;
}

export default function AudioAnalyzerDeck({
  onAnalysisComplete,
  audioBuffer,
  onClear,
}: AudioAnalyzerDeckProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Drag handles
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files?.[0]) {
      const file = e.dataTransfer.files[0];
      await processAudioFile(file);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      await processAudioFile(file);
    }
  };

  // Process the uploaded audio file and analyze it
  const processAudioFile = async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      if (!file.type.startsWith("audio/")) {
        throw new Error(
          "Invalid file type. Please upload a standard audio file (MP3, WAV, WebM, OGG).",
        );
      }

      // Convert file to ArrayBuffer for Web Audio Decoding
      const arrayBuffer = await file.arrayBuffer();
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

      let decodedBuffer: AudioBuffer;
      try {
        decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      } catch (_decodeErr) {
        throw new Error(
          "Could not decode audio data. Please ensure it is a valid MP3, WAV, or Ogg.",
        );
      }

      // Perform deep client-side audio analysis
      const features = analyzeAudioBuffer(decodedBuffer, file.name, file.size, file.type);

      // Convert file to base64 audio to transmit to server
      const base64Data = await convertBufferToBase64(file);

      onAnalysisComplete(features, base64Data, file.type, decodedBuffer);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred while analyzing the audio file.");
    } finally {
      setLoading(false);
    }
  };

  const convertBufferToBase64 = (file: File | Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const resultString = reader.result as string;
        const base64Index = resultString.indexOf(",") + 1;
        resolve(resultString.substring(base64Index));
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Microphone recording functions
  const startRecording = async () => {
    setError(null);
    audioChunksRef.current = [];
    setRecordTime(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicStream(stream);

      // Determine correct mime type
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/ogg";

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        setLoading(true);
        try {
          const recordedBlob = new Blob(audioChunksRef.current, { type: mimeType });
          const recordingFile = new File([recordedBlob], `microphone_rec_${Date.now()}.webm`, {
            type: mimeType,
          });

          const arrayBuffer = await recordingFile.arrayBuffer();
          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);

          const features = analyzeAudioBuffer(
            decodedBuffer,
            recordingFile.name,
            recordingFile.size,
            recordingFile.type,
          );
          const base64Data = await convertBufferToBase64(recordingFile);

          onAnalysisComplete(features, base64Data, recordingFile.type, decodedBuffer);
        } catch (err: any) {
          console.error("Recording process failure: ", err);
          setError("Microphone processing failed. Try uploading a file instead.");
        } finally {
          setLoading(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        setRecordTime((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error(err);
      setError("Microphone permission denied or source unavailable.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state !== "inactive") {
      mediaRecorderRef.current?.stop();
    }
    if (micStream) {
      for (const track of micStream.getTracks()) {
        track.stop();
      }
      setMicStream(null);
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return (
    <div
      id="audio-analyzer-deck"
      className="bg-[#121820] border border-slate-800 rounded-xl p-6 shadow-xl relative overflow-hidden"
    >
      <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-emerald-500 via-cyan-500 to-indigo-500"></div>

      <div className="flex justify-between items-center mb-5">
        <div>
          <h2 className="text-lg font-mono font-bold text-slate-100 flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-cyan-400 rounded-full animate-pulse"></span>
            STEP 1: IMPORT AUDIO SOURCE
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Upload a raw, unmastered audio recording or speak directly into your microphone.
          </p>
        </div>
        {audioBuffer && (
          <button
            type="button"
            onClick={onClear}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/80 hover:bg-rose-950/60 text-slate-300 hover:text-rose-200 border border-slate-700/80 hover:border-rose-900/60 rounded-md transition text-xs font-medium"
            id="clear-audio-btn"
          >
            <Trash2 size={13} />
            Reset Tape
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 bg-rose-950/40 text-rose-200 border border-rose-900/60 px-4 py-3 rounded-lg text-xs flex items-start gap-2">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-10 border border-dashed border-slate-800 rounded-lg bg-slate-950/40">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-cyan-500 border-t-transparent mb-3"></div>
          <p className="text-sm font-mono text-cyan-400">DECIPHERING AUDIO WAVEFORM...</p>
          <p className="text-xs text-slate-500 mt-1">
            Reading digital frames, calculating levels, finding clipping peaks...
          </p>
        </div>
      ) : isRecording ? (
        <div className="flex flex-col items-center justify-center py-10 border border-dashed border-red-900/60 rounded-lg bg-red-950/10">
          <div className="relative mb-4">
            <div className="absolute inset-0 bg-red-500 rounded-full animate-ping opacity-25"></div>
            <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center relative text-white">
              <Mic size={24} className="animate-pulse" />
            </div>
          </div>
          <p className="text-base font-mono font-bold text-red-400 tracking-wider">
            RECORDING RAW AUDIO
          </p>
          <p className="text-3xl font-mono font-bold text-slate-100 mt-1.5">
            {formatSecs(recordTime)}
          </p>
          <p className="text-xs text-slate-400 mt-1">Estimating real-time microphone quality...</p>
          <button
            type="button"
            onClick={stopRecording}
            className="mt-5 px-6 py-2 bg-red-600 hover:bg-red-500 text-slate-100 font-mono text-xs font-semibold rounded-lg shadow-md transition-all hover:scale-105 border border-red-500"
            id="stop-rec-btn"
          >
            STOP AND ANALYZE
          </button>
        </div>
      ) : !audioBuffer ? (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* File drag-drop input */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: drag and drop is a pointer-only
              enhancement; the overlaid file input is the keyboard accessible control. */}
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            className={`md:col-span-3 border-2 border-dashed rounded-lg flex flex-col items-center justify-center py-10 px-6 transition text-center relative cursor-pointer ${
              dragActive
                ? "border-cyan-500 bg-cyan-950/10"
                : "border-slate-800 bg-[#0c1015] hover:border-slate-700 hover:bg-slate-900/40"
            }`}
          >
            <input
              type="file"
              accept="audio/*"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              onChange={handleFileChange}
              id="audio-file-input"
            />
            <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center text-slate-400 mb-2.5 border border-slate-800">
              <Upload size={18} />
            </div>
            <p className="text-xs font-semibold text-slate-300">
              Drag & drop your file here, or click to browse
            </p>
            <p className="text-[10px] text-slate-500 mt-1">
              Supports MP3, WAV, WebM, OGG, M4A (Limit 15MB)
            </p>
          </div>

          {/* Micro Recording container */}
          <div className="md:col-span-2 border border-slate-800 rounded-lg bg-[#0c1015] p-5 flex flex-col justify-between hover:bg-slate-900/40 hover:border-slate-700 transition">
            <div>
              <h3 className="text-xs font-mono font-bold text-slate-300 tracking-wider flex items-center gap-1.5 uppercase">
                <Mic size={14} className="text-rose-500" /> Use Microphone
              </h3>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                Directly capture high-fidelity physical acoustic material directly from your local
                browser context.
              </p>
            </div>
            <button
              type="button"
              onClick={startRecording}
              className="mt-4 w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-slate-100 font-mono text-xs font-semibold rounded-lg shadow-md transition-all border border-cyan-500/30"
              id="start-rec-btn"
            >
              <Mic size={14} />
              OPEN ACOUSTIC MIC
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-[#0b0e12] border border-slate-800/80 rounded-lg p-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-cyan-950/40 border border-cyan-800/40 flex items-center justify-center text-cyan-400 animate-pulse">
              <Sparkles size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-mono font-semibold text-slate-200 truncate">
                  {audioBuffer ? "Raw Audio Deck Ready" : "Loading Buffer..."}
                </p>
                <span className="px-2 py-0.5 bg-emerald-900/40 border border-emerald-800 text-emerald-300 text-[9px] rounded font-mono uppercase">
                  Decoded
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5 font-mono">
                {audioBuffer.numberOfChannels}{" "}
                {audioBuffer.numberOfChannels === 1 ? "Channel" : "Channels"} /{" "}
                {(audioBuffer.length / 1000).toFixed(0)}k Samples / {audioBuffer.sampleRate} Hz
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
