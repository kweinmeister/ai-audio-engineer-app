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
});
