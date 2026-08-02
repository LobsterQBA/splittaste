import type {
  CorrectionCandidate,
  DemoBundle,
  LaneId,
  MovieVector,
  TasteLane,
} from "@/types/demo";

export type Assignments = Record<string, LaneId>;

const dot = (a: number[], b: number[]) => a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);

const norm = (vector: number[]) => Math.sqrt(dot(vector, vector)) || 1;

const normalize = (vector: number[]) => {
  const length = norm(vector);
  return vector.map((value) => value / length);
};

const weightedCentroid = (
  lane: TasteLane,
  candidates: CorrectionCandidate[],
  assignments: Assignments,
) => {
  const baseWeight = 4;
  const total = lane.centroid.map((value) => value * baseWeight);
  let weight = baseWeight;

  candidates.forEach((candidate) => {
    if (assignments[candidate.movieId] !== lane.id) return;
    const ratingWeight = Math.max(0.75, candidate.rating - 2.5);
    candidate.vector.forEach((value, index) => {
      total[index] = (total[index] ?? 0) + value * ratingWeight;
    });
    weight += ratingWeight;
  });

  return normalize(total.map((value) => value / weight));
};

export function laneRecommendations(
  bundle: DemoBundle,
  assignments: Assignments,
  limit = 4,
) {
  const confirmedIds = new Set(Object.keys(assignments));

  return bundle.lanes.reduce<Record<LaneId, MovieVector[]>>(
    (result, lane) => {
      const centroid = weightedCentroid(lane, bundle.correctionCandidates, assignments);
      result[lane.id] = bundle.recommendationCandidates
        .filter((movie) => !confirmedIds.has(movie.movieId))
        .map((movie) => ({ ...movie, score: dot(centroid, normalize(movie.vector)) }))
        .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
        .slice(0, limit);
      return result;
    },
    { "lane-a": [], "lane-b": [], "lane-c": [] },
  );
}

export function progressLabel(count: number) {
  if (count >= 3) return "The account has been untangled.";
  const remaining = 3 - count;
  return `${remaining} decision${remaining === 1 ? "" : "s"} left to reshape the recommendations.`;
}

