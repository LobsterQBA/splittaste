from __future__ import annotations

import json
import re
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import duckdb
import numpy as np
import pyarrow as pa

from pipeline import SEED
from pipeline.core import (
    align_clusters,
    cluster_events,
    constrained_refit,
    infer_lane_count,
    normalize_rows,
    ranking_metrics,
)

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"
EVALUATOR = ROOT / "data" / "evaluator"
ARTIFACTS = ROOT / "artifacts"
PUBLIC_DATA = ROOT / "public" / "data"
CATALOG_SIZE = 15_000


@dataclass
class ModelData:
    user_ids: np.ndarray
    movie_ids: np.ndarray
    user_rows: np.ndarray
    movie_columns: np.ndarray
    ratings: np.ndarray
    train_mask: np.ndarray
    item_embeddings: np.ndarray
    popularity: np.ndarray


def load_model() -> ModelData:
    values = np.load(EVALUATOR / "model_data.npz")
    return ModelData(
        user_ids=values["user_ids"],
        movie_ids=values["movie_ids"],
        user_rows=values["user_rows"],
        movie_columns=values["movie_columns"],
        ratings=values["ratings"],
        train_mask=values["train_mask"],
        item_embeddings=values["item_embeddings"],
        popularity=values["popularity"],
    )


def event_vectors(data: ModelData, indices: np.ndarray) -> np.ndarray:
    weights = np.clip(data.ratings[indices] - 3.0, -2, 2)
    vectors = data.item_embeddings[data.movie_columns[indices]] * weights[:, None]
    return normalize_rows(vectors)


def rank_catalog(
    profile: np.ndarray,
    data: ModelData,
    catalog: np.ndarray,
    excluded: set[int],
    limit: int = 10,
) -> np.ndarray:
    scores = data.item_embeddings[catalog] @ profile
    scores += 0.025 * np.log1p(data.popularity[catalog])
    if excluded:
        mask = np.isin(catalog, np.fromiter(excluded, dtype=int))
        scores[mask] = -np.inf
    take = min(limit, len(scores))
    positions = np.argpartition(scores, -take)[-take:]
    return catalog[positions[np.argsort(scores[positions])[::-1]]]


def household_recommendation_metrics(
    data: ModelData,
    catalog: np.ndarray,
    member_rows: list[int],
    member_to_lane: dict[int, int],
    lane_profiles: np.ndarray,
    baseline_profile: np.ndarray,
    train_indices: np.ndarray,
) -> dict[str, float]:
    excluded = set(data.movie_columns[train_indices].tolist())
    blended_ranking = rank_catalog(baseline_profile, data, catalog, excluded)
    ndcg_blended: list[float] = []
    recall_blended: list[float] = []
    ndcg_split: list[float] = []
    recall_split: list[float] = []
    ndcg_oracle: list[float] = []

    for member, row in enumerate(member_rows):
        heldout = np.flatnonzero((data.user_rows == row) & ~data.train_mask & (data.ratings >= 4.0))
        relevant = set(data.movie_columns[heldout].tolist()) & set(catalog.tolist())
        if not relevant:
            continue
        member_train = np.flatnonzero((data.user_rows == row) & data.train_mask)
        oracle_profile = normalize_rows(event_vectors(data, member_train).mean(axis=0)[None, :])[0]
        oracle_ranking = rank_catalog(oracle_profile, data, catalog, excluded)
        lane = member_to_lane.get(member, member % len(lane_profiles))
        split_ranking = rank_catalog(lane_profiles[lane], data, catalog, excluded)
        blended = ranking_metrics(blended_ranking, relevant)
        split = ranking_metrics(split_ranking, relevant)
        oracle = ranking_metrics(oracle_ranking, relevant)
        ndcg_blended.append(blended[0])
        recall_blended.append(blended[1])
        ndcg_split.append(split[0])
        recall_split.append(split[1])
        ndcg_oracle.append(oracle[0])

    def mean(values: list[float]) -> float:
        return float(np.mean(values)) if values else 0.0

    return {
        "ndcg_blended": mean(ndcg_blended),
        "recall_blended": mean(recall_blended),
        "ndcg_split": mean(ndcg_split),
        "recall_split": mean(recall_split),
        "ndcg_oracle": mean(ndcg_oracle),
    }


