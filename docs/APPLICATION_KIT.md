# Application kit

Prepared only. Nothing has been submitted or sent.

## Project description

SplitTaste is a noncommercial research demo that tests whether three user-controlled corrections can reduce offline recommendation interference in synthetic shared streaming households. It combines a reproducible MovieLens ETL and evaluation layer with a guided browser interaction that recalculates anonymous taste-lane recommendations locally.

## Resume bullets

- Built an interactive personalization research demo using Python, DuckDB, SQL, sparse matrix factorization, and Next.js to separate blended rating histories into user-controlled anonymous taste lanes.
- Designed reproducible evaluation across 72 synthetic households, improving offline NDCG@10 from 0.0292 for a blended baseline to 0.0406 after three corrections while preserving explicit persona-recovery and causal-claim limits.

The metric bullet is valid only while the committed `artifacts/evaluation.json` remains the source of truth.

## 90-second demo script

“Shared streaming accounts are usually modeled as one user. My hypothesis was that the account may not be incoherent at all; it may contain several coherent taste lanes mixed with the wrong weights.

This is SplitTaste. The opening row blends comedy, science fiction, and crime signals. The model finds three anonymous patterns, but it does not claim they are people. It selects three titles where a correction would carry the most information. I place each title into the lane where it belongs, and the recommendation rows recompute locally.

Behind the interaction is a reproducible MovieLens 32M pipeline. I construct deterministic synthetic households, preserve the source-user mapping only for evaluation, and compare a blended baseline, inferred lanes, and an oracle. The evidence panel reports clustering, ranking, correction-curve, and abstention metrics. Offline results are never presented as engagement lift.

The product decision I wanted to demonstrate is that metrics should close a user-facing loop. The next test would be whether real account owners understand taste lanes and whether three questions are enough to produce a useful correction.”

## Connect note

Hi [Name], I’m applying for the Prime Video BIE role. I built SplitTaste, a MovieLens research demo exploring whether three user choices can untangle recommendations in a shared account. I would value your perspective on the product and measurement approach.

## Likely interview questions

### Why synthetic households?

No unrestricted public dataset provides the household ground truth required for this build. MovieLens has real anonymized rating behavior but no household field, so source users are deterministically combined and the original mapping is retained only for evaluation.

### How do you prevent the demo from becoming a cherry-picked anecdote?

The public account is selected by a documented median-delta rule inside a predefined household cohort. Aggregate results and cohort cuts remain visible separately.

### Why not call each lane a person?

The observable evidence supports preference patterns, not identity. One person can have multiple contexts and several people can share a preference. “Taste lane” is more accurate and gives the user control without demographic inference.
