# Dynasty Desk

A personal dynasty fantasy football research and trade assistant. Connect a Sleeper account, pick a league and team, and get sourced Keep / Shop / Monitor calls, player reports, trade targets with realistic packages, and a two-team trade lab.

Everything runs locally without paid API keys. AI explanations are optional.

## Quick start

Requirements: Node.js 20.9 or newer (tested on Node 24) and pnpm. If `pnpm` is missing, run `corepack enable` once.

**Windows (PowerShell)**

```powershell
git clone <your-repo-url> dynasty-desk
cd dynasty-desk
pnpm install
Copy-Item .env.example .env.local   # optional; every value has a default
pnpm dev
```

**macOS / Linux**

```bash
git clone <your-repo-url> dynasty-desk
cd dynasty-desk
pnpm install
cp .env.example .env.local          # optional
pnpm dev
```

Open http://localhost:3000 (Next.js picks the next free port if 3000 is busy and prints it). Enter your Sleeper username, choose a season and league, confirm your team, and select **Connect league**. The first import downloads the Sleeper player directory, nflverse stats, and market values; it usually takes 10–30 seconds. Later syncs reuse caches.

The database is created and migrated automatically on first use at `data/dynasty-desk.db`. To create it ahead of time, run `pnpm db:migrate`.

To explore without an account, open **Demo league** from the home page. Demo data is synthetic, generated in memory, never written to the live tables, and labeled on every screen.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Start the app in development mode |
| `pnpm build` / `pnpm start` | Production build and server |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm typecheck` | Generate route types and run TypeScript |
| `pnpm lint` | ESLint |
| `pnpm db:migrate` | Create or upgrade the SQLite database |
| `pnpm db:generate` | Generate a new migration after editing `src/lib/db/schema.ts` |
| `pnpm sync` | Refresh every connected league from the command line (`pnpm sync -- --force` ignores cache windows) |

## Configuration

All variables are optional. See `.env.example`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `file:./data/dynasty-desk.db` | SQLite location |
| `AI_PROVIDER` | `openai` when a key is set, else `none` | Set to `none` to force AI off |
| `OPENAI_API_KEY` | — | Server-side only; never sent to the browser |
| `OPENAI_MODEL` | `gpt-5-mini` | A model supporting Responses API JSON-schema structured output (Chat Completions for custom base URLs) |
| `OPENAI_BASE_URL` | OpenAI | Any OpenAI-compatible endpoint, for example Ollama at `http://localhost:11434/v1` |

## What's implemented

- **League connection.** Username lookup, season selection from Sleeper's NFL state (the active league season and the season being played are handled separately), league and team selection with co-owner detection, unowned teams, members, rosters with starter/bench/IR/taxi status, scoring, roster positions, drafts, and traded picks. IDs are stored as strings.
- **Overview.** League format, your strategy, starter value by position vs the league, players worth reviewing, top trade opportunities, changes between the last two saved snapshots, and source freshness.
- **My roster.** Sortable, filterable table (filters live in the URL) with points per game under your league's scoring, games played vs team games, weekly usage sparklines with gaps for byes and missed games, market value with 30-day change and saved value history, the recommendation with its reason, and evidence coverage. Unvalued and IDP players stay visible but unscored. Draft picks with value ranges and protection controls.
- **Player report.** Recommendation and how it was scored; strongest evidence and concerns with clickable citations; production, opportunity, and efficiency for season, last four team games, and last season; age, draft capital, and NFL Combine results; dated Sleeper context; market price vs roster fit with value-history chart; what would change the call; and every source with window, sample, type, and cutoff.
- **Trade targets.** Real players on other rosters that fit your needs and strategy, why each fits, the evidence-based outlook, price, why the other manager might move him, an opening package and an alternative, and objections.
- **Trade lab.** Build any two-team trade from assets each team owns. See raw and adjusted value, lineup changes, depth, roster space and required cuts, timeline fit for both sides, and risks. Save packages and copy an offer summary.
- **Settings.** Strategy, target positions, pick budget, consolidation exponent, pick-season confirmation, league draft-order rules, known draft slots, opponent strategy overrides, protected/available assets, CSV import, provider diagnostics, scoring-rule support, and ID mapping issues.
- **Optional AI explanations.** A structured evidence packet goes to the model; the response is schema-validated, every cited evidence ID must exist in the packet, numbers must appear in the packet, URLs and unknown players are rejected, and the deterministic recommendation cannot be changed. Results are cached by player, league configuration, strategy, evidence version, and model.

## Advisor

### Trade finder and roster plan

**Targets → Trade finder** searches for packages around a specific player or confirmed pick. Shop your asset across the league, or choose another manager's asset to acquire. Filter returns to players or picks and choose strategy fit, an improved starting lineup, or positive adjusted value. Player reports and the Plan page link directly into the finder. Search respects protected assets, your saved pick budget, ownership, and roster checks. Results open in Trade Lab for evaluation, counteroffers, and saving; no offer is sent.

**Plan** shows age exposure for the best active lineup over three years, value concentration, a missing-starter depth stress test, bench trade capital, starters near positional age thresholds, and draft capital by season. Reserve and taxi players are excluded from starting and replacement lineups. Future age bands hold current players and values fixed; they are not forecasts. Unconfirmed draft seasons stay unconfirmed, and missing values are shown as unknown.

