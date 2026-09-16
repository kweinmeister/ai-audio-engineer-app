interface WindowWithLegacyAudio {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

/**
 * Create an AudioContext, falling back to the prefixed Safari constructor.
 *
 * Throw when neither constructor exists so callers surface a real message
 * instead of a `not a constructor` type error.
 */
export function createAudioContext(): AudioContext {
  const legacyWindow = window as WindowWithLegacyAudio;
  const AudioContextCtor = legacyWindow.AudioContext ?? legacyWindow.webkitAudioContext;

  if (!AudioContextCtor) {
    throw new Error("Web Audio is not supported in this browser.");
  }

  return new AudioContextCtor();
}

/**
 * Decode an ArrayBuffer into an AudioBuffer using a temporary AudioContext.
 *
 * Automatically close the context when decoding completes or fails to prevent
 * exceeding browser AudioContext limits.
 */
export async function decodeAudioDataWithAutoClose(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
  const ctx = createAudioContext();
  try {
    return await ctx.decodeAudioData(arrayBuffer);
  } finally {
    await ctx.close();
  }
}