def evaluate_household(
    household: dict,
    data: ModelData,
    user_lookup: dict[int, int],
    catalog: np.ndarray,
    household_index: int,
) -> dict:
    member_rows = [user_lookup[user_id] for user_id in household["source_user_ids"]]
    train_parts: list[np.ndarray] = []
    truths: list[np.ndarray] = []
    for member, row in enumerate(member_rows):
        indices = np.flatnonzero((data.user_rows == row) & data.train_mask)
        train_parts.append(indices)
        truths.append(np.full(len(indices), member, dtype=np.int16))
    train_indices = np.concatenate(train_parts)
    truth = np.concatenate(truths)
    vectors = event_vectors(data, train_indices)
    k = household["size"]
    inferred_k = infer_lane_count(vectors, SEED + household_index)
    clustered = cluster_events(vectors, truth, k, SEED + household_index)
    baseline_profile = normalize_rows(vectors.mean(axis=0)[None, :])[0]
    member_to_lane = {member: lane for lane, member in clustered.mapping.items()}
    recommendation = household_recommendation_metrics(
        data,
        catalog,
        member_rows,
        member_to_lane,
        clustered.centroids,
        baseline_profile,
        train_indices,
    )

    confidence = clustered.probabilities.max(axis=1)
    aligned = np.array([clustered.mapping.get(int(label), -1) for label in clustered.labels])
    confident_mask = confidence >= 0.60
    abstention_precision = (
        float(np.mean(aligned[confident_mask] == truth[confident_mask]))
        if confident_mask.any()
        else 0.0
    )
    entropy = -np.sum(clustered.probabilities * np.log(clustered.probabilities + 1e-9), axis=1)
    impact = entropy * (1 + np.abs(data.ratings[train_indices] - 3.0))
    impact[data.ratings[train_indices] < 4.0] = -np.inf
    active_order = np.argsort(impact)[::-1]

    curve = []
    for confirmation_count in (0, 3, 5, 10):
        locked: dict[int, int] = {}
        for event_position in active_order[:confirmation_count]:
            locked[int(event_position)] = member_to_lane[int(truth[event_position])]
        labels, centroids = constrained_refit(vectors, clustered.labels, locked, k)
        mapping, assignment_accuracy = align_clusters(labels, truth, k)
        curve_member_to_lane = {member: lane for lane, member in mapping.items()}
        curve_metrics = household_recommendation_metrics(
            data,
            catalog,
            member_rows,
            curve_member_to_lane,
            centroids,
            baseline_profile,
            train_indices,
        )
        curve.append(
            {
                "confirmations": confirmation_count,
                "ndcgAt10": curve_metrics["ndcg_split"],
                "recallAt10": curve_metrics["recall_split"],
                "assignmentAccuracy": assignment_accuracy,
            }
        )

    return {
        "household_id": household["household_id"],
        "size": k,
        "inferred_lane_count": inferred_k,
        "lane_count_match": inferred_k == k,
        "overlap_stratum": household["overlap_stratum"],
        "activity": int(len(train_indices)),
        "catalog_density": float(
            len(set(data.movie_columns[train_indices].tolist())) / len(catalog)
        ),
        "ari": clustered.ari,
        "nmi": clustered.nmi,
        "heldout_assignment_accuracy": clustered.accuracy,
        "abstention_precision": abstention_precision,
        "abstention_coverage": float(np.mean(confident_mask)),
        **recommendation,
        "negative_transfer": recommendation["ndcg_oracle"] - recommendation["ndcg_blended"],
        "correction_curve": curve,
        "_demo": {
            "train_indices": train_indices,
            "truth": truth,
            "labels": clustered.labels,
            "centroids": clustered.centroids,
            "probabilities": clustered.probabilities,
            "active_order": active_order,
            "baseline_profile": baseline_profile,
            "member_to_lane": member_to_lane,
        },
    }


