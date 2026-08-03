export type LaneId = "lane-a" | "lane-b" | "lane-c";

export interface MovieVector {
  movieId: string;
  title: string;
  year: string;
  genres: string[];
  tags: string[];
  vector: number[];
  score?: number;
}

export interface TasteLane {
  id: LaneId;
  name: string;
  eyebrow: string;
  description: string;
  accent: string;
  centroid: number[];
  anchorTitles: string[];
}

export interface CorrectionCandidate extends MovieVector {
  rating: number;
  initialLane: LaneId;
  assignmentConfidence: number;
  impactScore: number;
}

export interface MetricPoint {
  confirmations: number;
  ndcgAt10: number;
  recallAt10: number;
  assignmentAccuracy: number;
}

export interface CohortResult {
  dimension: "overlap" | "household size" | "activity" | "sparsity";
  cohort: string;
  households: number;
  ndcgBlended: number;
  ndcgSplitTaste: number;
  ari: number;
}

export interface DemoBundle {
  schemaVersion: "1.1";
  datasetSnapshotDate: string;
  dataset: {
    name: string;
    sourceUrl: string;
    licenseSummary: string;
    ratingEventCount: number;
    userCount: number;
    syntheticHouseholds: boolean;
  };
  account: {
    id: string;
    label: string;
    historyCount: number;
    modeledLaneCount: number;
    overlapCohort: string;
    selectionRule?: string;
  };
  lanes: TasteLane[];
  correctionCandidates: CorrectionCandidate[];
  recommendationCandidates: MovieVector[];
  blendedRecommendations: MovieVector[];
  evaluation: {
    validationLevel: string;
    householdCount: number;
    ari: number;
    nmi: number;
    ndcgBlended: number;
    ndcgSplitTaste: number;
    ndcgOracle: number;
    recallBlended: number;
    recallSplitTaste: number;
    negativeTransfer: number;
    laneCountAccuracy: number;
    abstentionPrecision: number;
    abstentionCoverage: number;
    deltaCi95: [number, number];
    claimSupported: boolean;
    correctionCurve: MetricPoint[];
  };
  research: {
    source: {
      ratingEvents: number;
      tagApplications: number;
      movies: number;
      anonymizedUsers: number;
    };
    modelingCohort: {
      ratingEvents: number;
      users: number;
      movies: number;
      embeddingDimensions: number;
      candidateCatalog: number;
    };
    householdDesign: {
      households: number;
      sizes: number[];
      overlapStrata: string[];
      fixedSeed: number;
    };
    cohortResults: CohortResult[];
  };
  disclosures: string[];
}
