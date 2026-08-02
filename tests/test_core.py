import numpy as np

from pipeline.core import align_clusters, constrained_refit, ranking_metrics, soft_assignments


def test_cluster_alignment_handles_permuted_labels() -> None:
    truth = np.array([0, 0, 1, 1])
    labels = np.array([1, 1, 0, 0])
    mapping, accuracy = align_clusters(labels, truth, 2)
    assert mapping == {0: 1, 1: 0}
    assert accuracy == 1.0


def test_ranking_metrics_are_hand_calculable() -> None:
    ndcg, recall = ranking_metrics(np.array([4, 2, 9]), {2, 9}, k=3)
    assert round(recall, 4) == 1.0
    assert round(ndcg, 4) == round((1 / np.log2(3) + 1 / np.log2(4)) / (1 + 1 / np.log2(3)), 4)


def test_constrained_refit_keeps_locked_event() -> None:
    vectors = np.array([[1.0, 0.0], [0.9, 0.1], [0.0, 1.0], [0.1, 0.9]])
    labels = np.array([0, 0, 1, 1])
    updated, _ = constrained_refit(vectors, labels, {0: 1}, 2, iterations=3)
    assert updated[0] == 1


def test_soft_assignments_sum_to_one() -> None:
    values = soft_assignments(np.array([[1.0, 0.0]]), np.array([[1.0, 0.0], [0.0, 1.0]]))
    assert np.isclose(values.sum(), 1.0)
