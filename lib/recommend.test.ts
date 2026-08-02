import { describe, expect, it } from "vitest";
import { laneRecommendations, progressLabel } from "./recommend";
import type { DemoBundle } from "@/types/demo";

const bundle = {
  lanes: [
    { id: "lane-a", centroid: [1, 0] },
    { id: "lane-b", centroid: [0, 1] },
    { id: "lane-c", centroid: [-1, 0] },
  ],
  correctionCandidates: [
    { movieId: "fix", rating: 5, vector: [0, 1], initialLane: "lane-a" },
  ],
  recommendationCandidates: [
    { movieId: "x", title: "X", vector: [1, 0] },
    { movieId: "y", title: "Y", vector: [0, 1] },
  ],
} as unknown as DemoBundle;

describe("laneRecommendations", () => {
  it("returns one ranked list for every lane", () => {
    const result = laneRecommendations(bundle, {}, 1);
    expect(result["lane-a"][0].movieId).toBe("x");
    expect(result["lane-b"][0].movieId).toBe("y");
  });

  it("summarizes correction progress", () => {
    expect(progressLabel(0)).toContain("3 decisions");
    expect(progressLabel(3)).toBe("The account has been untangled.");
  });
});

