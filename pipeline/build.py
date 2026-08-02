from __future__ import annotations

import json
from pathlib import Path

import duckdb
import numpy as np
import pyarrow as pa
from scipy import sparse
from sklearn.decomposition import TruncatedSVD

from pipeline import SEED
from pipeline.core import normalize_rows

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "ml-32m"
PROCESSED = ROOT / "data" / "processed"
EVALUATOR = ROOT / "data" / "evaluator"
SAMPLE_USERS = 12_000


def ingest() -> None:
    PROCESSED.mkdir(parents=True, exist_ok=True)
    connection = duckdb.connect()
    sources = {
        "ratings": "ratings.csv",
        "movies": "movies.csv",
        "tags": "tags.csv",
        "links": "links.csv",
    }
    for name, filename in sources.items():
        output = PROCESSED / f"{name}.parquet"
        if output.exists():
            continue
        query = (
            f"COPY (SELECT * FROM read_csv_auto('{RAW / filename}', header=true)) "
            f"TO '{output}' (FORMAT PARQUET, COMPRESSION ZSTD)"
        )
        connection.execute(query)
        print(f"Wrote {output.name}")
    connection.close()


def build_model() -> None:
    EVALUATOR.mkdir(parents=True, exist_ok=True)
    connection = duckdb.connect()
    ratings_path = PROCESSED / "ratings.parquet"
    selected = connection.execute(
        f"""
        WITH eligible AS (
          SELECT userId, COUNT(*) AS rating_count
          FROM read_parquet('{ratings_path}')
          GROUP BY userId
          HAVING COUNT(*) BETWEEN 80 AND 1200
        )
        SELECT userId
        FROM eligible
        ORDER BY hash(userId, {SEED})
        LIMIT {SAMPLE_USERS}
        """
    ).fetchnumpy()["userId"]
    connection.register("selected_users", pa.table({"userId": selected}))
    events = connection.execute(
        f"""
        SELECT r.userId, r.movieId, r.rating, r.timestamp
        FROM read_parquet('{ratings_path}') r
        JOIN selected_users s USING (userId)
        ORDER BY r.userId, r.timestamp, r.movieId
        """
    ).fetchnumpy()
    connection.close()

    user_ids, user_rows = np.unique(events["userId"], return_inverse=True)
    movie_ids, movie_columns = np.unique(events["movieId"], return_inverse=True)
    ratings = events["rating"].astype(np.float32)
    timestamps = events["timestamp"].astype(np.int64)

    matrix = sparse.csr_matrix(
        (ratings - 3.0, (user_rows, movie_columns)),
        shape=(len(user_ids), len(movie_ids)),
        dtype=np.float32,
    )
    svd = TruncatedSVD(n_components=32, n_iter=7, random_state=SEED)
    user_embeddings = normalize_rows(svd.fit_transform(matrix))
    item_embeddings = normalize_rows(svd.components_.T.astype(np.float32))
    popularity = np.bincount(movie_columns, minlength=len(movie_ids)).astype(np.float32)

    train_mask = np.zeros(len(ratings), dtype=bool)
    for row in range(len(user_ids)):
        indices = np.flatnonzero(user_rows == row)
        cutoff = max(1, int(len(indices) * 0.8))
        train_mask[indices[:cutoff]] = True

    np.savez_compressed(
        EVALUATOR / "model_data.npz",
        user_ids=user_ids,
        movie_ids=movie_ids,
        user_rows=user_rows.astype(np.int32),
        movie_columns=movie_columns.astype(np.int32),
        ratings=ratings,
        timestamps=timestamps,
        train_mask=train_mask,
        user_embeddings=user_embeddings.astype(np.float32),
        item_embeddings=item_embeddings,
        popularity=popularity,
    )
    households = make_households(user_ids, user_embeddings)
    (EVALUATOR / "households.json").write_text(json.dumps(households, indent=2))
    print(
        f"Model cohort: {len(user_ids):,} users, {len(movie_ids):,} movies, "
        f"{len(ratings):,} rating events"
    )
    print(f"Synthetic evaluation accounts: {len(households)}")


def make_households(user_ids: np.ndarray, profiles: np.ndarray, count: int = 72) -> list[dict]:
    rng = np.random.default_rng(SEED)
    pool = rng.choice(len(user_ids), size=min(2_000, len(user_ids)), replace=False)
    sample_left = rng.choice(pool, size=80_000)
    sample_right = rng.choice(pool, size=80_000)
    similarities = np.sum(profiles[sample_left] * profiles[sample_right], axis=1)
    low, high = np.quantile(similarities, [0.33, 0.67])
    targets = {
        "clearly different": float(np.quantile(similarities, 0.16)),
        "partially overlapping": float(np.median(similarities)),
        "highly similar": float(np.quantile(similarities, 0.84)),
    }
    available = list(rng.permutation(pool))
    households: list[dict] = []
    for household_index in range(count):
        size = (2, 3, 4)[household_index % 3]
        stratum = tuple(targets)[(household_index // 3) % 3]
        if len(available) < size:
            break
        anchor = available.pop()
        candidate_array = np.asarray(available)
        similarity = profiles[candidate_array] @ profiles[anchor]
        nearest_positions = np.argsort(np.abs(similarity - targets[stratum]))[: size - 1]
        members = [anchor, *candidate_array[nearest_positions].tolist()]
        member_set = set(members[1:])
        available = [value for value in available if value not in member_set]
        pair_scores = []
        for left in range(size):
            for right in range(left + 1, size):
                pair_scores.append(float(profiles[members[left]] @ profiles[members[right]]))
        households.append(
            {
                "household_id": f"synthetic-{household_index + 1:03d}",
                "source_user_ids": [int(user_ids[index]) for index in members],
                "size": size,
                "overlap_stratum": stratum,
                "mean_profile_similarity": float(np.mean(pair_scores)),
                "similarity_quantile_boundaries": [float(low), float(high)],
            }
        )
    return households


def main() -> None:
    if not (RAW / "ratings.csv").exists():
        raise SystemExit("MovieLens 32M is missing. Run `python -m pipeline.download` first.")
    ingest()
    build_model()


if __name__ == "__main__":
    main()
