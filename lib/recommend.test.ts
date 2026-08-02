import { describe, expect, it } from "vitest";
import { bestOtherLane, laneRecommendations } from "./recommend";
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

  it("places a guest title into the closest non-owner lane", () => {
    expect(bestOtherLane(bundle, "lane-a", bundle.correctionCandidates[0])).toBe("lane-b");
  });
});
