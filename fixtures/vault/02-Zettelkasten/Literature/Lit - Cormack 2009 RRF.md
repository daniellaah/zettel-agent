---
type: literature
created: 2026-06-21
tags: [ir, paper, fusion]
aliases: [Reciprocal Rank Fusion paper]
---
# Lit - Cormack 2009 RRF

**Source**: Gordon V. Cormack, Charles L. A. Clarke, Stefan Büttcher, "Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods", SIGIR 2009 (short paper)

## What it proposes
A very simple way to combine several ranked lists: each document gets, from each list, a score of one over (a constant plus its rank in that list), and the scores are summed. Documents missing from a list get nothing from it. The constant was set to 60 in the paper, chosen on a pilot run and then left fixed.

## Why the constant matters
The constant dampens the advantage of the very top ranks. With a small constant, the first position in any single list dominates; with 60, a document that is moderately high in several lists can beat one that is first in only one list.

## Results
On TREC collections, fusing many runs this way beat Condorcet-style voting and also beat the individual learning-to-rank methods that were being combined — which was the surprising part, given how little the method assumes.

## Notes for my use case
- No score calibration needed, so a BM25 run and an embedding run can be fused directly.
- It ignores score gaps entirely; if one retriever is much more confident about its top hit, RRF cannot see that.
- Cheap enough to run inside the plugin on every query.

## Derived notes
- [[RRF 融合只依赖排名不依赖分数]]
