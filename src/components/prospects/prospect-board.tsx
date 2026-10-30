"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { ArrowDown, ArrowUp, ArrowUpRight, Download, Search, Upload, RefreshCw } from "lucide-react";
import { importProspectsAction, syncProspectsAction } from "@/app/leagues/[leagueId]/prospects/actions";
import { PageHeading, EmptyState } from "@/components/page-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { prospectPick, sortProspects, type Prospect } from "@/lib/domain/prospects";
import { PROSPECT_TEMPLATE } from "@/lib/providers/prospect-csv";
import { buildCollegeBoard, COLLEGE_MODEL_VERSION, COLLEGE_CALIBRATION, COMPETITION_CALIBRATION, COMPETITION_STRENGTH, type CollegeBoardRow, type CollegePlayer } from "@/lib/domain/college-model";
import type { CollegeSyncResult } from "@/lib/services/college-service";
import type { ProspectHistory } from "@/lib/domain/historical-prospects";
import { ADVANCED_CALIBRATION, METRIC_LABELS, metricDisplay, type AdvancedProspect } from "@/lib/domain/advanced-prospects";
import { DRAFT_CALIBRATION } from "@/lib/domain/draft-capital";
import { ProspectLab } from "./prospect-lab";

const ANALYTIC_COLUMNS = { all: ["Y/RR", "T/RR", "UCTPRR", "MTF/A", "YCO/A", "ADJ%", "BTT%", "TWP%"], WR: ["Y/RR", "T/RR", "UCTPRR", "CTPRR", "YAC/R", "aDOT", "Drop%", "CC%", "Separation"], TE: ["Y/RR", "T/RR", "UCTPRR", "CTPRR", "YAC/R", "aDOT", "Drop%", "CC%"], RB: ["MTF/A", "YCO/A", "RPT", "ELU", "Break %"], QB: ["ADJ%", "BTT%", "TWP%", "MTF/A", "YCO/A"] };

const POSITIONS = ["QB", "RB", "WR", "TE"] as const;
const SORTS = ["rank", "overall"] as const;
const SELECT = "h-9 rounded-full border border-input bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring";
const num = (value: number | null, digits = 1) => value === null ? "—" : value.toFixed(digits);
const rowKey = (row: Prospect) => `${row.draftYear}:${row.id}`;
const signed = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
function competitionDelta(row: CollegeBoardRow) {
  const weights = row.model.seasons.length === 1 ? [1] : row.model.seasons.length === 2 ? [.65, .35] : [.55, .30, .15];
  return row.model.seasons.reduce((n, season, i) => n + weights[i] * (season.score - season.productionScore), 0);
}

