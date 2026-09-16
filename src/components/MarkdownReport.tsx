import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

interface MarkdownReportProps {
  /** Report body in the Markdown subset the model emits or raw text. */
  markdown: string;
}

const AUDIO_UNIT_REPLACEMENTS: Record<string, string> = {
  dbfs: "dBFS",
  db: "dB",
  hz: "Hz",
  khz: "kHz",
  eq: "EQ",
  dsp: "DSP",
  rms: "RMS",
  lufs: "LUFS",
  lu: "LU",
  hpf: "HPF",
  lpf: "LPF",
  ai: "AI",
  aac: "AAC",
  mp3: "MP3",
  wav: "WAV",
};

/**
 * Convert screaming all-caps text into natural sentence case while preserving
 * audio industry acronyms and units (dBFS, Hz, EQ, etc.).
 */
export function normalizeScreamingCaps(text: string): string {
  const hasLower = /[a-z]/.test(text);
  const upperCount = (text.match(/[A-Z]/g) || []).length;

  // Only normalize if text is predominantly uppercase and long enough
  if (hasLower || upperCount < 10) {
    return text;
  }

  let formatted = text.toLowerCase();

  // Capitalize beginnings of sentences and post-bold markers
  formatted = formatted.replace(
    /(^\s*|[.!?]\s+|\*\*\s*)([a-z])/g,
    (_, prefix, char) => `${prefix}${char.toUpperCase()}`,
  );

  // Restore technical audio abbreviations
  formatted = formatted.replace(/\b([a-z]+)\b/gi, (match) => {
    const lower = match.toLowerCase();
    return AUDIO_UNIT_REPLACEMENTS[lower] ?? match;
  });

  return formatted;
}

/**
 * Unescape raw literal escaped newline tokens (\N, \n, \r\n) that can arise
 * when JSON schemas or models emit literal backslash sequences.
 */
export function normalizeNewlines(text: string): string {
  if (!text) return "";
  return text.replace(/\\r\\n|\\n|\\N/gi, "\n").replace(/\r\n/g, "\n");
}

/** Split a line into plain text and `**bold**` runs. */
function formatBoldSegments(text: string): ReactNode[] {
  const normalized = normalizeScreamingCaps(text);
  const segments = normalized.split(/(\*\*.*?\*\*)/g);
  return segments.map((seg, i) => {
    if (seg.startsWith("**") && seg.endsWith("**")) {
      return (
        <strong key={i} className="text-cyan-300 font-semibold">
          {seg.slice(2, -2)}
        </strong>
      );
    }
    return seg;
  });
}

/**
 * Render the engineer report without pulling in a full Markdown parser.
 *
 * Support the subset the analysis prompt asks for: headings, bullet lines,
 * numbered lists, blank spacers, and inline bold runs. Unescape literal
 * newline tokens and normalize screaming uppercase blocks into clean typography.
 */
export default function MarkdownReport({ markdown }: MarkdownReportProps) {
  if (!markdown) return null;

  const cleanMarkdown = normalizeNewlines(markdown);
  const lines = cleanMarkdown.split("\n");

  return (
    <>
      {lines.map((line, idx) => {
        const cleanLine = line.trim();

        if (cleanLine.startsWith("### ")) {
          return (
            <h4
              key={idx}
              className="text-xs font-mono font-bold text-cyan-400 mt-4 mb-2 tracking-wider flex items-center gap-1.5"
            >
              <ChevronRight size={12} />
              {cleanLine.replace("### ", "")}
            </h4>
          );
        }
        if (cleanLine.startsWith("## ")) {
          return (
            <h3
              key={idx}
              className="text-sm font-mono font-bold text-indigo-400 mt-5 mb-3 border-b border-slate-800 pb-1 uppercase tracking-wide"
            >
              {cleanLine.replace("## ", "")}
            </h3>
          );
        }
        if (cleanLine.startsWith("# ")) {
          return (
            <h2
              key={idx}
              className="text-base font-mono font-bold text-slate-100 mt-6 mb-4 font-semibold uppercase"
            >
              {cleanLine.replace("# ", "")}
            </h2>
          );
        }
        if (cleanLine.startsWith("- ") || cleanLine.startsWith("* ")) {
          return (
            <ul
              key={idx}
              className="list-disc list-inside text-slate-300 ml-2 py-0.5 text-xs font-sans leading-relaxed"
            >
              {formatBoldSegments(cleanLine.substring(2))}
            </ul>
          );
        }
        const numberedMatch = cleanLine.match(/^(\d+)\.\s+(.*)$/);
        if (numberedMatch) {
          const [, num, itemContent] = numberedMatch;
          return (
            <ol
              key={idx}
              className="list-decimal list-inside text-slate-300 ml-2 py-0.5 text-xs font-sans leading-relaxed"
              start={Number.parseInt(num, 10)}
            >
              {formatBoldSegments(itemContent)}
            </ol>
          );
        }
        if (cleanLine === "") {
          return <div key={idx} className="h-2"></div>;
        }
        return (
          <p key={idx} className="text-slate-300 text-xs font-sans leading-relaxed my-1">
            {formatBoldSegments(line)}
          </p>
        );
      })}
    </>
  );
}