Use **Next moves** on Overview to review your team, find trades, or prioritize changes between saved snapshots. Choose a strategy, starter-value, or adjusted-value objective and a target position. **Keep my firsts** further restricts your saved pick budget; it never expands it.

In Trade Lab, choose assets on both sides and select **Suggest counteroffers**. The bounded search preserves requested incoming assets, tries swaps/additions/removals, and validates ownership, confirmed picks, protected assets, pick budget, values, and roster capacity. Select **Use package** to load an option for evaluation and saving. These are proposals for review, never submitted offers or acceptance predictions.

With AI off, the same controls return computed recommendations. To enable AI, set `OPENAI_API_KEY` in `.env.local`, then restart the server. Never use a `NEXT_PUBLIC_` variable for the key. Native OpenAI calls use the Responses API with `store: false`; custom OpenAI-compatible endpoints retain Chat Completions.

The advisor sends a bounded evidence packet and lets the model prioritize verified options and select their supporting facts. It cannot create trade assets, rewrite values, invent citations, or hide risks. Cached selections include the full packet, request, source freshness, model, and prompt version in their key. Concurrent identical requests share a call; at most three distinct advisor calls run per server process. API failures and rejected responses fall back to computed options. No news or projections are inferred; lineup comparisons remain market-value comparisons. Search is deliberately bounded and may miss feasible trades.

## Data sources and live coverage

| Area | Source | Status |
| --- | --- | --- |
| League and ownership | [Sleeper API](https://docs.sleeper.com/) | Live. Player directory refreshed at most daily. |
| Player identity | [DynastyProcess crosswalk](https://nflreadr.nflverse.com/reference/load_ff_playerids.html) + nflverse players | Live. Joins by Sleeper, Sportradar, GSIS, and PFR IDs only. |
| NFL stats | nflverse `stats_player_week`, `snap_counts`, schedules | Live for the current and previous season, refreshed at most every 12 hours. Coverage is verified from the published file. |
| Market values | [Stats Guy Fantasy API](https://statsguyfantasy.com/developers/docs) | Live bulk sync, at most every 12 hours, 60 requests/minute respected. |
| Prospect | nflverse draft picks and NFL Combine | Live. Pro-day results are not included. |
| Advanced metrics, grades, college production | — | Not connected. Import via CSV. |
| News | — | Not connected. Only dated Sleeper status fields (injury, depth chart, team). |
| Projections | — | Not connected, so lineup comparisons use market value and are labeled that way. |

Market values are provider market estimates derived from real trades. They are not projections or trade-acceptance probabilities. Attribution: [Data from Stats Guy Fantasy](https://statsguyfantasy.com).

## Known limitations

- No in-season routes, TPRR, or YPRR: nflverse participation data is published after the postseason, and snaps are never substituted for routes.
- No red-zone or goal-line usage, pressures, or coverage stats; these need play-by-play or charting sources.
- League scoring rules without a per-game nflverse column (long-TD bonuses, pick-six thrown, special-teams fumbles, team defense) are listed in Settings and flagged as partial on affected players.
- Future pick seasons are only tradeable once confirmed by a Sleeper draft, a traded pick, or your confirmation in Settings. Exact slots are never inferred from standings.
- Value history only includes what Stats Guy publishes for players you open or roster, plus values collected at each sync.
- Market values blend scoring systems and league sizes; the exact approximation for your league is listed in Settings.

## Architecture

```
src/
  app/                    Routes (App Router, Cache Components) and server actions
  components/             UI (shadcn/ui primitives in components/ui)
  lib/
    domain/               Pure, tested logic: scoring, metrics, lineup solver, picks,
                          recommendations, valuation, trade validation and generation
    providers/            Adapters: Sleeper, nflverse, Stats Guy, CSV import
    ingest/               Sync jobs with freshness windows and per-source status
    analysis/             Dataset loading and the league model built from it
    ai/                   Optional explanation provider, evidence packet, validation
    db/                   Drizzle schema, client, and repositories
    demo/                 Synthetic demo dataset (in memory only)
```

Pages read only from the database through `src/lib/db/repositories`. External data is fetched by sync jobs, never during page rendering (except the connect flow's league lookup).

### Storage

SQLite via Drizzle and libSQL. **The database file needs persistent disk.** It is not suitable for serverless platforms with ephemeral filesystems; deploy to a machine or container with a mounted volume, or move to PostgreSQL. Only the repository layer touches Drizzle, so a PostgreSQL port means changing `src/lib/db/client.ts`, the schema dialect, and the migrations.

## Valuation and heuristics

See [docs/valuation-and-heuristics.md](docs/valuation-and-heuristics.md) for every assumption, threshold, and configurable setting.

## Next steps

- Play-by-play ingestion for red-zone usage and designed runs.
- A projections provider so lineup comparisons can use points instead of market value.
- A news provider feeding dated context into reports.
- Scheduled background sync (cron or a Windows scheduled task running `pnpm sync`).
- PostgreSQL adapter for hosted use.
