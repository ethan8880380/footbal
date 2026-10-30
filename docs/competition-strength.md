# Stronger competition adjustment — Desk v1.4

The competition coefficient increases from 16 to 40, and its cap from ±15 to ±25. Schedule strength is now centered on 3.5: the mean opponent rating across unique team-seasons represented in the 2016–2018 training sample. The reference uses college schedules, not NFL outcomes, and is held fixed for later classes. Below-reference schedules receive a deduction even if their opponent rating is above the all-college mean. Missing schedules still receive no adjustment.

Formula: `clamp(40 * (meanOpponentRating - 3.5) / 10, -25, 25) * sqrt(reliability)`. Seasonal scores remain bounded to 0–100. Recency, production components, TE advanced blend and the 1QB adjustment are unchanged. Source coverage and schedule-rating limitations from `prospect-analytics.md` still apply.

Compared the old setting with coefficients 24, 32, 40 and 48 under the new reference and cap. An initial rule requiring nondecreasing combined training utility retained the baseline. After inspecting that result, selection was revised to require nondecreasing training rank correlation and both validation metrics; select the greatest mean validation correlation/NDCG, tie toward the smaller coefficient. This is exploratory model development prompted by the user's stronger-competition preference, not a preregistered test.

| Sample | Correlation before → after | Top-five NDCG before → after |
| --- | --- | --- |
| Training 2016–2018 | .373 → .390 | .666 → .640 |
| Validation 2019–2020 | .264 → .272 | .497 → .547 |
| Reused evaluation 2021–2023 (229 players) | .315 → .327 | .640 → .628 |

The selected setting improves overall ordering but slightly worsens top-five ordering on evaluation. These are within-position metrics averaged equally across positions, not evidence that mixed-position ranks are calibrated. No untouched evaluation set remains. Advanced weights stay fixed at v1.3, including TE's 15% blend.

On the 2026 1QB board, Love remains #2 (72.9); Payton moves from #1 to #4 (70.1); Tyson is #1 (74.1). Payton's competition adjustment changes from about +2 to −9. This is the result of the same formula applied to every school and player, with no player-specific override or NFL draft-capital input.

Reproduce with `npm run competition:strength` using the cached historical and advanced datasets. Candidate details are in `competition-strength-results.json`; runtime parameters are in `src/lib/domain/competition-strength-calibration.json`. Prior competition/advanced reports are retained as versioned development history and do not describe the current competition coefficient.
