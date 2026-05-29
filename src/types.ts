export interface AudioFeatures {
  duration: number; // in seconds
  sampleRate: number; // in Hz
  maxVolumeDb: number; // in dB (e.g. 0 to -60)
  avgVolumeDb: number; // in dB
  estimatedNoiseFloorDb: number; // in dB
  clippingDetected: boolean;
  frequencyPeaks: number[]; // prominent frequencies
  fileName: string;
  fileSize: number; // in bytes
  mimeType: string;
}

export interface AudioCritique {
  hiss: string;
  hum: string;
  clipping: string;
  dynamicRange: string;
  generalComments: string;
}

export interface MasteringPlan {
  gainDb: number;
  highpassHz: number; // 0 if bypassed
  lowpassHz: number; // 24000 if bypassed
  eqBassHz: number;
  eqBassGain: number; // in dB
  eqMidHz: number;
  eqMidGain: number; // in dB
  eqTrebleHz: number;
  eqTrebleGain: number; // in dB
  compressorThreshold: number; // in dB
  compressorRatio: number; // e.g. 1 to 20
  verbDescription: string;
}

export interface AnalyzeResponse {
  score: number; // 0 to 100
  critique: AudioCritique;
  masteringPlan: MasteringPlan;
  reportMarkdown: string;
}
