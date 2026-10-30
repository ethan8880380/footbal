# Draft-aware grades — Desk v1.5

The default grade now blends college evidence with draft capital. Completed historical classes use the actual pick from the existing NFL draft archive and are labeled **Post-draft grade**. Current prospects use their imported `projection` field and are labeled **Projected draft grade**. The **College-only grade** selector excludes both. Player profiles show the input, applied weight and college-only score. Unknown projections leave the score unchanged; missing qualifying college production remains unscored. NFL outcomes never enter runtime predictions.

Actual draft score is piecewise linear through (pick, score): (1,100), (10,95), (32,85), (64,72), (100,55), (150,35), (200,20), (260,8), (300,0). These fixed anchors are an explainable heuristic, not fitted probabilities. The learned quantity is the blend weight. The existing competition adjustment and TE advanced blend are inside the college component; draft capital blends afterward, then the unchanged 1QB adjustment applies.

| Position | Actual pick weight | Projection weight | Evaluation college / blended / pick-only correlation |
| --- | --- | --- | --- |
| QB | 65% | 32.5% | .200 / .486 / .456 |
| RB | 65% | 32.5% | .526 / .756 / .718 |
| WR | 50% | 25% | .341 / .625 / .665 |
| TE | 65% | 32.5% | .241 / .575 / .554 |

Target: first-three-season regular-season NFL PPR totals, including zero outcomes. Train 2016–2018; validate 2019–2020. Test weights 0%, 20%, 35%, 50%, 65%. Require improvement in mean within-class rank correlation/top-five NDCG on both train and validation; choose greatest validation utility, ties favor less draft weight. Evaluation reports 2021–2023 (229 players), reused classes from earlier model development. It is not a pristine holdout or a pre-draft forecasting test. WR draft-only ordering beats the selected blend in evaluation; the blend was selected on validation, not that evaluation. Cross-position ranking and the manual 1QB adjustment remain uncalibrated. The sample includes drafted players with usable college records, not all undrafted prospects.

Future projections use half the learned actual-pick weight. This discount is explicitly heuristic: no archived historical projections are available to validate it. Imported Bakery labels are provider-reported, not a newly researched consensus mock draft. Top 5/10/20/32 and round labels map to the average draft score across their range; round boundaries after round two are approximate (65–100, 101–140, 141–180, 181–220, 221–260). UDFA maps to zero; unrecognized labels stay missing. No exact projected pick is invented. Projection dates and source URLs remain those of the imported prospect record.

On the covered 2026 1QB board, Love is #1 (89.8), and Payton #49 (36.6). College-only mode preserves their earlier scores of 72.9 and 70.1. No player-specific override is applied.

Run `npm run draft:backtest` with cached historical and advanced data. Full candidates, top-five metrics and the pick-only benchmark are in `draft-capital-backtest.json`; selected weights live in `src/lib/domain/draft-capital-calibration.json`. Earlier v1.3/v1.4 reports describe college-only model development.