def bootstrap_ci(values: np.ndarray, seed: int = SEED) -> tuple[float, float]:
    if len(values) == 0:
        return 0.0, 0.0
    rng = np.random.default_rng(seed)
    samples = rng.choice(values, size=(2_000, len(values)), replace=True).mean(axis=1)
    return tuple(float(value) for value in np.quantile(samples, [0.025, 0.975]))


def aggregate(results: list[dict]) -> dict:
    public_keys = [
        "ari",
        "nmi",
        "heldout_assignment_accuracy",
        "abstention_precision",
        "abstention_coverage",
        "ndcg_blended",
        "recall_blended",
        "ndcg_split",
        "recall_split",
        "ndcg_oracle",
        "negative_transfer",
    ]
    summary = {key: float(np.mean([result[key] for result in results])) for key in public_keys}
    deltas = np.array(
        [result["correction_curve"][1]["ndcgAt10"] - result["ndcg_blended"] for result in results]
    )
    summary["ndcg_delta_ci95"] = list(bootstrap_ci(deltas))
    summary["claim_supported"] = summary["ndcg_delta_ci95"][0] > 0
    summary["household_count"] = len(results)
    summary["lane_count_accuracy"] = float(
        np.mean([result["lane_count_match"] for result in results])
    )
    summary["correction_curve"] = []
    for index, confirmation_count in enumerate((0, 3, 5, 10)):
        summary["correction_curve"].append(
            {
                "confirmations": confirmation_count,
                "ndcgAt10": float(
                    np.mean([result["correction_curve"][index]["ndcgAt10"] for result in results])
                ),
                "recallAt10": float(
                    np.mean([result["correction_curve"][index]["recallAt10"] for result in results])
                ),
                "assignmentAccuracy": float(
                    np.mean(
                        [
                            result["correction_curve"][index]["assignmentAccuracy"]
                            for result in results
                        ]
                    )
                ),
            }
        )
    activity_boundaries = np.quantile([result["activity"] for result in results], [0.33, 0.67])
    density_boundaries = np.quantile(
        [result["catalog_density"] for result in results], [0.33, 0.67]
    )

    def bucket(value: float, boundaries: np.ndarray, names: tuple[str, str, str]) -> str:
        if value <= boundaries[0]:
            return names[0]
        if value <= boundaries[1]:
            return names[1]
        return names[2]

    for result in results:
        result["activity_cohort"] = bucket(
            result["activity"], activity_boundaries, ("lower", "middle", "higher")
        )
        result["sparsity_cohort"] = bucket(
            result["catalog_density"], density_boundaries, ("sparse", "medium", "dense")
        )

    def grouped(field: str) -> dict:
        cohorts: dict[str, list[dict]] = defaultdict(list)
        for result in results:
            cohorts[str(result[field])].append(result)
        return {
            name: {
                "households": len(values),
                "ndcg_blended": float(np.mean([value["ndcg_blended"] for value in values])),
                "ndcg_split": float(
                    np.mean([value["correction_curve"][1]["ndcgAt10"] for value in values])
                ),
                "ari": float(np.mean([value["ari"] for value in values])),
            }
            for name, values in cohorts.items()
        }

    summary["cohorts"] = {
        "overlap": grouped("overlap_stratum"),
        "household_size": grouped("size"),
        "activity": grouped("activity_cohort"),
        "sparsity": grouped("sparsity_cohort"),
    }
    return summary


def choose_demo(results: list[dict]) -> tuple[dict, str]:
    preferred = [
        result
        for result in results
        if result["size"] == 3 and result["overlap_stratum"] == "partially overlapping"
    ]
    selection_rule = "Closest to median NDCG delta in the size-3, partially-overlapping cohort."
    if not preferred:
        preferred = [result for result in results if result["size"] == 3]
        selection_rule = "Closest to median NDCG delta among size-3 evaluation households."
    deltas = np.array(
        [value["correction_curve"][1]["ndcgAt10"] - value["ndcg_blended"] for value in preferred]
    )
    median = np.median(deltas)
    selected = preferred[int(np.argmin(np.abs(deltas - median)))]
    return selected, selection_rule


