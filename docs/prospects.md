# Prospect analysis

The current default is [Desk v1.5 draft-aware grading](draft-capital.md), with separate actual-pick and projected-range inputs. College-only mode remains available; the sections below document its data pipeline and earlier model history.

## Historical classes

The class selector includes 2016–2026: 843 prospects with usable pre-draft college inputs. Historical profiles display retrospective grades from the current model, actual NFL draft picks, headshots where available, and NFL regular-season PPR outcomes. Rankings are among the covered players, not a complete draft class. These are regraded profiles, not predictions published before those drafts.

The 2016–2023 classes show complete first-three-season outcomes. The 2024–2026 classes show only observed seasons, currently through 2026 Week 7, labeled **Partial** with the observation window. Future seasons are omitted rather than filled with zero. Historical samples are labeled training, validation or prior evaluation. The 2023 class is reused for competition and analytics evaluation; 2024–2026 are not used for fitting. Cross-class comparisons preserve each player's observation window.

The checked-in `src/lib/data/historical-prospects.json` is built from the cached source datasets, so historical profiles also work on a fresh installation. Rebuild with `npm run backtest:collect -- --recent` then `npm run backtest:export` after the original backtest dataset has been collected. Recent classes are saved separately in `data/backtest/dataset-recent.json`; collecting or exporting them does not change the fitted model or backtest results. Source snapshots are cached; archive the relevant cached files before an intentional refresh. Four of 323 recent draftees lack qualifying inputs and are recorded in that dataset's exclusions.

`/leagues/[leagueId]/prospects` groups college prospects by projected NFL draft year. The board is independent of league rosters and market values. Filters and sorting are URL-backed; selecting up to three players enables comparisons across classes. Pick labels convert the imported class rank to the selected league size; they do not predict an NFL draft slot.

## Data

Prospects are stored in the existing SQLite `app_state` table under `college-prospects:v1`, shared across leagues. No schema migration or external credentials are needed. The local database is ignored by Git. A fresh installation starts empty.

The initial local 2027 snapshot was read from the user's authenticated Bakery class board on October 28, 2026 (215 players). Bakery grades, tiers, projections, and measurements remain provider-reported values. There is no automatic Bakery sync, proprietary score reconstruction, or claim that projected measurements are verified combine results. Player cards link to the original report for production, advanced metrics, and methodology.

## Import

Use **Import prospects** to download a CSV header template, upload a file, or paste CSV. Required fields: `id`, `name`, `school`, `position` (QB/RB/WR/TE), `draftYear`, `rank`, `source`, `sourceUrl` (HTTP/S), and `asOf` (YYYY-MM-DD).

Optional fields: `tier`, `overall` (0–100), `grade`, `zScore`, `height`, `weight` (lb), `forty` (seconds), `draftAge` (years), and `projection`. Blank numeric fields stay missing. Grades and Z-scores use the provider's scale; they are not recomputed across mixed sources.

Imports accept up to 5,000 rows and 900 KB. Invalid rows, malformed CSV, and duplicate IDs within a draft class reject the entire import. Valid imports atomically upsert by `(draftYear, id)`, preserving other records and classes. Reimporting a record replaces its optional fields as well; include all values that should be retained.

Run `npm run test -- src/lib/domain/prospects.test.ts` for validation, sorting, pick labels, merging, and database persistence tests.

## ESPN production and Desk v1

The board now scores real ESPN college production independently of the imported baseline. Bakery ranks remain visible for comparison; its grades, measurements, and scores do not enter the model. Player identities use exact normalized full names and positions, preferring the listed school. Ambiguous or absent identities remain unscored. ESPN roster headshots have initials fallbacks. Desk v1.1 calibrates RB weights against historical NFL outcomes; see [the backtest report](prospect-backtest.md) for coverage, selection, and limitations. The weights below describe the original v1 baseline.

Use **Sync ESPN** or `npm run sync:prospects` to refresh. The public roster, athlete season statistics, and team season statistics endpoints are cached in ignored `data/college-cache/` for six hours. `npm run sync:prospects -- --force` bypasses the cache. Successful player records persist under `college-production:v1`; partial failures preserve prior records. The baseline and production database are local and ignored by Git; deployments need persistent storage and their own import/sync.

The provider fetches up to three regular seasons through the year before the projected draft. Player and team denominators use matching season/type endpoints. Missing values remain null, historical 404s do not discard current data, and mixed-team seasons are excluded. Current-season rosters drive identity resolution; historical draft classes and players absent from those rosters require additional identity coverage.

Desk v1 is an explainable production index, not a trained NFL outcome forecast. Each metric is scaled linearly to 0–100 between explicit lower/upper anchors in `src/lib/domain/college-model.ts`:

| Position | Inputs and weights |
| --- | --- |
| WR / TE | Receiving yard share 35%, receiving yards/game 30%, receptions/game 20%, yards/reception 15%; position-specific anchors |
| RB | Scrimmage yards/game 30%, receiving yards/game 30%, yards/carry 20%, team rushing yard share 20% |
| QB | Adjusted yards/attempt 45%, completion rate 20%, rushing yards/game 20%, passing yards/game 15% |

Adjusted yards/attempt is `(passing yards + 20 × TD − 45 × interceptions) / attempts`. Missing components contribute a conservative neutral 35; at least 60% of metric weight must be observed. Seasons require three games and ten receptions/touches (30 attempts for QBs). Sample reliability is the product of capped game and opportunity fractions; seasonal scores shrink toward 35 by its square root. The latest three qualifying seasons receive 55/30/15 weights, or 65/35 for two. A newer nonqualifying season lowers confidence to Low; the board exposes the last scored year separately from current statistics.

1QB subtracts eight points from QBs; Superflex leaves the production score unchanged. Tiers follow the displayed score: 80 Standout, 65 Strong, 50 Developing, otherwise Depth. Confidence describes sample size and coverage, not probability of NFL success. Compare within positions first: age, injuries, blocking, draft capital, and cross-position fantasy outcomes are not modeled. Desk v1.3 adds season-specific opponent strength and a modest advanced-metric blend for TE; see [the analytics report](prospect-analytics.md). The historical backtest evaluates within-position ordering, not these format adjustments or tier cutoffs.

Provider and model tests cover identity matching, season consistency, missing data, sample shrinkage, recency, baseline independence, and league-format adjustments.

