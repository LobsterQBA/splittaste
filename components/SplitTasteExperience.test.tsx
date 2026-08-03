import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import demoBundle from "@/public/data/demo-bundle.json";
import type { DemoBundle } from "@/types/demo";
import { SplitTasteExperience } from "./SplitTasteExperience";

describe("SplitTasteExperience", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("introduces the mixed-profile signal before revealing the experience", () => {
    vi.useFakeTimers();
    render(<SplitTasteExperience bundle={demoBundle as unknown as DemoBundle} />);

    expect(screen.getByText(/Reading this profile/i)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1850));
    expect(screen.getByText(/Something shifted/i)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(2150));
    expect(screen.getByText(/Possible shared viewing/i)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(3300));
    expect(screen.queryByLabelText(/Checking recommendation signals/i)).not.toBeInTheDocument();
  });

  it("turns two user answers into a repaired recommendation comparison", () => {
    vi.useFakeTimers();
    render(<SplitTasteExperience bundle={demoBundle as unknown as DemoBundle} />);

    fireEvent.click(screen.getByRole("button", { name: /skip intro/i }));
    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByText(/A friend pressed play/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /repair my recommendations/i }));
    expect(screen.getByText(/Which row feels most like you/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Big Ideas & Strange Worlds").closest("button")!);
    act(() => vi.advanceTimersByTime(250));
    expect(screen.getByText(/Was this your pick/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /probably a guest/i }));
    expect(screen.getByText(/Rebalancing your home row/i)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(850));
    expect(screen.getByText(/Your taste is leading again/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Before" })).toBeInTheDocument();
  });
});