export function ProspectBoard({ rows: baseline, production, analytics = [], history = {}, syncStatus, leagueId, defaultYear }: { rows: Prospect[]; production: CollegePlayer[]; analytics?: AdvancedProspect[]; history?: Record<string, ProspectHistory>; syncStatus: CollegeSyncResult | null; leagueId: string; defaultYear: number }) {
  const years = [...new Set([...baseline.map(r => r.draftYear), defaultYear, defaultYear + 1, defaultYear + 2])].sort((a, b) => a - b);
  const [state, setState] = useQueryStates({
    year: parseAsInteger.withDefault(defaultYear),
    pos: parseAsStringLiteral(["all", ...POSITIONS] as const).withDefault("all"),
    q: parseAsString.withDefault(""),
    tier: parseAsString.withDefault("all"),
    sort: parseAsStringLiteral(SORTS).withDefault("rank"),
    dir: parseAsStringLiteral(["asc", "desc"] as const).withDefault("asc"),
    format: parseAsStringLiteral(["1qb", "sf"] as const).withDefault("1qb"),
    view: parseAsStringLiteral(["lab", "analytics", "production"] as const).withDefault("lab"),
    metric: parseAsString.withDefault(""),
    grading: parseAsStringLiteral(["draft", "college"] as const).withDefault("draft"),
  });
  const rows = useMemo(() => buildCollegeBoard(baseline, production, state.format, analytics, history, state.grading === "draft").map(row => ({ ...row, history: history[row.id] })), [baseline, production, analytics, history, state.format, state.grading]);
  const [teams, setTeams] = useState(12);
  const [selected, setSelected] = useState<string[]>([]);
  const [profile, setProfile] = useState<CollegeBoardRow | null>(null);
  const [comparing, setComparing] = useState(false);
  const classRows = sortProspects(rows.filter(r => r.draftYear === state.year), "rank", false);
  const query = state.q.trim().toLowerCase();
  const filtered = sortProspects(classRows.filter(r => (state.pos === "all" || r.position === state.pos) && (state.tier === "all" || r.tier === state.tier) && `${r.name} ${r.school}`.toLowerCase().includes(query)), state.sort, state.dir === "desc");
  const analyticColumns = ANALYTIC_COLUMNS[state.pos];
  if (state.view === "analytics" && analyticColumns.includes(state.metric)) filtered.sort((a, b) => {
    const x = a.advanced?.metrics[state.metric] ?? null, y = b.advanced?.metrics[state.metric] ?? null;
    return x === null ? (y === null ? a.rank - b.rank : 1) : y === null ? -1 : (state.dir === "asc" ? x - y : y - x) || a.rank - b.rank;
  });
  const compareRows = selected.flatMap(key => rows.find(r => rowKey(r) === key) ?? []);
  const toggleSort = (sort: "rank" | "overall") => setState({ metric: "", sort, dir: state.sort === sort ? (state.dir === "asc" ? "desc" : "asc") : sort === "rank" ? "asc" : "desc" });
  const scored = classRows.filter(r => r.overall !== null).length;
  const historicalClass = classRows.some(row => row.history);

  function sortHead(label: string, key: "rank" | "overall") {
    return <TableHead className="text-right" aria-sort={!state.metric && state.sort === key ? (state.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button className="inline-flex items-center gap-1 py-3 focus-visible:outline-2" onClick={() => toggleSort(key)}>{label}{!state.metric && state.sort === key ? state.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : null}</button>
    </TableHead>;
  }

  return <div className="space-y-6">
    <PageHeading title="Prospect analysis" action={<div className="flex flex-wrap gap-2"><ModelNotes status={syncStatus} />{!historicalClass && <SyncProspects leagueId={leagueId} />}<ProspectImport leagueId={leagueId} /></div>} />
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2">
        <select className={SELECT} aria-label="NFL draft class" value={state.year} onChange={e => { setState({ year: Number(e.target.value), tier: "all", q: "" }); setProfile(null); }}>
          {!years.includes(state.year) && <option value={state.year}>{state.year} class</option>}
          {years.map(year => <option key={year} value={year}>{year} class</option>)}
        </select>
        <select className={SELECT} aria-label="Quarterback format" value={state.format} onChange={e => { setState({ format: e.target.value as "1qb" | "sf" }); setProfile(null); }}><option value="1qb">1QB</option><option value="sf">Superflex</option></select>
        <select className={SELECT} aria-label="Grade model" value={state.grading} onChange={e => { setState({ grading: e.target.value as typeof state.grading }); setProfile(null); }}><option value="draft">{historicalClass ? "Post-draft grade" : "Projected draft grade"}</option><option value="college">College-only grade</option></select>
        <ToggleGroup type="single" value={state.pos} onValueChange={pos => setState({ pos: (pos || "all") as typeof state.pos, metric: "" })} variant="outline" size="sm" aria-label="Position">
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          {POSITIONS.map(pos => <ToggleGroupItem key={pos} value={pos}>{pos}</ToggleGroupItem>)}
        </ToggleGroup>
      </div>
      <span className="font-mono text-xs text-muted-foreground">{scored} scored · {classRows.length} prospects</span>
    </div>

    {classRows.length > 0 && <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {POSITIONS.map(pos => {
        const leader = classRows.find(r => r.position === pos && r.overall !== null);
        return leader ? <button key={pos} onClick={() => setProfile(leader)} className="rounded-3xl bg-card p-5 text-left ring-1 ring-foreground/5 transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
          <div className="flex items-center justify-between"><span className="font-mono text-xs text-muted-foreground">{pos} · #{leader.rank}</span><ArrowUpRight className="size-4" /></div>
          <div className="mt-4 flex items-center justify-between gap-2"><div className="font-dot text-4xl font-black tabular-nums">{num(leader.overall)}</div><ProspectHeadshot player={leader} size={72} /></div>
          <div className="mt-3 font-semibold">{leader.name}</div>
        </button> : null;
      })}
    </div>}

    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup type="single" value={state.view} onValueChange={view => { if (view) setState({ view: view as typeof state.view, metric: "" }); }} variant="outline" size="sm" aria-label="Statistics view"><ToggleGroupItem value="lab">Research lab</ToggleGroupItem><ToggleGroupItem value="analytics">Analytics</ToggleGroupItem><ToggleGroupItem value="production">Production</ToggleGroupItem></ToggleGroup>
      <div className="relative min-w-48 flex-1 sm:max-w-xs"><Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" /><Input type="search" aria-label="Search prospects" placeholder="Search players or schools" className="pl-9" value={state.q} onChange={e => setState({ q: e.target.value })} /></div>
      <select aria-label="Prospect tier" className={SELECT} value={state.tier} onChange={e => setState({ tier: e.target.value })}>
        <option value="all">All tiers</option>
        {[...new Set(classRows.map(r => r.tier))].map(tier => <option key={tier}>{tier}</option>)}
      </select>
      {!historicalClass && <select aria-label="League size for pick labels" className={SELECT} value={teams} onChange={e => setTeams(Number(e.target.value))}>{[8, 10, 12, 14, 16].map(size => <option key={size} value={size}>{size}-team picks</option>)}</select>}
      {selected.length > 0 && <><Button variant="outline" size="sm" disabled={compareRows.length < 2} onClick={() => setComparing(true)}>Compare ({compareRows.length}/3)</Button><Button variant="ghost" size="sm" onClick={() => setSelected([])}>Clear</Button></>}
    </div>

    {state.view === "lab" && <ProspectLab rows={rows} visibleRows={filtered} mode={state.grading} onProfile={setProfile} />}
    {!classRows.length ? <EmptyState title={`No ${state.year} prospects`} /> : !filtered.length ? <EmptyState title="No matching prospects"><Button variant="ghost" onClick={() => setState({ q: "", tier: "all", pos: "all" })}>Clear filters</Button></EmptyState> : state.view === "lab" ? null : <div className="rounded-3xl bg-card px-3 py-2">
      <Table className="prospect-table">
        <TableHeader><TableRow>
          <TableHead><span className="sr-only">Compare</span></TableHead>
          {sortHead(historicalClass ? "Desk rank" : "Pick", "rank")}<TableHead>Player</TableHead><TableHead>School</TableHead><TableHead>Pos</TableHead><TableHead>Tier</TableHead>
          {sortHead("Desk score", "overall")}<TableHead>Draft input</TableHead><TableHead>Competition Δ</TableHead><TableHead>{historicalClass ? "NFL pick" : "Bakery rank"}</TableHead>{historicalClass && <><TableHead>NFL PPR</TableHead><TableHead>NFL window</TableHead></>}{state.view === "analytics" ? analyticColumns.map(key => <TableHead key={key} aria-sort={state.metric === key ? (state.dir === "asc" ? "ascending" : "descending") : "none"}><button title={METRIC_LABELS[key] ?? key} onClick={() => setState({ metric: key, dir: state.metric === key && state.dir === "desc" ? "asc" : "desc" })}>{key === "Separation" ? "Separation proxy" : key}{state.metric === key ? (state.dir === "desc" ? " ↓" : " ↑") : ""}</button></TableHead>) : <><TableHead>Season</TableHead><TableHead>Games</TableHead><TableHead>Rec yds</TableHead><TableHead>Rush yds</TableHead><TableHead>Pass yds</TableHead><TableHead>Scored through</TableHead><TableHead>Evidence</TableHead></>}
        </TableRow></TableHeader>
        <TableBody>{filtered.map(row => <TableRow key={rowKey(row)}>
          <TableCell><input type="checkbox" aria-label={`Compare ${row.name}`} checked={selected.includes(rowKey(row))} disabled={selected.length >= 3 && !selected.includes(rowKey(row))} onChange={e => setSelected(current => e.target.checked ? [...current, rowKey(row)] : current.filter(key => key !== rowKey(row)))} className="size-4 accent-foreground" /></TableCell>
          <TableCell className="text-right font-mono text-muted-foreground">{row.overall === null ? "—" : historicalClass ? `#${row.rank}` : prospectPick(row.rank, teams)}</TableCell>
          <TableCell><button onClick={() => setProfile(row)} className="flex items-center gap-3 py-1 font-medium underline-offset-4 hover:underline focus-visible:underline"><ProspectHeadshot player={row} size={40} />{row.name}</button></TableCell>
          <TableCell className="text-muted-foreground">{row.school}</TableCell><TableCell className="font-mono text-xs">{row.position}</TableCell>
          <TableCell><span className="rounded-full bg-foreground/5 px-2.5 py-1 text-xs">{row.tier}</span></TableCell>
          <TableCell className="text-right font-semibold tabular-nums">{num(row.overall)}</TableCell><TableCell>{row.draft ? `${row.draft.kind === "Projection" ? "Proj. " : "Pick "}${row.draft.label}` : "College only"}</TableCell><TableCell className="text-right font-mono">{row.model.seasons.some(s => s.scheduleStrength) ? signed(competitionDelta(row)) : "—"}</TableCell><TableCell className="text-right font-mono">#{row.history?.draftPick ?? row.baselineRank}</TableCell>{historicalClass && <><TableCell className="text-right font-mono">{num(row.history?.nflPpr ?? null)}</TableCell><TableCell>{row.history?.window ?? "—"}</TableCell></>}
          {state.view === "analytics" ? analyticColumns.map(key => <TableCell key={key} className="text-right font-mono">{metricDisplay(key, row.advanced?.metrics[key] ?? null)}</TableCell>) : <><TableCell>{latest(row)?.year ?? "—"}</TableCell><TableCell>{num(latest(row)?.games ?? null, 0)}</TableCell><TableCell>{num(latest(row)?.receivingYards ?? null, 0)}</TableCell><TableCell>{num(latest(row)?.rushingYards ?? null, 0)}</TableCell><TableCell>{num(latest(row)?.passingYards ?? null, 0)}</TableCell><TableCell>{row.model.seasons[0]?.season.year ?? "—"}</TableCell><TableCell>{row.model.confidence}</TableCell></>}
        </TableRow>)}</TableBody>
      </Table>
    </div>}

    <Dialog open={!!profile} onOpenChange={open => { if (!open) setProfile(null); }}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>{profile?.name}</DialogTitle></DialogHeader>
        {profile && <><div className="flex flex-wrap gap-2 text-sm"><span>{profile.school}</span><span>· {profile.position}</span><span>· {profile.draftYear} class</span></div>
          <div className="flex items-center justify-between rounded-2xl bg-foreground/5 p-5"><ProspectHeadshot player={profile} size={100} /><span className="font-dot text-6xl font-black">{num(profile.overall)}</span><span className="text-sm">{profile.tier}</span></div>
          <dl className="grid grid-cols-3 gap-5 py-3">{profileMetrics(profile).map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-mono text-lg">{value}</dd></div>)}</dl>
          <ProfileProduction player={profile} />
          {profile.history && <section><h3 className="mb-2 font-semibold">{profile.history.complete ? "First three NFL seasons" : "NFL production to date"}</h3><Table><TableHeader><TableRow><TableHead>Season</TableHead><TableHead>PPR points</TableHead></TableRow></TableHeader><TableBody>{profile.history.seasons.map(season => <TableRow key={season.year}><TableCell>{season.year}{!season.complete && ` · through week ${season.throughWeek}`}</TableCell><TableCell>{num(season.ppr)}</TableCell></TableRow>)}<TableRow><TableCell>Total</TableCell><TableCell>{num(profile.history.nflPpr)}</TableCell></TableRow></TableBody></Table><p className="mt-3 text-sm">Regraded with {COLLEGE_MODEL_VERSION} using college stats{profile.draft?.kind === "Actual pick" ? " and the actual NFL draft pick (post-draft model)" : " without actual draft capital"}. {profile.history.sample} sample; not a ranking published before this player’s draft.</p></section>}
          <div className="flex flex-wrap gap-2">{profile.college && <Button asChild variant="outline"><a href={profile.college.sourceUrl} target="_blank" rel="noreferrer">College statistics <ArrowUpRight /></a></Button>}{profile.history?.nflUrl && <Button asChild variant="outline"><a href={profile.history.nflUrl} target="_blank" rel="noreferrer">NFL statistics <ArrowUpRight /></a></Button>}<Button asChild variant="ghost"><a href={profile.baselineUrl} target="_blank" rel="noreferrer">{profile.history ? "NFL draft source" : "Bakery baseline"} <ArrowUpRight /></a></Button></div>
          <p className="text-xs text-muted-foreground">{profile.college ? `ESPN synced ${profile.asOf} · Regular-season statistics` : "No verified ESPN match. Not ranked by the model."}</p>
        </>}
      </DialogContent>
    </Dialog>
    <Dialog open={comparing} onOpenChange={setComparing}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-3xl" aria-describedby={undefined}><DialogHeader><DialogTitle>Compare prospects</DialogTitle></DialogHeader>
      <Table><TableHeader><TableRow><TableHead>Metric</TableHead>{compareRows.map(r => <TableHead key={rowKey(r)}>{r.name}<br />{r.draftYear} · {r.position}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{["School", "Desk score", "Bakery rank", "NFL draft pick", "NFL PPR", "NFL window", "Evidence", "Season", "Games", "Receiving yards", "Rushing yards", "Passing yards", "Height", "Weight", "ESPN synced"].map((label, index) => <TableRow key={label}><TableCell>{label}</TableCell>{compareRows.map(r => <TableCell key={rowKey(r)}>{[r.school, num(r.overall), r.history ? "—" : `#${r.baselineRank}`, r.history ? `#${r.history.draftPick}` : "—", num(r.history?.nflPpr ?? null), r.history?.window ?? "—", r.model.confidence, latest(r)?.year ?? "—", num(latest(r)?.games ?? null, 0), num(latest(r)?.receivingYards ?? null, 0), num(latest(r)?.rushingYards ?? null, 0), num(latest(r)?.passingYards ?? null, 0), r.height || "—", r.weight === null ? "—" : `${r.weight} lb`, r.college ? r.asOf : "—"][index]}</TableCell>)}</TableRow>)}</TableBody>
      </Table>
    </DialogContent></Dialog>
  </div>;
}

function profileMetrics(row: CollegeBoardRow) {
  return [["Desk rank", row.overall === null ? "—" : `#${row.rank}`], [row.history ? "NFL draft pick" : "Bakery rank", `#${row.history?.draftPick ?? row.baselineRank}`], ["Evidence", row.model.confidence], ["Scored through", String(row.model.seasons[0]?.season.year ?? "—")], ...(row.history ? [[row.history.complete ? "NFL PPR · first 3" : "NFL PPR · partial", num(row.history.nflPpr)], ["Backtest sample", row.history.sample]] : [["Height", row.height || "—"], ["Weight", row.weight === null ? "—" : `${row.weight} lb`]])];
}

function latest(player: CollegeBoardRow) { return player.college?.seasons.toSorted((a, b) => b.year - a.year)[0]; }

function ProspectHeadshot({ player, size }: { player: CollegeBoardRow; size: number }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = player.college?.headshot;
  return <span aria-hidden="true" className="relative grid shrink-0 place-items-center overflow-hidden rounded-2xl bg-foreground/5 font-mono text-xs text-muted-foreground" style={{ width: size, height: size }}>
    {url && failedUrl !== url ? <Image src={url} alt="" width={size} height={size} unoptimized onError={() => setFailedUrl(url)} className="size-full object-cover object-top" /> : player.name.split(" ").map(n => n[0]).slice(0, 2).join("")}
  </span>;
}

function ProfileProduction({ player }: { player: CollegeBoardRow }) {
  const scored = player.model.seasons[0];
  return <>
    <section><h3 className="mb-3 font-semibold">Draft capital</h3>{player.draft ? <dl className="grid grid-cols-3 gap-4"><div><dt className="text-sm text-muted-foreground">{player.draft.kind}</dt><dd className="mt-1 font-mono text-xl">{player.draft.label}</dd></div><div><dt className="text-sm text-muted-foreground">Weight</dt><dd className="mt-1 font-mono text-xl">{player.overall === null ? "—" : `${Math.round(player.draft.weight * 1000) / 10}%`}</dd></div><div><dt className="text-sm text-muted-foreground">College-only score</dt><dd className="mt-1 font-mono text-xl">{num(player.collegeScore)}</dd></div></dl> : <p className="text-sm">College-only score; draft input unavailable or disabled.</p>}</section>
    <section><h3 className="mb-3 font-semibold">Advanced analytics</h3>{player.advanced ? <>
      <dl className="grid gap-4 sm:grid-cols-2">{ANALYTIC_COLUMNS[player.position].map(key => <div key={key}><dt className="text-sm text-muted-foreground">{METRIC_LABELS[key] ?? key}</dt><dd className="mt-1 font-mono text-xl">{metricDisplay(key, player.advanced!.metrics[key] ?? null)}</dd></div>)}</dl>
      <details className="mt-4 text-sm"><summary className="cursor-pointer">Source and model use</summary><p className="mt-2"><a href={player.advanced.sourceUrl} target="_blank" rel="noreferrer" className="underline">Bakery college metrics</a> · captured {player.advanced.capturedAt.slice(0, 10)}. Provider summary; season aggregation and route counts are not supplied. Separation is a proxy from contested/uncontested target rates, not tracking distance. {player.advancedWeight > 0 ? `${Math.round(player.advancedWeight * 100)}% of the college component.` : "Available for analysis; the tested blend did not pass training and validation checks, so it has no ranking weight."}</p></details>
    </> : <p className="text-sm">Advanced metrics unavailable.</p>}</section>
    {scored && <section><h3 className="mb-2 font-semibold">Competition adjustment</h3><Table><TableHeader><TableRow><TableHead>Season</TableHead><TableHead>School</TableHead><TableHead>Opponent strength</TableHead><TableHead>Production score</TableHead><TableHead>Adjustment</TableHead></TableRow></TableHeader><TableBody>{player.model.seasons.map(s => <TableRow key={s.season.year}><TableCell>{s.season.year}</TableCell><TableCell>{s.season.school}</TableCell><TableCell>{s.scheduleStrength ? signed(s.scheduleStrength.opponents) : "Unavailable"}</TableCell><TableCell>{num(s.productionScore)}</TableCell><TableCell>{s.scheduleStrength ? signed(s.score - s.productionScore) : "—"}</TableCell></TableRow>)}</TableBody></Table></section>}
    {scored && <section><h3 className="mb-3 font-semibold">{scored.season.year} model inputs</h3><div className="grid gap-4 sm:grid-cols-2">{scored.components.map(component => <div key={component.label}>
      <div className="flex justify-between gap-3 text-sm"><span>{component.label}</span><span className="font-mono">{component.value === null ? "—" : component.units === "%" ? `${(component.value * 100).toFixed(1)}%` : component.value.toFixed(1)}</span></div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/10"><div className="h-full rounded-full bg-signal" style={{ width: `${component.score ?? 0}%` }} /></div>
      <div className="mt-1 text-xs text-muted-foreground">{Math.round(component.weight * 100)}% weight · {component.score === null ? "Missing" : `${Math.round(component.score)}/100 component score`}</div>
    </div>)}</div></section>}
    {!!player.college?.seasons.length && <section className="mt-3"><h3 className="mb-2 font-semibold">College production</h3>
      <Table><TableHeader><TableRow>{["Season", "School", "Games", "Rec", "Rec yds", "Rec TD", "Carries", "Rush yds", "Rush TD", "Pass att", "Pass yds", "Pass TD", "INT"].map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{player.college.seasons.map(s => <TableRow key={s.year}><TableCell><a href={s.sourceUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4">{s.year}</a></TableCell><TableCell>{s.school}</TableCell>{[s.games, s.receptions, s.receivingYards, s.receivingTD, s.carries, s.rushingYards, s.rushingTD, s.attempts, s.passingYards, s.passingTD, s.interceptions].map((v, i) => <TableCell key={i}>{num(v, 0)}</TableCell>)}</TableRow>)}</TableBody>
      </Table>
    </section>}
  </>;
}

function SyncProspects({ leagueId }: { leagueId: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  return <div><Button variant="outline" size="sm" disabled={pending} onClick={() => start(async () => {
    try { const result = await syncProspectsAction(leagueId); setMessage(result.message); }
    catch { setMessage("Sync failed. Saved production is unchanged."); }
  })}><RefreshCw className={pending ? "animate-spin" : ""} />{pending ? "Syncing ESPN…" : "Sync ESPN"}</Button>{message && <p role="status" className="mt-2 max-w-xs text-xs">{message}</p>}</div>;
}

function ModelNotes({ status }: { status: CollegeSyncResult | null }) {
  return <Dialog><DialogTrigger asChild><Button variant="ghost" size="sm">Model</Button></DialogTrigger><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl" aria-describedby={undefined}>
    <DialogHeader><DialogTitle>{COLLEGE_MODEL_VERSION}</DialogTitle></DialogHeader>
    <h3 className="font-semibold">Draft-aware grades</h3>
    <p className="text-sm">Actual NFL picks are used only in post-draft grades. Future classes use the imported projection at half the learned weight; that uncertainty discount is a heuristic, not validated on archived projections. Unknown projections leave the college score unchanged. Switch to College-only grade to exclude both inputs.</p>
    <Table><TableHeader><TableRow><TableHead>Position</TableHead><TableHead>Actual / projected weight</TableHead><TableHead>College ρ</TableHead><TableHead>Blended ρ</TableHead><TableHead>Pick-only ρ</TableHead></TableRow></TableHeader><TableBody>{DRAFT_CALIBRATION.results.map(r => <TableRow key={r.position}><TableCell>{r.position}</TableCell><TableCell>{r.weight * 100}% / {r.weight * 50}%</TableCell><TableCell>{num(r.baseline.rho, 3)}</TableCell><TableCell>{num(r.adjusted.rho, 3)}</TableCell><TableCell>{num(r.draftOnly.rho, 3)}</TableCell></TableRow>)}</TableBody></Table>
    <p className="text-sm">Weights selected using 2016–2018 training and 2019–2020 validation. Reported correlations use first-three-season NFL PPR for reused 2021–2023 evaluation classes. These are post-draft results, not pre-draft predictions. Pick alone outperforms the WR blend on this evaluation; the blend was chosen on validation. Projection performance has not been backtested. Draft score falls along fixed pick anchors; projected rounds average their approximate pick range.</p>
    <p className="text-sm">An independent college production index. Bakery supplies advanced college metrics, the class list and comparison ranks; its overall grades, projected times and NFL finishes do not enter the score. Draft-aware mode uses actual NFL picks for completed classes or imported projected ranges for future prospects. Draft classes remain projections.</p>
    <h3 className="font-semibold">Advanced analytics</h3>
    <p className="text-sm">Receivers: yards and targets per route, uncontested targets per route, yards after catch, drops. Backs: missed tackles forced, yards after contact and receiving involvement. Quarterbacks: adjusted completions, big-time throws and turnover-worthy plays. Separation is a target-based proxy, not measured distance from defenders.</p>
    <Table><TableHeader><TableRow><TableHead>Position</TableHead><TableHead>Coverage</TableHead><TableHead>Ranking weight</TableHead><TableHead>Evaluation ρ</TableHead></TableRow></TableHeader><TableBody>{ADVANCED_CALIBRATION.results.map(r => <TableRow key={r.position}><TableCell>{r.position}</TableCell><TableCell>{r.coverage}/{r.total}</TableCell><TableCell>{Math.round(r.weight * 100)}%</TableCell><TableCell>{num(r.baseline.rho, 3)} → {num(r.adjusted.rho, 3)}</TableCell></TableRow>)}</TableBody></Table>
    <p className="text-sm">Tested 0/15/30/45% advanced blends using 2016–2018 training and 2019–2020 validation. TE passed both samples at 15%; its remaining 85% comes from competition-adjusted production. QB, RB and WR retain their production weights. The TE blend uses yards/route 40%, targets/route 20%, uncontested targets/route 20%, yards after catch 10% and drop rate 10%. Evaluation reuses 2021–2023 classes. Historical provider snapshots lack archived pre-draft timestamps and route sample sizes, so this is exploratory retrospective analysis, not proven predictive improvement.</p>
    <Table><TableHeader><TableRow><TableHead>Position</TableHead><TableHead>Inputs and weights</TableHead></TableRow></TableHeader><TableBody>
      {(["WR", "TE"] as const).map(position => <TableRow key={position}><TableCell>{position}</TableCell><TableCell className="whitespace-normal">{["Receiving yard share", "yards/game", "catches/game", "yards/catch"].map((label, i) => `${label} ${Math.round(COLLEGE_CALIBRATION.weights[position][i] * 100)}%`).join(" · ")}</TableCell></TableRow>)}
      <TableRow><TableCell>RB</TableCell><TableCell className="whitespace-normal">{["Scrimmage yards/game", "receiving yards/game", "yards/carry", "team rush share"].map((label, i) => `${label} ${Math.round(COLLEGE_CALIBRATION.weights.RB[i] * 100)}%`).join(" · ")}</TableCell></TableRow>
      <TableRow><TableCell>QB</TableCell><TableCell className="whitespace-normal">Adjusted yards/attempt 45% · completion rate 20% · rush yards/game 20% · pass yards/game 15%.</TableCell></TableRow>
    </TableBody></Table>
    <p className="text-sm">Latest three qualifying seasons: 55/30/15 weighting; two seasons: 65/35. Small samples regress toward 35. A season needs three games and ten touches (30 attempts for QBs). A newer season below that minimum lowers confidence to Low. Missing inputs lower evidence coverage; no qualifying production means no score.</p>
    <p className="text-sm">Competition uses each season’s actual opponents. Team ratings come from opponent-adjusted scoring margins, with a 28-point margin cap, three-point home advantage, and shrinkage toward average. Schedule strength is centered on the 3.5-point reference from unique training team-seasons. Each opponent-rating point above or below that reference contributes four score points, capped at ±25 and reduced for small samples. Missing schedules receive no adjustment and lower confidence. Transfers use their school in each season.</p>
    <p className="text-sm">1QB subtracts eight points from QB scores; Superflex uses the unadjusted score. These format adjustments and cross-position rankings are not calibrated. The college-only index excludes draft capital; the draft-aware grade blends it afterward. Neither adjusts for injuries or blocking. Compare within positions first.</p>
    <h3 className="font-semibold">Stronger competition · 2021–2023 evaluation</h3>
    <Table><TableHeader><TableRow><TableHead>Metric</TableHead><TableHead>Previous</TableHead><TableHead>Current</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell>Rank correlation</TableCell><TableCell>{num(COMPETITION_STRENGTH.baselineRho, 3)}</TableCell><TableCell>{num(COMPETITION_STRENGTH.adjustedRho, 3)}</TableCell></TableRow><TableRow><TableCell>Top-five NDCG</TableCell><TableCell>{num(COMPETITION_STRENGTH.baselineNdcg, 3)}</TableCell><TableCell>{num(COMPETITION_STRENGTH.adjustedNdcg, 3)}</TableCell></TableRow></TableBody></Table>
    <p className="text-sm">The competition coefficient increases from 16 to 40. Selected using training rank correlation and 2019–2020 validation; advanced weights remain fixed. Across 229 players in reused evaluation classes, correlation improves but top-five ordering declines slightly. This is an exploratory tradeoff, not a demonstrated improvement on an untouched test set. Advanced-blend results above describe the previous competition setting.</p>
    <h3 className="font-semibold">Prior competition evaluation · {COMPETITION_CALIBRATION.testYear}</h3>
    <Table><TableHeader><TableRow><TableHead>Metric</TableHead><TableHead>Production only</TableHead><TableHead>With competition</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell>Rank correlation</TableCell><TableCell>{num(COMPETITION_CALIBRATION.baselineRho, 3)}</TableCell><TableCell>{num(COMPETITION_CALIBRATION.adjustedRho, 3)}</TableCell></TableRow><TableRow><TableCell>Top-five NDCG</TableCell><TableCell>{num(COMPETITION_CALIBRATION.baselineNdcg, 3)}</TableCell><TableCell>{num(COMPETITION_CALIBRATION.adjustedNdcg, 3)}</TableCell></TableRow></TableBody></Table>
    <p className="text-sm">{COMPETITION_CALIBRATION.testN} players; first-three-season NFL PPR. Coefficient selected on 2016–2020 classes, then checked on 2023. Results average positions equally; some positions worsen. The rank-correlation gain’s 95% interval is {COMPETITION_CALIBRATION.gain95Interval.map(v => v.toFixed(3)).join(" to ")}. This class was inspected during data corrections and used as a deployment check, so the small gain is tentative.</p>
    <details className="space-y-3"><summary className="cursor-pointer font-semibold">Original weight backtest · v1.1</summary>
    <p className="text-sm">{COLLEGE_CALIBRATION.backtest.usable}/{COLLEGE_CALIBRATION.backtest.total} drafted players with usable data. First-three-season NFL PPR production. Train: 2016–2018. Validate: 2019–2020. Test: 2021–2022. College features stop before the draft; zero NFL production stays in the sample.</p>
    <Table><TableHeader><TableRow><TableHead>Position</TableHead><TableHead>Test n</TableHead><TableHead>Original ρ</TableHead><TableHead>Candidate ρ</TableHead><TableHead>Decision</TableHead></TableRow></TableHeader><TableBody>{COLLEGE_CALIBRATION.backtest.results.map(result => <TableRow key={result.position}><TableCell>{result.position}</TableCell><TableCell>{result.n}</TableCell><TableCell>{num(result.baselineRho, 3)}</TableCell><TableCell>{num(result.candidateRho, 3)}</TableCell><TableCell>{result.promoted ? "Updated" : "Retained"}</TableCell></TableRow>)}</TableBody></Table>
    <p className="text-sm">ρ measures within-class rank correlation with NFL production; higher is better. Updated weights must also preserve or improve top-five ordering. The observed improvement has a 95% bootstrap interval spanning zero, so it is tentative. The test was used as a deployment gate, not to tune weights. Undrafted players and missing college records are excluded; injury and opportunity affect outcomes.</p>
    </details>
    {status && <details className="text-sm"><summary className="cursor-pointer">Sync · {status.updated}/{status.total} updated · {status.syncedAt.slice(0, 10)}</summary><p className="mt-2">{status.unmatched.length} unmatched · {status.errors.length} source errors. Previous successful records remain available.</p>{status.unmatched.length > 0 && <p className="mt-2">Unmatched: {status.unmatched.join(", ")}</p>}{status.errors.length > 0 && <ul className="mt-2 space-y-2">{status.errors.map((error, i) => <li key={i}>{error}</li>)}</ul>}</details>}
  </DialogContent></Dialog>;
}

function ProspectImport({ leagueId }: { leagueId: string }) {
  const [state, action, pending] = useActionState(importProspectsAction.bind(null, leagueId), { ok: true, message: "" });
  return <Dialog><DialogTrigger asChild><Button variant="outline" size="sm"><Upload />Import prospects</Button></DialogTrigger>
    <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl" aria-describedby={undefined}><DialogHeader><DialogTitle>Import prospects</DialogTitle></DialogHeader>
      <Button asChild variant="ghost" className="justify-self-start"><a download="prospects-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(PROSPECT_TEMPLATE)}`}><Download />CSV template</a></Button>
      <form action={action} className="space-y-4">
        <Input type="file" name="file" accept=".csv,text/csv" aria-label="Prospect CSV file" />
        <Textarea name="text" aria-label="Prospect CSV text" placeholder={PROSPECT_TEMPLATE} rows={6} className="h-40 min-w-0 resize-none field-sizing-fixed font-mono text-xs" />
        <Button type="submit" disabled={pending}>{pending ? "Importing…" : "Import"}</Button>
        {state.message && <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-sm" : "text-sm text-destructive"}>{state.message}</p>}
      </form>
    </DialogContent>
  </Dialog>;
}








