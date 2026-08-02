from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from scipy.optimize import linear_sum_assignment
from sklearn.cluster import KMeans
from sklearn.metrics import adjusted_rand_score, normalized_mutual_info_score, silhouette_score


def normalize_rows(values: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(values, axis=1, keepdims=True)
    norms[norms == 0] = 1
    return values / norms


def soft_assignments(vectors: np.ndarray, centroids: np.ndarray) -> np.ndarray:
    distances = np.linalg.norm(vectors[:, None, :] - centroids[None, :, :], axis=2)
    logits = -distances * 4
    logits -= logits.max(axis=1, keepdims=True)
    probabilities = np.exp(logits)
    return probabilities / probabilities.sum(axis=1, keepdims=True)


def infer_lane_count(vectors: np.ndarray, seed: int, minimum_share: float = 0.1) -> int:
    if len(vectors) < 20:
        return 2
    best_k, best_score = 2, -math.inf
    for k in range(2, 5):
        model = KMeans(n_clusters=k, random_state=seed, n_init=10).fit(vectors)
        counts = np.bincount(model.labels_, minlength=k)
        if counts.min() / len(vectors) < minimum_share:
            continue
        sample_size = min(1_500, len(vectors))
        score = silhouette_score(vectors, model.labels_, sample_size=sample_size, random_state=seed)
        score -= 0.018 * (k - 2)
        if score > best_score:
            best_k, best_score = k, score
    return best_k


def align_clusters(labels: np.ndarray, truth: np.ndarray, k: int) -> tuple[dict[int, int], float]:
    matrix = np.zeros((k, k), dtype=int)
    for predicted, actual in zip(labels, truth, strict=True):
        if predicted < k and actual < k:
            matrix[predicted, actual] += 1
    rows, columns = linear_sum_assignment(-matrix)
    cluster_to_member = dict(zip(rows.tolist(), columns.tolist(), strict=True))
    aligned = np.array([cluster_to_member.get(int(label), -1) for label in labels])
    return cluster_to_member, float(np.mean(aligned == truth))


def constrained_refit(
    vectors: np.ndarray,
    initial_labels: np.ndarray,
    locked: dict[int, int],
    k: int,
    iterations: int = 8,
) -> tuple[np.ndarray, np.ndarray]:
    labels = initial_labels.copy()
    for event_index, lane in locked.items():
        labels[event_index] = lane
    centroids = np.zeros((k, vectors.shape[1]))
    for _ in range(iterations):
        for lane in range(k):
            members = vectors[labels == lane]
            if len(members):
                centroids[lane] = members.mean(axis=0)
        probabilities = soft_assignments(vectors, centroids)
        labels = probabilities.argmax(axis=1)
        for event_index, lane in locked.items():
            labels[event_index] = lane
    return labels, normalize_rows(centroids)


def ranking_metrics(
    ranked_items: np.ndarray, relevant_items: set[int], k: int = 10
) -> tuple[float, float]:
    if not relevant_items:
        return 0.0, 0.0
    hits = np.array([1.0 if int(item) in relevant_items else 0.0 for item in ranked_items[:k]])
    discounts = 1 / np.log2(np.arange(2, len(hits) + 2))
    dcg = float(np.sum(hits * discounts))
    ideal_count = min(len(relevant_items), k)
    ideal = float(np.sum(discounts[:ideal_count]))
    ndcg = dcg / ideal if ideal else 0.0
    recall = float(hits.sum() / len(relevant_items))
    return ndcg, recall


def top_ranked(
    profile: np.ndarray,
    item_embeddings: np.ndarray,
    popularity: np.ndarray,
    excluded: set[int],
    limit: int = 10,
) -> np.ndarray:
    scores = item_embeddings @ profile + 0.025 * np.log1p(popularity)
    if excluded:
        scores[np.fromiter(excluded, dtype=int)] = -np.inf
    candidate_count = min(limit, len(scores))
    partition = np.argpartition(scores, -candidate_count)[-candidate_count:]
    return partition[np.argsort(scores[partition])[::-1]]


@dataclass(frozen=True)
class ClusterResult:
    labels: np.ndarray
    centroids: np.ndarray
    probabilities: np.ndarray
    ari: float
    nmi: float
    mapping: dict[int, int]
    accuracy: float


def cluster_events(vectors: np.ndarray, truth: np.ndarray, k: int, seed: int) -> ClusterResult:
    model = KMeans(n_clusters=k, random_state=seed, n_init=15).fit(vectors)
    centroids = normalize_rows(model.cluster_centers_)
    probabilities = soft_assignments(vectors, centroids)
    mapping, accuracy = align_clusters(model.labels_, truth, k)
    return ClusterResult(
        labels=model.labels_,
        centroids=centroids,
        probabilities=probabilities,
        ari=float(adjusted_rand_score(truth, model.labels_)),
        nmi=float(normalized_mutual_info_score(truth, model.labels_)),
        mapping=mapping,
        accuracy=accuracy,
    )
