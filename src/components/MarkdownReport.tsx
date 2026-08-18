import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

interface MarkdownReportProps {
  /** Report body in the small Markdown subset the model is asked to emit. */
  markdown: string;
}

/** Split a line into plain text and `**bold**` runs. */
function formatBoldSegments(text: string): ReactNode[] {
  const segments = text.split(/(\*\*.*?\*\*)/g);
  return segments.map((seg, i) => {
    if (seg.startsWith("**") && seg.endsWith("**")) {
      return (
        // biome-ignore lint/suspicious/noArrayIndexKey: segments are re-derived from the source text on every render, so position is identity
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
 * blank spacers, and inline bold runs.
 */
export default function MarkdownReport({ markdown }: MarkdownReportProps) {
  if (!markdown) return null;

  return (
    <>
      {markdown.split("\n").map((line, idx) => {
        const cleanLine = line.trim();
        // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional and re-derived from
        // the source text on every render, so the index is their identity.
        const key = idx;

        if (cleanLine.startsWith("### ")) {
          return (
            <h4
              key={key}
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
              key={key}
              className="text-sm font-mono font-bold text-indigo-400 mt-5 mb-3 border-b border-slate-800 pb-1 uppercase tracking-wide"
            >
              {cleanLine.replace("## ", "")}
            </h3>
          );
        }
        if (cleanLine.startsWith("# ")) {
          return (
            <h2
              key={key}
              className="text-base font-mono font-bold text-slate-100 mt-6 mb-4 font-semibold uppercase"
            >
              {cleanLine.replace("# ", "")}
            </h2>
          );
        }
        if (cleanLine.startsWith("- ") || cleanLine.startsWith("* ")) {
          return (
            <ul
              key={key}
              className="list-disc list-inside text-slate-300 ml-2 py-0.5 text-xs font-sans leading-relaxed"
            >
              {formatBoldSegments(cleanLine.substring(2))}
            </ul>
          );
        }
        if (cleanLine === "") {
          return <div key={key} className="h-2"></div>;
        }
        return (
          <p key={key} className="text-slate-300 text-xs font-sans leading-relaxed my-1">
            {formatBoldSegments(line)}
          </p>
        );
      })}
    </>
  );
}