def movie_metadata(movie_ids: np.ndarray) -> dict[int, dict]:
    connection = duckdb.connect()
    connection.register("model_movies", pa.table({"movieId": movie_ids}))
    rows = connection.execute(
        f"""
        SELECT movieId, title, genres
        FROM read_parquet('{PROCESSED / "movies.parquet"}')
        JOIN model_movies USING (movieId)
        """
    ).fetchall()
    available_movie_ids = set(movie_ids.tolist())
    metadata = {
        int(movie_id): {
            "title": re.sub(r"\s*\((\d{4})\)$", "", title),
            "year": (match.group(1) if (match := re.search(r"\((\d{4})\)$", title)) else ""),
            "genres": [] if genres == "(no genres listed)" else genres.split("|"),
            "tags": [],
        }
        for movie_id, title, genres in rows
        if movie_id in available_movie_ids
    }
    tags = connection.execute(
        f"""
        SELECT movieId, tag
        FROM (
          SELECT t.movieId, lower(trim(t.tag)) AS tag, COUNT(*) AS uses,
                 ROW_NUMBER() OVER (
                   PARTITION BY t.movieId ORDER BY COUNT(*) DESC, lower(trim(t.tag))
                 ) AS rank
          FROM read_parquet('{PROCESSED / "tags.parquet"}') t
          JOIN model_movies m USING (movieId)
          WHERE t.tag IS NOT NULL AND length(trim(t.tag)) BETWEEN 2 AND 40
          GROUP BY t.movieId, lower(trim(t.tag))
        )
        WHERE rank <= 2
        ORDER BY movieId, rank
        """
    ).fetchall()
    connection.close()
    for movie_id, tag in tags:
        metadata[int(movie_id)]["tags"].append(tag)
    return metadata


def lane_copy(genre_counts: dict[str, int], index: int, used: set[str]) -> tuple[str, str, str]:
    top_genres = set(sorted(genre_counts, key=genre_counts.get, reverse=True)[:3])
    candidates: list[tuple[str, str, str]] = []
    if {"Animation", "Children", "Children's"} & top_genres:
        candidates.append(
            (
                "Weekend Animation",
                "Color + momentum",
                "Imaginative worlds with energy for a shared screen.",
            )
        )
    if {"Crime", "Thriller", "Mystery"} & top_genres:
        candidates.append(
            (
                "Dark Tension",
                "Pressure + consequence",
                "Meticulous suspense and people making dangerous choices.",
            )
        )
    if {"Sci-Fi", "Fantasy"} & top_genres:
        candidates.append(
            (
                "Cerebral Worlds",
                "Ideas + wonder",
                "Speculative worlds and ideas worth debating afterward.",
            )
        )
    if {"Drama", "Romance"} & top_genres:
        candidates.append(
            (
                "Human Drama",
                "Character + consequence",
                "Character-led stories that linger after the credits.",
            )
        )
    if "Comedy" in top_genres:
        candidates.append(
            (
                "Comfort Comedy",
                "Light + familiar",
                "Warm ensembles, quick dialogue, and an easy landing.",
            )
        )
    fallbacks = (
        ("Offbeat Finds", "Surprise + texture", "Unexpected stories with a point of view."),
        (
            "Big-Screen Energy",
            "Scale + momentum",
            "Kinetic stories built around movement and spectacle.",
        ),
        ("Quiet Discoveries", "Mood + detail", "Patient stories where small choices carry weight."),
    )
    candidates.extend(fallbacks)
    return next(candidate for candidate in candidates if candidate[0] not in used)


def make_movie(data: ModelData, column: int, metadata: dict[int, dict]) -> dict:
    movie_id = int(data.movie_ids[column])
    details = metadata[movie_id]
    return {
        "movieId": str(movie_id),
        **details,
        "vector": np.round(data.item_embeddings[column], 6).tolist(),
    }


