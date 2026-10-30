# College analytics and competition — Desk v1.3

This report describes v1.3. The current competition setting and its tradeoffs are documented in [Desk v1.4](competition-strength.md).

The board now has sortable Analytics and Production views. Player profiles show position-specific route, target, contact and passing metrics, source links and capture dates. Missing records remain missing. Advanced data does not create a grade for a player without qualifying ESPN production.

## Source and coverage

On 2026-10-29 the user's authenticated Bakery rankings tables were read through their rendered UI, including every Show more page: QB 291, RB 383, WR 702, TE 297 (1,673 total). This is the source's coverage, not the number of matched players on our board. These snapshots span multiple classes and include players outside our historical drafted-player sample.

Raw snapshots and normalized records live in ignored `data/bakery-advanced/`; imported records live in local SQLite `college-advanced:v1`. They are not redistributed in the source bundle. Reimport an authorized captured snapshot with `npm run analytics:import -- path/to/snapshots.json`. This is a dated import, not an automated Bakery sync. The source table's aggregation period and route counts are not supplied, and no historical publication timestamps were verified. The source's separation rating is a contested/uncontested target proxy, **not tracking separation in yards**. QB/RB do not have receiving-route fields; TE has target proxies but no displayed separation rating.

Names match by normalized full name, position and draft year. Suffixes and punctuation normalize; no surname or fuzzy matching. Ambiguous duplicate keys reject an import. Provider ranks, overall grades, draft capital and NFL finishes are excluded from the advanced feature set. Missing values remain null. Source measurements are provider-reported, not independently charted plays.

## Exploratory backtest

Run `npm run analytics:backtest` after collecting the two historical datasets and importing advanced records. Detailed results and all candidates are in `advanced-backtest-results.json`; deployed blends are in `src/lib/domain/advanced-calibration.json`.

Target: first three NFL seasons' regular-season PPR totals, including zeros. Train 2016–2018, validate 2019–2020; report 2021–2023. The report reuses classes inspected in earlier model work and current retrospective provider snapshots. It is not a pristine prospective holdout. Undrafted players are absent; missing ESPN records are excluded. Missing advanced records stay in the comparison with unchanged baseline predictions.

Fixed feature bundles are anchored to 0–100, with at least 80% weighted coverage required. Missing components contribute 35. Test blends are 0%, 15%, 30%, 45% advanced data, with the rest from competition-adjusted production. A nonzero blend must improve an equally weighted combination of within-class Spearman correlation and top-five NDCG in training and improve validation utility by >0.01. A small weight-size penalty breaks the preference toward excessive blends. Selection never receives evaluation rows.

| Position | Usable advanced / historical | Selected weight | Evaluation correlation, before → after | Top-five NDCG, before → after |
| --- | --- | --- | --- | --- |
| QB | 87 / 92 | 0% | .160 → .160 | .560 → .560 |
| RB | 153 / 165 | 0% | .525 → .525 | .811 → .811 |
| WR | 227 / 245 | 0% | .329 → .329 | .497 → .497 |
| TE | 100 / 102 | 15% | .230 → .246 | .664 → .691 |

TE uses yards/route 40%, targets/route 20%, uncontested targets/route 20%, YAC/reception 10%, inverse drop rate 10% **within its 15% advanced blend**. Other positions' metrics are available for inspection and sorting but have no deployed ranking weight. These small observed gains are tentative; missing route counts prevent sample-size shrinkage of the advanced component, so scores using it cannot have High evidence confidence.

## Competition and corrected box scores

`competition:collect` reads ESPN completed games for 2013–2026 using monthly FBS/FCS scoreboards and team schedules where the provider truncates scoreboard responses. URLs, hashes and counts are in `competition-sources.json`; raw responses remain ignored. Deduplicate by game ID. Ratings solve ridge-regularized opponent-adjusted margins (ridge 4, margin cap ±28, home advantage 3). Schedule strength is mean opponent rating for that player's school and season. Transfers use the corresponding historical school. Provider season-type 2 is used; ESPN can classify FCS playoff games differently from FBS. COVID schedules and disconnected groups are limitations. Fewer than four games gets no adjustment and Low evidence confidence.

The selected adjustment is `clamp(16 * meanOpponentRating / 10, -15, 15) * sqrt(reliability)`, applied before season recency averaging. It is not a blanket school-brand bonus. The coefficient was selected on 2016–2020 and checked on 2023; 2023 was also used for data audits and a deployment gate. A first correlation-only screen did not produce a robust winner; the second screen used both rank correlation and top-five ordering. That iterative development weakens the evidence.

The final 2023 check includes 80 players: macro correlation .249 → .259 and NDCG .654 → .687. The paired position-stratified bootstrap interval for correlation gain is −.092 to +.123, spanning zero. Some position-level results worsen. Full candidates and predictions are in `competition-backtest-results.json` and `competition-backtest-predictions.csv`.

The ESPN adapter now checks positive as well as zero game counts against deduplicated regular-season logs. If core totals include playoffs, a complete combined regular/postseason log must reconcile to the core opportunity total, or regular events must reconcile to their own summary, before regular-only values replace core values. This corrects cases such as DeVonta Smith's 2020 season. Invalid or incomplete logs do not invent denominators. Historical export now covers 843 players; old v1.1 reports describe an older source snapshot and are preserved as development history.

## Remaining model limits

This is a college production index, not a calibrated cross-position NFL prospect grade or hit probability. The 1QB adjustment remains a manual eight points. Draft capital is displayed separately and never fed to the pre-draft score. Competition and advanced metrics do not fix every ranking: Cole Payton still ranks above Jeremiyah Love under the current index, partly because Payton has one qualifying season while Love's earlier seasons also count. No player-specific override was added. A future cross-position NFL-value model needs its own target, selection procedure and evaluation; simply increasing a penalty until one example flips is not evidence of improvement.
