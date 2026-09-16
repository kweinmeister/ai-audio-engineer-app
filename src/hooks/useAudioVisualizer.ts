/**
 * Provide a React hook for rendering real-time frequency spectrum and
 * oscilloscope wave animations onto an HTML5 canvas element.
 */

import { useEffect, useRef } from "react";

export interface AudioVisualizerOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  analyserNodeRef: React.RefObject<AnalyserNode | null>;
  isActive?: boolean;
}

/**
 * Render real-time audio visualization using requestAnimationFrame.
 */
export function useAudioVisualizer({
  canvasRef,
  analyserNodeRef,
  isActive = true,
}: AudioVisualizerOptions): void {
  const animationFrameIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isActive) {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let bufferLength = 128;
    let dataArray = new Uint8Array(bufferLength);
    let timeDomainArray = new Uint8Array(bufferLength);

    const render = () => {
      animationFrameIdRef.current = requestAnimationFrame(render);

      const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      const displayWidth = Math.floor((canvas.clientWidth || canvas.width) * dpr);
      const displayHeight = Math.floor((canvas.clientHeight || canvas.height) * dpr);

      if (canvas.clientWidth > 0 && canvas.clientHeight > 0) {
        if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
          canvas.width = displayWidth;
          canvas.height = displayHeight;
        }
      }

      const width = canvas.width;
      const height = canvas.height;

      if (analyserNodeRef.current) {
        bufferLength = analyserNodeRef.current.frequencyBinCount;
        if (dataArray.length !== bufferLength) {
          dataArray = new Uint8Array(bufferLength);
          timeDomainArray = new Uint8Array(bufferLength);
        }
        analyserNodeRef.current.getByteFrequencyData(dataArray);
        analyserNodeRef.current.getByteTimeDomainData(timeDomainArray);
      } else {
        dataArray.fill(0);
        timeDomainArray.fill(128);
      }

      // Background draw slate
      ctx.fillStyle = "#0c1016";
      ctx.fillRect(0, 0, width, height);

      // Retro grid mesh pattern
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

      // Colorful frequency spectrum bars
      const barWidth = (width / bufferLength) * 2.8;
      let bx = 0;

      const grad = ctx.createLinearGradient(0, height, 0, 0);
      grad.addColorStop(0, "#4f46e5"); // deep indigo
      grad.addColorStop(0.4, "#06b6d4"); // neon cyan
      grad.addColorStop(1, "#10b981"); // vibrant emerald

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * height * 0.85;
        if (barHeight > 0) {
          ctx.fillStyle = grad;
          ctx.fillRect(bx, height - barHeight, barWidth - 1, barHeight);
        }
        bx += barWidth;
      }

      // Glowing oscilloscope timeline wave
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
    };

    render();

    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    };
  }, [canvasRef, analyserNodeRef, isActive]);
}
