# Application kit

Prepared only. Nothing has been submitted or sent.

## Project description

SplitTaste is a noncommercial research demo inspired by a common behavior: friends and household members often press play on the profile already open on a TV, mixing their preferences into someone else's recommendations. It tests whether a few user-controlled corrections can reduce that interference in synthetic shared streaming households. A reproducible MovieLens ETL and evaluation layer supports a two-question browser experience that reweights anonymous taste-lane recommendations locally.

## Resume bullets

- Built an interactive personalization research demo using Python, DuckDB, SQL, sparse matrix factorization, and Next.js to separate blended rating histories into user-controlled anonymous taste lanes.
- Designed reproducible evaluation across 72 synthetic households, improving offline NDCG@10 from 0.0292 for a blended baseline to 0.0406 after three corrections while preserving explicit persona-recovery and causal-claim limits.

The metric bullet is valid only while the committed `artifacts/evaluation.json` remains the source of truth.

## 90-second demo script

“The idea came from a very ordinary moment. When I watch something at a friend's home, or a friend uses my TV, we rarely stop to create or switch to a guest profile. We just press play. Later, those choices are mixed into the account owner's recommendations.

Profiles can prevent that problem, but only if people remember in the moment. So I asked a different product question: can we repair a mixed recommendation profile with almost no effort?

This is SplitTaste. It analyzes the mixed history and surfaces three anonymous taste patterns, but it does not claim those patterns are people. First, I choose which taste feels most like mine. Then it asks about one title where my answer carries high information: was this my choice, probably a guest's, or am I unsure? The interface immediately compares the blended row with a reweighted row. Other tastes are kept rather than deleted, and the guest label comes from me, not the model.

Behind the interaction is a reproducible MovieLens 32M pipeline. I construct deterministic synthetic households, preserve the source-user mapping only for evaluation, and compare a blended baseline, inferred lanes, and an oracle. The evidence panel reports clustering, ranking, correction-curve, and abstention metrics. Offline results are never presented as engagement lift.

The product decision I wanted to demonstrate is that personalization metrics should close a user-facing loop. The offline result supports a narrow ranking improvement after three confirmations, while weak identity recovery reinforces the product boundary: help users reweight tastes, do not pretend to identify people. The next test would be whether real account owners understand this two-question repair and find the result useful.”

## Connect note

Hi [Name], I’m applying for the Prime Video BIE role. I built SplitTaste, a MovieLens research demo inspired by friends watching on the profile already open on a TV. It explores whether a few user choices can repair mixed recommendations. I’d value your perspective.

## Likely interview questions

### Why synthetic households?

No unrestricted public dataset provides the household ground truth required for this build. MovieLens has real anonymized rating behavior but no household field, so source users are deterministically combined and the original mapping is retained only for evaluation.

### How do you prevent the demo from becoming a cherry-picked anecdote?

The public account is selected by a documented median-delta rule inside a predefined household cohort. Aggregate results and cohort cuts remain visible separately.

### Why not call each lane a person?

The observable evidence supports preference patterns, not identity. One person can have multiple contexts and several people can share a preference. “Taste lane” is more accurate and gives the user control without demographic inference.
