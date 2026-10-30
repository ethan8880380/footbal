# Prospect model backtest — Desk v1.1

The deployed change is limited to RB weights. Among 2021–2022 drafted running backs with usable college data, mean within-class Spearman correlation with first-three-season NFL PPR production increased from **0.361 to 0.408**. Top-five NDCG increased from **0.590 to 0.606**. The paired bootstrap 95% interval for the correlation gain is **−0.035 to +0.150**: this is a tentative historical improvement, not statistically established superiority.

## Cohort and outcome

- Complete draft-list denominator: **555** QB/RB/WR/TE selections from 2016–2022.
- Usable college inputs: **511 (92.1%)**. All **44 exclusions** are recorded in `prospect-backtest-exclusions.json` rather than silently dropped.
- Outcome: sum of nflverse `fantasy_points_ppr` for regular-season weeks in the draft year and following two years. This includes availability and opportunity as well as performance. Absent player-season rows count as zero, after verifying the NFL files include the final regular-season week for every required year.
- NFL outcomes stop at the completed 2024 season. Every included draft class has the same three-season observation window. Players with no NFL production remain in the cohort.
- NFL IDs join through GSIS/PFR identifiers; ESPN's explicit NFL `collegeAthlete` reference resolves historical college IDs. No fuzzy name matching is used.
- College features use only the three calendar seasons before the draft, matching regular-season athlete and team totals. Draft position, NFL stats, current size, and Bakery ranks never enter the college score.

Sources: [nflverse player IDs](https://nflreadr.nflverse.com/reference/load_players.html), [nflverse draft picks](https://nflreadr.nflverse.com/reference/load_draft_picks.html), [NFL weekly player statistics](https://github.com/nflverse/nflverse-data/releases/tag/player_stats), and ESPN historical college statistics. Download URLs, SHA-256 hashes, collection time, and dataset hash are recorded in `prospect-backtest-results.json`. Raw source responses remain under ignored `data/backtest/`.

## Selection protocol

1. **Training: 2016–2018.** Search positive four-component weights in 10-point increments, each at least 10%, summing to 100%. Preserve the original feature scaling, minimum sample rules, missing-value treatment, reliability shrinkage, and 55/30/15 season weighting.
2. Score each candidate by mean within-class Spearman correlation, penalized by `0.10 × sum((candidate − original)²)`. Keep the top five training candidates.
3. **Validation: 2019–2020.** Select among those five and the original. Require improved penalized training performance and at least 0.01 penalized validation improvement. Otherwise retain the original.
4. **Held-out evaluation: 2021–2022.** The selector never receives these rows. Promote the locked candidate only if at least 15 test players are available, mean rank correlation improves, and top-five NDCG does not decline. This is a holdout deployment gate: the deployed choice is therefore not independent of the holdout.

Spearman uses average ranks for ties; undefined correlations are omitted. Classes are equally weighted, not pooled across positions. NDCG@5 discounts each rank logarithmically and uses nonnegative three-season PPR as relevance. The seeded paired bootstrap resamples players within each held-out class 1,000 times. Its interval is conditional on these two classes and does not capture all uncertainty across future classes.

## Final held-out results

| Position | Test players | Original ρ | Selected candidate ρ | Original NDCG@5 | Candidate NDCG@5 | Decision |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| QB | 19 | 0.278 | 0.096 | 0.568 | 0.474 | Retain original |
| RB | 42 | 0.361 | 0.408 | 0.590 | 0.606 | Deploy candidate |
| WR | 60 | 0.204 | 0.204 | 0.407 | 0.407 | Original won validation |
| TE | 23 | 0.278 | 0.260 | 0.599 | 0.561 | Retain original |

RB weights changed from **30/30/20/20** to **30/30/30/10** for scrimmage yards/game, receiving yards/game, yards/carry, and team rushing yard share, respectively. QB, WR, TE, recency, and 1QB adjustments remain unchanged. Both the board and profile component weights read the deployed calibration file.

The benchmark based on actual NFL draft order achieved held-out correlations of 0.349 QB, 0.666 RB, 0.698 WR, and 0.450 TE. It outperformed this production-only model, but is only available after the draft. These results do not justify treating production-only rankings as a replacement for scouting or draft capital.

## Data audit and limits

The initial historical feed had different NFL/college athlete IDs, missing `seasonType` properties, summary rows without teams, and zero game counts alongside nonzero production. The collector now follows explicit college IDs, verifies season/type through canonical URLs when needed, ignores teamless summary rows, and recovers invalid game counts only when regular-season game-log opportunity totals exactly match the season record. Game-count source URLs are retained. It does not invent counts from a team's schedule.

A preliminary 496-player run favored TE weights. The final audit restored 15 valid records and the same selection protocol instead favored RB weights. Those preliminary results were not deployed as the final model. This sensitivity is evidence of limited stability; results should be treated as retrospective development evidence, not a pristine prospective trial.

The sample excludes undrafted free agents and unavailable college records. Historical corrected data is not a frozen pre-draft scouting snapshot. The feature set omits opponent strength, age, injury, routes, athletic testing, and draft capital. Training uses completed pre-draft seasons, while current prospects may have incomplete seasons. Cross-position ranking, tier boundaries, and the eight-point 1QB adjustment were not calibrated. No NFL success probabilities are claimed.

## Reproduction

```sh
npm run backtest:collect
npm run backtest:prospects
npm run test
npm run typecheck
```

Collection caches public responses and 404s in `data/backtest/`; it reuses frozen CSV downloads. To intentionally create a new source snapshot, archive that directory first. The fitting command performs no network calls and writes the results, per-player feature/prediction CSV, exclusion log, and `src/lib/domain/college-model-calibration.json`. Review those generated changes together. The checked-in CSV provides every feature vector, target, split, and prediction for independent auditing without downloading raw ESPN responses.