def build_demo_bundle(
    selected: dict,
    summary: dict,
    selection_rule: str,
    data: ModelData,
    catalog: np.ndarray,
) -> dict:
    private = selected["_demo"]
    train_indices = private["train_indices"]
    metadata = movie_metadata(data.movie_ids)
    colors = ("#d8ff64", "#83b8ff", "#ff8a72", "#d2a7ff")
    lanes = []
    used_lane_names: set[str] = set()
    recommendation_columns: list[int] = []
    for lane_index, centroid in enumerate(private["centroids"]):
        lane_event_positions = np.flatnonzero(private["labels"] == lane_index)
        lane_events = train_indices[lane_event_positions]
        preference = (
            data.ratings[lane_events]
            + data.item_embeddings[data.movie_columns[lane_events]] @ centroid
        )
        anchor_events = lane_events[np.argsort(preference)[::-1]]
        anchor_columns = list(dict.fromkeys(data.movie_columns[anchor_events].tolist()))[:5]
        genre_counts: dict[str, int] = defaultdict(int)
        for column in anchor_columns:
            for genre in metadata[int(data.movie_ids[column])]["genres"]:
                genre_counts[genre] += 1
        name, eyebrow, description = lane_copy(genre_counts, lane_index, used_lane_names)
        used_lane_names.add(name)
        lanes.append(
            {
                "id": f"lane-{chr(97 + lane_index)}",
                "name": name,
                "eyebrow": f"Lane {chr(65 + lane_index)} · {eyebrow}",
                "description": description,
                "accent": colors[lane_index],
                "centroid": np.round(centroid, 6).tolist(),
                "anchorTitles": [
                    metadata[int(data.movie_ids[column])]["title"] for column in anchor_columns[:3]
                ],
            }
        )
        excluded = set(data.movie_columns[train_indices].tolist())
        recommendations = rank_catalog(centroid, data, catalog, excluded, limit=8)
        recommendation_columns.extend(recommendations.tolist())

    corrections = []
    used_movies: set[int] = set()
    for event_position in private["active_order"]:
        event_index = int(train_indices[event_position])
        column = int(data.movie_columns[event_index])
        if column in used_movies:
            continue
        movie = make_movie(data, column, metadata)
        movie.update(
            {
                "rating": float(data.ratings[event_index]),
                "initialLane": f"lane-{chr(97 + int(private['labels'][event_position]))}",
                "assignmentConfidence": round(
                    float(private["probabilities"][event_position].max()), 6
                ),
                "impactScore": len(corrections) + 1,
            }
        )
        corrections.append(movie)
        used_movies.add(column)
        if len(corrections) == 3:
            break

    excluded = set(data.movie_columns[train_indices].tolist())
    blended_columns = rank_catalog(private["baseline_profile"], data, catalog, excluded, limit=4)
    recommendation_columns = list(dict.fromkeys(recommendation_columns))
    curve_at_three = summary["correction_curve"][1]
    dimension_labels = {
        "overlap": "overlap",
        "household_size": "household size",
        "activity": "activity",
        "sparsity": "sparsity",
    }
    cohort_results = []
    for dimension, cohorts in summary["cohorts"].items():
        for cohort, values in cohorts.items():
            cohort_results.append(
                {
                    "dimension": dimension_labels[dimension],
                    "cohort": str(cohort),
                    "households": values["households"],
                    "ndcgBlended": values["ndcg_blended"],
                    "ndcgSplitTaste": values["ndcg_split"],
                    "ari": values["ari"],
                }
            )

    return {
        "schemaVersion": "1.1",
        "datasetSnapshotDate": "2023-10-13",
        "dataset": {
            "name": "MovieLens 32M",
            "sourceUrl": "https://files.grouplens.org/datasets/movielens/",
            "licenseSummary": (
                "Research use; attribution required; no commercial use without permission."
            ),
            "ratingEventCount": 32_000_204,
            "userCount": 200_948,
            "syntheticHouseholds": True,
        },
        "account": {
            "id": selected["household_id"],
            "label": "Representative shared household",
            "historyCount": selected["activity"],
            "modeledLaneCount": selected["size"],
            "overlapCohort": f"{selected['overlap_stratum'].capitalize()} tastes",
            "selectionRule": selection_rule,
        },
        "lanes": lanes,
        "correctionCandidates": corrections,
        "recommendationCandidates": [
            make_movie(data, column, metadata) for column in recommendation_columns
        ],
        "blendedRecommendations": [
            make_movie(data, int(column), metadata) for column in blended_columns
        ],
        "evaluation": {
            "validationLevel": (
                "Offline evaluation on deterministic synthetic households built from "
                "anonymized rating events."
            ),
            "householdCount": summary["household_count"],
            "ari": summary["ari"],
            "nmi": summary["nmi"],
            "ndcgBlended": summary["ndcg_blended"],
            "ndcgSplitTaste": curve_at_three["ndcgAt10"],
            "ndcgOracle": summary["ndcg_oracle"],
            "recallBlended": summary["recall_blended"],
            "recallSplitTaste": curve_at_three["recallAt10"],
            "negativeTransfer": summary["negative_transfer"],
            "laneCountAccuracy": summary["lane_count_accuracy"],
            "abstentionPrecision": summary["abstention_precision"],
            "abstentionCoverage": summary["abstention_coverage"],
            "deltaCi95": summary["ndcg_delta_ci95"],
            "claimSupported": summary["claim_supported"],
            "correctionCurve": summary["correction_curve"],
        },
        "research": {
            "source": {
                "ratingEvents": 32_000_204,
                "tagApplications": 2_000_072,
                "movies": 87_585,
                "anonymizedUsers": 200_948,
            },
            "modelingCohort": {
                "ratingEvents": int(len(data.ratings)),
                "users": int(len(data.user_ids)),
                "movies": int(len(data.movie_ids)),
                "embeddingDimensions": int(data.item_embeddings.shape[1]),
                "candidateCatalog": int(len(catalog)),
            },
            "householdDesign": {
                "households": summary["household_count"],
                "sizes": [2, 3, 4],
                "overlapStrata": [
                    "clearly different",
                    "partially overlapping",
                    "highly similar",
                ],
                "fixedSeed": SEED,
            },
            "cohortResults": cohort_results,
        },
        "disclosures": [
            "Synthetic household constructed from anonymized MovieLens rating events.",
            "Taste lanes describe preference patterns, not people or demographics.",
            "Offline recommendation metrics are not real viewing or engagement lift.",
            "Independent research demo. No Amazon data, architecture, or endorsement.",
        ],
    }


