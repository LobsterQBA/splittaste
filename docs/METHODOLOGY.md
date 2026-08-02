# Methodology and metric contract

## Data grain and observation boundary

- Source grain: one MovieLens rating record identified by anonymized `userId` and `movieId`.
- Timestamp use: chronological train/holdout ordering only.
- Train window: earliest 80% of each selected user's rating events.
- Holdout window: latest 20% of that user's rating events.
- Positive held-out relevance: rating of at least 4.0.
- Recommendation catalog: the 15,000 most-rated movies inside the deterministic embedding cohort.
- Evaluation unit: source user nested inside a deterministic synthetic household.
- Aggregate denominator: synthetic households successfully evaluated by the pipeline.

MovieLens rating timestamps are not called viewing sessions or actual viewing times.

## Synthetic household construction

1. Select up to 12,000 anonymized users with 80–1,200 ratings using a fixed hash order.
2. Learn normalized 32-dimensional user and movie representations from centered ratings.
3. Estimate profile-similarity quantiles using a fixed random sample of user pairs.
4. Construct 72 non-overlapping synthetic households, cycling through sizes 2, 3, and 4 and through clearly different, partially overlapping, and highly similar preference strata.
5. Preserve source IDs only in `data/evaluator/`, which is gitignored.

These groups are experimental fixtures. Their size or overlap distribution is not a population estimate.

## Lane inference and correction

Each training rating event is represented by its movie embedding multiplied by its centered rating signal. K-means produces the initial anonymous taste lanes. ARI and NMI compare those assignments with the evaluator-only synthetic mapping while conditioning on the known synthetic household size. A separate penalized silhouette selector tests whether 2, 3, or 4 lanes can be recovered without that information.

Assignment probabilities are derived from relative distance to lane centroids. Correction candidates are ranked by assignment entropy multiplied by rating-signal magnitude. Simulated correction curves use the evaluator-only mapping to lock 0, 3, 5, or 10 high-information events before constrained centroid refitting.

The public interaction uses a disclosed three-lane model and accepts the visitor's choice. It does not label that choice as right or wrong. Lane-count accuracy is reported separately and the interface does not claim to detect people.

## Recommendation metrics

- **NDCG@10:** discounts relevant held-out titles lower in the top ten.
- **Recall@10:** held-out relevant titles retrieved in the top ten divided by all relevant titles in the candidate catalog.
- **Negative transfer:** oracle NDCG@10 minus blended-account NDCG@10.
- **Abstention precision:** assignment accuracy among events above the 0.60 confidence threshold.
- **Coverage:** share of events above that threshold.

The shared-account baseline, inferred lanes, and oracle exclude the same household training history and use the same candidate catalog.

## Claim gate

The pipeline bootstraps household-level NDCG differences 2,000 times. Copy may say SplitTaste produced an offline improvement only when the lower bound of the 95% interval is above zero. Otherwise the project reports the measured result as a hypothesis test and preserves the failure analysis.

No result is described as engagement, viewing-time, retention, or causal lift.

## Demo selection

The product-facing household is selected before inspecting movie titles: choose the size-3, partially-overlapping account whose SplitTaste-versus-blended NDCG delta is closest to that cohort's median. If that cohort is unavailable, use the same rule across all size-3 accounts. This avoids selecting the single best-performing account.
