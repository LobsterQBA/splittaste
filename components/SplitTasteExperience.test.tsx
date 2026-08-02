import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import demoBundle from "@/public/data/demo-bundle.json";
import type { DemoBundle } from "@/types/demo";
import { SplitTasteExperience } from "./SplitTasteExperience";

describe("SplitTasteExperience", () => {
  it("turns two user answers into a repaired recommendation comparison", () => {
    render(<SplitTasteExperience bundle={demoBundle as unknown as DemoBundle} />);

    expect(screen.getByText(/My friend used/i)).toBeInTheDocument();
    expect(screen.queryByText(/Question 2 of 2/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Cerebral Worlds").closest("button")!);
    expect(screen.getByText(/Question 2 of 2/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /probably a guest/i }));
    expect(screen.getByText(/feel like yours again/i)).toBeInTheDocument();
    expect(screen.getByText(/changed the weights/i)).toBeInTheDocument();
  });
});