def serializable_result(result: dict) -> dict:
    return {key: value for key, value in result.items() if not key.startswith("_")}


def main() -> None:
    ARTIFACTS.mkdir(exist_ok=True)
    PUBLIC_DATA.mkdir(parents=True, exist_ok=True)
    data = load_model()
    households = json.loads((EVALUATOR / "households.json").read_text())
    user_lookup = {int(user_id): row for row, user_id in enumerate(data.user_ids)}
    catalog = np.argpartition(data.popularity, -min(CATALOG_SIZE, len(data.popularity)))[
        -min(CATALOG_SIZE, len(data.popularity)) :
    ]
    results = []
    for index, household in enumerate(households):
        result = evaluate_household(household, data, user_lookup, catalog, index)
        results.append(result)
        print(f"Evaluated {index + 1:02d}/{len(households)}: {household['household_id']}")

    summary = aggregate(results)
    selected, selection_rule = choose_demo(results)
    evaluation_artifact = {
        "dataset_snapshot_date": "2023-10-13",
        "seed": SEED,
        "rating_event_definition": (
            "One MovieLens rating record; not a confirmed watch or watch session."
        ),
        "candidate_catalog": f"Top {len(catalog):,} sampled-cohort movies by rating count.",
        "household_method": (
            "Deterministic synthetic grouping of 2-4 anonymized users by preference-overlap strata."
        ),
        "summary": summary,
        "households": [serializable_result(result) for result in results],
        "demo_selection_rule": selection_rule,
        "demo_household_id": selected["household_id"],
    }
    (ARTIFACTS / "evaluation.json").write_text(json.dumps(evaluation_artifact, indent=2))
    bundle = build_demo_bundle(selected, summary, selection_rule, data, catalog)
    (PUBLIC_DATA / "demo-bundle.json").write_text(json.dumps(bundle, indent=2))
    print(f"Evaluation written to {ARTIFACTS / 'evaluation.json'}")
    print(f"Public demo bundle written to {PUBLIC_DATA / 'demo-bundle.json'}")


if __name__ == "__main__":
    main()
