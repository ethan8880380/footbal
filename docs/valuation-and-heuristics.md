# Valuation assumptions and trade heuristics

Dynasty Desk keeps three things separate: **market value** (what managers pay), **football evidence** (what the player has done), and **fit** (what each team needs). AI never computes any of them. Every number below lives in code, referenced by file.

## Market value

- Source: Stats Guy Fantasy bulk `GET /players` and `GET /picks`, refreshed at most every 12 hours. Values are trade-derived market estimates on a 0–10,000 scale. They are **not** projections or acceptance probabilities.
- `valuesAsOf` (when the provider calculated values), `dataUpdatedAt` (player metadata), and the local retrieval time are stored separately.
- Missing values stay `null`. The provider's trade-evaluate endpoint counts unknown assets as 0, so it is not used; all comparisons are computed locally from one provider, one format, and one valuation date.
- A CSV import can replace provider values for a league (Settings → Import CSV). Blank values stay unknown.

### League-to-provider mapping (`src/lib/providers/market/stats-guy.ts`)

| League property | Provider option |
| --- | --- |
| Superflex slot or 2+ QB slots | `sf_*` (2QB without a superflex slot is listed as an approximation) |
| Dynasty or keeper | `*_dynasty` (keeper is listed as an approximation) |
| `bonus_rec_te` > 1, or 2+ TE slots | `tep=bigtep` |
| `bonus_rec_te` > 0 | `tep=tep` |
| 1–4 / 5–9 / 10+ IDP starting slots | `idp=light` / `std` / `heavy` |
| IDP scoring ratio < 8 / 8–13 / > 13 | `idpScoring=tackle` / `balanced` / `bigplay` (provider's formula) |

Always listed as approximations: reception scoring level and league size are not priced separately.

## Draft picks (`src/lib/domain/picks.ts`)

- Base inventory comes only from confirmed seasons: a Sleeper draft exists, the season appears in league pick trades, or you confirmed it in Settings. Up to three future seasons are considered.
- Each pick keeps its **original roster**; trades only change the current owner. Traded-pick records never create picks on their own.
- Seasons with a completed draft are consumed. Drafts in progress, and traded picks that don't match the inventory, are excluded.
- Slot known (Sleeper draft order or a slot you entered): exact slot value when the provider has one. Otherwise the **mid** scenario is used for arithmetic, and the early–late range is shown alongside. Slots are never inferred from standings. League rules such as MaxPF can be recorded as text.

## Consolidation adjustment (`src/lib/domain/valuation.ts`)

```
adjusted(v) = v^k / 10000^(k − 1)
```

- Default `k = 1.35`; configurable from 1.0 (off) to 2.0 in Settings.
- With k > 1, one elite asset outweighs several smaller assets with the same raw total. Example at k = 1.35: one 7,000 asset → 6,178 adjusted; two 3,500 assets → 2 × 2,424 = 4,848 adjusted.
- Both raw and adjusted totals are always shown.

### Value gap labels (`src/lib/domain/trade/evaluate.ts`)

Adjusted gap as a share of the larger side: under 5% "Close in adjusted market value", under 15% "Leans toward …", otherwise "Clearly favors …". These describe value, not the chance a manager accepts.

## Recommendations (`src/lib/domain/recommendations.ts`)

A player without a market value in the league's format is **Insufficient evidence** and is excluded from scored recommendations and packages. Otherwise the score is the sum of:

| Component | Rule |
| --- | --- |
| Timeline fit | Age phase × strategy (table below) |
| Production | Percentile of points per game among rostered players at the position with 2+ games: ≥75th +1, ≥50th +0.5, ≥25th 0, below −0.5; multiplied by 1.5 contending, 1.0 balanced, 0.5 rebuilding |
| Roster fit | +0.75 if he starts in the owner's best valid lineup by market value; −0.5 if he is depth at a position with more than one surplus valued player |
| Market trend | −0.5 if value rose ≥15% in 30 days while production is below the 50th percentile; +0.5 if it fell ≥15% while production is at or above the 50th |

**Keep** at 1.25 or more, **Shop** at −0.75 or less, otherwise **Monitor**.

| Phase × strategy | Contending | Balanced | Rebuilding |
| --- | --- | --- | --- |
| Pre-prime | 0 | +0.5 | +1 |
| Prime | +1 | +0.5 | 0 |
| Past typical prime | 0 | −0.5 | −1.5 |

Prime windows (heuristic): QB 26–32, RB 23–26, WR 24–28, TE 25–29, DL/LB/DB 24–28.

**Evidence strength** describes the evidence, not a probability: strong with 6+ games played, moderate with 3–5, limited with fewer games or without a stats identity or market value.

## Usage metrics (`src/lib/domain/metrics.ts`)

- Windows: season to date, and the last four completed team games (byes excluded, games the player missed included). Previous season is shown for context.
- Rates are summed numerators over summed denominators across games played, never averages of weekly percentages. Team snaps per game = the highest single-player snap count for that team in that game.
- Weeks are classified as played, bye (no team game), did not play (team has snap data, player has none), no record (no snap coverage), or upcoming. Only played weeks are scored.
- Points apply your league's scoring to nflverse per-game stats. Within a recorded game an unrecorded counting stat is zero; games without a record are never scored.

## Opponent strategy estimate (`src/lib/domain/trade/strategy.ts`)

Teams are ranked by starting-lineup market value. Top third with a value-weighted age (top 12 players) above 24.5 → contending. Bottom third, or age ≤ 24.5 with picks ≥ 20% of total value → rebuilding. Otherwise balanced. Always labeled as an estimate and overridable in Settings.

## Target search (`src/lib/domain/trade/targets.ts`, `TARGET_HEURISTICS`)

1. **Needs**: average market value of your starters at each position vs the league average (empty single-position slots count heavily). Your chosen target positions override this; otherwise the two largest deficits are used.
2. **Shortlist**: players on other owned rosters at those positions, value ≥ 1,500, affordable from your two best tradeable assets, and fitting your strategy. Ranked by need, production, and reasons the owner might sell (surplus depth or timeline mismatch). Up to 8 targets.
3. **Asset pool**: up to 10 of your valued players, highest value first, with protected players excluded and players who both start and carry a Keep call (unless marked available) considered last; plus up to 4 picks within your pick budget.
4. **Shapes**: 1-for-1, 2-for-1, 2-for-2 (with a filler from their roster worth ≤ 40% of the target and ≥ 300), and players plus picks.
5. **Value bands** (your adjusted value ÷ theirs): search 0.88–1.22, opening offer 0.90–1.05, alternative 0.95–1.20 with a different centerpiece where possible.
6. Only the best 10 candidates per target get a full evaluation. Packages that fail ownership checks, can't be scored, or need more than one roster cut on either side are dropped.

## Roster capacity and lineups

- Active limit = starters + bench slots. IR and taxi players do not count; incoming players are assumed to join the active roster. Required cuts list the lowest-valued remaining active players.
- Lineups are solved with an exact assignment (Hungarian algorithm), so flexible slots are filled optimally and no player fills two slots. Without projections, lineups are ranked by market value and labeled that way; no projected point gains are shown.

## Snapshots and changes

Each sync saves a snapshot of values, recommendations, teams, injuries, ownership, and pick owners. The Overview compares the last two snapshots. Market value changes of 10% or more are reported. Nothing is backfilled or invented.

## Asset trade finder

The selected asset stays fixed on the outgoing side when shopping, or incoming side when acquiring. Search considers one-for-one and one-for-two exchanges (including two-for-one acquisitions). Pools contain at most 36 valued, unprotected assets nearest the centerpiece in adjusted value. Only packages within an 18% adjusted-value gap are considered; the 16 closest per partner receive full lineup evaluations. Packages must respect ownership, confirmed picks, protected assets, the user's pick budget, at most one required cut per team, and no increase in empty starter slots. Explicit lineup and value objectives require positive gains under that metric. Results show one package per partner before alternatives, up to six. This bounded heuristic is not exhaustive and never estimates acceptance odds.

## Roster plan

Age exposure uses the best active lineup, excluding IR and taxi, and the existing positional age thresholds. Current market values and roster membership stay fixed while age advances zero to three years. Unknown ages or unsupported positions remain in an unknown bucket. Percentage past prime is a share of current active-starter market value, not a projected loss.

The depth stress test removes each starter separately and re-solves the active lineup. Its loss is market value, not fantasy points or injury probability; independent losses must not be added. Bench trade capital lists the five highest-valued non-starters excluding protected assets. The age review queue includes starters at or within two years of the positional decline threshold; age alone is not a sell recommendation.

Draft capital includes only confirmed, currently owned picks. Unknown slots use the existing mid-round scenario. A missing pick value makes the season total unknown instead of treating it as zero. Unconfirmed seasons are visible without assuming ownership. Concentration measures the top three players' share of known player value, excluding picks; the missing-value count is displayed alongside it.
