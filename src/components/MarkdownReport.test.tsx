import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MarkdownReport from "./MarkdownReport";

describe("MarkdownReport", () => {
  it("renders nothing for empty markdown", () => {
    const { container } = render(<MarkdownReport markdown="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the supported heading levels", () => {
    render(<MarkdownReport markdown={"# Report\n## Findings\n### Hiss"} />);

    expect(screen.getByRole("heading", { level: 2, name: "Report" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Findings" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "Hiss" })).toBeInTheDocument();
  });

  it("renders both bullet markers as list items", () => {
    render(<MarkdownReport markdown={"- Trim the low end\n* Tame the sibilance"} />);

    const lists = screen.getAllByRole("list");
    expect(lists).toHaveLength(2);
    expect(lists[0]).toHaveTextContent("Trim the low end");
    expect(lists[1]).toHaveTextContent("Tame the sibilance");
  });

  it("emphasizes bold runs and keeps the surrounding text", () => {
    const { container } = render(<MarkdownReport markdown="Cut **200 Hz** by 3 dB" />);

    const strong = container.querySelector("strong");
    expect(strong).toHaveTextContent("200 Hz");
    expect(screen.getByText(/Cut/)).toHaveTextContent("Cut 200 Hz by 3 dB");
  });

  it("renders plain paragraphs and tolerates blank lines", () => {
    const { container } = render(<MarkdownReport markdown={"First line\n\nSecond line"} />);

    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toHaveTextContent("First line");
    expect(paragraphs[1]).toHaveTextContent("Second line");
  });

  it("unescapes literal escaped newlines such as \\N, \\n, and \\r\\n", () => {
    const raw =
      "ACOUSTIC REPORT\\N\\N### EXECUTIVE SUMMARY\\NFirst paragraph.\\N\\nSecond paragraph.";
    const { container } = render(<MarkdownReport markdown={raw} />);

    expect(
      screen.getByRole("heading", { level: 4, name: "EXECUTIVE SUMMARY" }),
    ).toBeInTheDocument();
    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/First paragraph/)).toBeInTheDocument();
    expect(screen.getByText(/Second paragraph/)).toBeInTheDocument();
  });

  it("renders numbered list items properly", () => {
    render(
      <MarkdownReport
        markdown={"1. High-pass filter at 80 Hz\n2. Bell cut at 1.2 kHz\n3. Gentle compression"}
      />,
    );

    const orderedLists = screen.getAllByRole("list");
    expect(orderedLists.length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText(/High-pass filter at 80 Hz/)).toBeInTheDocument();
    expect(screen.getByText(/Bell cut at 1.2 kHz/)).toBeInTheDocument();
    expect(screen.getByText(/Gentle compression/)).toBeInTheDocument();
  });

  it("normalizes screaming all-caps text into clean readable sentence case while preserving audio units", () => {
    render(
      <MarkdownReport
        markdown={
          "### EXECUTIVE SUMMARY\nTHE RECORDING EXHIBITS PRISTINE NOISE FLOOR (-75.71 DBFS) AND PEAK AT -1.57 DBFS ACROSS 406 HZ TO 2439 HZ."
        }
      />,
    );

    expect(
      screen.getByText(
        "The recording exhibits pristine noise floor (-75.71 dBFS) and peak at -1.57 dBFS across 406 Hz to 2439 Hz.",
      ),
    ).toBeInTheDocument();
  });
});
