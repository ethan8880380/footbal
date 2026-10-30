# Prospect research lab

The prospect board defaults to Research lab. Analytics and Production tables remain available. Explore obeys the existing class, position, search, tier and grade-mode controls. The current Desk v1.5 rankings are retained: the Research v3 regression reaches parity with them and with pick-only ordering but does not consistently beat either.

## Data and metric inventory

61 named metrics span production, opportunity, efficiency, competition, age/athleticism, provider charting, and draft capital. Every metric has a definition, position eligibility and class coverage in Metric library. Missing data remains absent. The charting inventory is descriptive and is not automatically a model input.

- ESPN supplies pre-draft regular-season totals and team denominators. Derived ratios use the latest season; peak/trend require at least three games. Trend requires consecutive seasons. Receiving dominator is the mean of receiving-yard share and receiving-TD share.
- [nflverse combine](https://nflreadr.nflverse.com/articles/dictionary_combine.html) supplies archived pre-draft height/weight, forty, bench, vertical, broad jump, cone and shuttle. Downloaded public CSV: https://github.com/nflverse/nflverse-data/releases/download/combine/combine.csv. Joins require unique PFR ID + draft year and combine season no later than draft year. No name-only joins or current NFL body measurements. Missing tests stay missing. The CSV does not distinguish venue or timing method: [2021 workouts were at pro days](https://www.nfl.com/news/nfl-memo-details-different-format-for-combine-individual-workouts-will-be-held-o), so these are labeled pre-draft testing, not universally combine measurements. Age uses nflverse birth date at draft-year May 1. BMI and weight-adjusted speed are explicit derived formulas.
- Existing local Bakery summaries supply route, target, contact and throw charting. Separation is a target-based proxy, not tracking distance. Unknown composites, projected speed, and provider overall grades are excluded. These raw licensed records stay in ignored local data, not a new committed data bundle.
- [CFBD coverage](https://api.collegefootballdata.com/data-availability) documents EPA/PPA, success, opponent-adjusted WEPA, usage, recruiting and other potential inputs. No API key is configured; these have not been ingested. CPOE/enriched passing and rushing begin in 2025, outside the training window.
- [PFF charting field catalogue](https://media.pff.com/2018/08/PFF-Play-Data-Fields.pdf) describes additional licensed route, coverage, pressure, blocking and run-context fields. The app lists these as unavailable, not zeros. Verified all-route separation, injuries and archived consensus projections require additional sources.

## Algorithm and evaluation

Eight ridge regressions: one per position, separately college-only and post-draft. Target is log(1 + first-three-season regular-season NFL PPR). Training: 2016–2020. Tuning: leave-one-draft-class-out. Evaluation: 2021–2023, already reused during prior development and explicitly not an untouched holdout. Incomplete 2024–2026 NFL outcomes never enter training or evaluation. Players missing usable college production and undrafted players are excluded.

Research v3 changes, each isolated on identical splits (see results below):

1. **Capital is lightly penalized (×0.05).** Draft capital is the dominant signal; shrinking it with the same penalty as noisy combine splits discarded most of the model's skill. This was the largest single gain.
2. **Eight inputs maximum.** With 100–150 training rows per position, 25 correlated candidates overfit. Inputs are ranked by absolute correlation with the target inside the training rows (capital always kept in post-draft mode). Selection is repeated inside every tuning fold.
3. **Leave-one-class-out penalty selection** over 2016–2020 replaces a single two-class validation split, then the model refits on all five classes. The 80% residual band uses these out-of-fold residuals.

Each feature still requires 50% training coverage, ten observations and nonzero variance. Scaling/imputation is fitted on training only; missing values use the training mean, standardized observations clip at ±3 SD. Penalties 1, 5, 20, 80, 320. Class-relative z-scoring of every input and blending with Desk ranks were tested and rejected: the first collapsed TE (rolling ρ ≈ 0) and the second did not beat either component.

Predictions transformed with expm1 represent typical log-scale outcomes, not arithmetic expected PPR. The nominal 80% band is the 80th percentile of out-of-fold absolute log residuals; evaluation coverage is shown. Large bands reflect substantial uncertainty. Future draft projections are an explicitly unvalidated scenario using the full fitted capital coefficient; they do not inherit the Desk heuristic projection discount. Missing future combine data is imputed, with coverage displayed.

Post-draft evaluation mean within-class Spearman correlations (2021–2023):

| Position | Research v3 | Research v2 | Desk v1.5 | Pick only |
| --- | ---: | ---: | ---: | ---: |
| QB | .444 | .315 | .486 | .456 |
| RB | .679 | .563 | .756 | .718 |
| WR | .665 | .548 | .625 | .665 |
| TE | .587 | -.027 | .575 | .554 |
| Mean | .594 | .350 | .611 | .598 |

A stricter rolling-origin check (each class 2019–2023 predicted from earlier classes only, penalty tuned inside) gives mean ρ .600 for v3, .520 for the v2 recipe, .618 Desk, .602 pick-only. Gains over v2 are consistent across positions; differences versus Desk and pick-only are well inside sampling noise for 5–6 classes of 20–60 players. College-only mode improves QB (.24 → .44) and WR (.22 → .37) but remains weak for RB and TE. The model is exposed for investigation, not promoted, and no superiority over Bakery is claimed.
## Visuals

- Class scatter with selectable axes, position colors, point selection, keyboard actions and missing-axis counts.
- Same-position percentile bars against 2016–2023 drafted players, excluding the selected player. This descriptive reference can include future classes for older prospects; it is not a historical as-of percentile. Direction inversion is explicit for time/age/drop/turnover metrics.
- Latest three qualifying-season production/competition trajectories, with actual opponent strength and score deltas.
- Exact additive feature decomposition in log-PPR units; correlated coefficients are associations, not causal effects.
- Earlier-class neighbors using RMS standardized distance over shared college-only inputs; minimum 50% overlap. NFL outcomes and capital do not enter distance. Displayed NFL outcomes are retrospective and may postdate the selected prospect's draft.
- Predicted-vs-actual scatter, Desk/pick-only benchmarks, class-level rank correlation and top-five NDCG, empirical residual-band coverage.
- Searchable metric definitions, class coverage and explicit source gaps.

Rebuild: `npm run analytics:research` after public combine/players CSV and historical archive are refreshed. Raw files live in ignored `data/backtest`; source snapshot time is in calibration JSON. Full reproducible candidate/evaluation output: `docs/prospect-lab-backtest.json`.
