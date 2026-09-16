import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AudioCritique } from "../types";
import { CritiqueView } from "./CritiqueView";

describe("CritiqueView", () => {
  const mockCritique: AudioCritique = {
    hiss: "Clean signal with low tape hiss.",
    hum: "Noticeable 60Hz hum around power cables.",
    clipping: "Minor transient clipping during chorus.",
    dynamicRange: "Well-balanced dynamic range.",
    generalComments: "Solid home-studio vocal recording.",
  };

  it("renders empty state placeholder when critique is null", () => {
    render(<CritiqueView critique={null} />);

    expect(screen.getByText("NO ANALYTICAL DATA FOUND")).toBeInTheDocument();
  });

  it("renders all critique fields when critique is supplied", () => {
    render(<CritiqueView critique={mockCritique} />);

    expect(screen.getByTestId("critique-hiss")).toHaveTextContent(
      "Clean signal with low tape hiss.",
    );
    expect(screen.getByTestId("critique-hum")).toHaveTextContent(
      "Noticeable 60Hz hum around power cables.",
    );
    expect(screen.getByTestId("critique-clipping")).toHaveTextContent(
      "Minor transient clipping during chorus.",
    );
    expect(screen.getByTestId("critique-dynamics")).toHaveTextContent(
      "Well-balanced dynamic range.",
    );
    expect(screen.getByTestId("critique-summary")).toHaveTextContent(
      "Solid home-studio vocal recording.",
    );
  });
});
