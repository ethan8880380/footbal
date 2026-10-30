import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MonoLabel } from "@/components/viz/readout";
import { DEFENSE_CALIBRATION, isDefensePosition } from "@/lib/domain/defense-model";
import type { CollegeBoardRow } from "@/lib/domain/college-model";

const num = (value: number | null | undefined, digits = 0) => value == null ? "—" : value.toFixed(digits);

/** Defenders: draft capital and the college production behind the scouting score. */
export function DefenseProfile({ player }: { player: CollegeBoardRow }) {
  const seasons = (player.college?.seasons ?? []).filter(s => s.defense).toSorted((a, b) => b.year - a.year);
  const result = isDefensePosition(player.position) ? DEFENSE_CALIBRATION.results.find(r => r.position === player.position) : undefined;
  const scouted = player.model.score !== null;
  return <>
    <section><h3 className="mb-3"><MonoLabel>Draft capital</MonoLabel></h3>{player.draft
      ? <dl className="grid grid-cols-3 gap-4"><div><dt><MonoLabel>{player.draft.kind}</MonoLabel></dt><dd className="mt-1 font-mono text-xl">{player.draft.label}</dd></div><div><dt><MonoLabel>Weight</MonoLabel></dt><dd className="mt-1 font-mono text-xl">{Math.round((scouted ? player.draft.weight : 1) * 100)}%</dd></div><div><dt><MonoLabel>Scouting score</MonoLabel></dt><dd className="mt-1 font-mono text-xl">{num(player.model.score, 1)}</dd></div></dl>
      : <p className="text-sm">No pick or projection yet. This score uses college production only.</p>}</section>
    <section><h3 className="mb-3"><MonoLabel>College production</MonoLabel></h3>{seasons.length
      ? <Table><TableHeader><TableRow><TableHead>Season</TableHead><TableHead className="text-right">Games</TableHead><TableHead className="text-right">Tackles</TableHead><TableHead className="text-right">Solo</TableHead><TableHead className="text-right">Sacks</TableHead><TableHead className="text-right">FF</TableHead><TableHead className="text-right">INT</TableHead><TableHead className="text-right">PD</TableHead></TableRow></TableHeader>
        <TableBody>{seasons.map(s => <TableRow key={s.year}><TableCell>{s.year}</TableCell><TableCell className="text-right font-mono">{num(s.games)}</TableCell><TableCell className="text-right font-mono">{num(s.defense!.tackles)}</TableCell><TableCell className="text-right font-mono">{num(s.defense!.solo)}</TableCell><TableCell className="text-right font-mono">{num(s.defense!.sacks, 1)}</TableCell><TableCell className="text-right font-mono">{num(s.defense!.forcedFumbles)}</TableCell><TableCell className="text-right font-mono">{num(s.defense!.interceptions)}</TableCell><TableCell className="text-right font-mono">{num(s.defense!.passesDefended)}</TableCell></TableRow>)}</TableBody></Table>
      : <p className="text-sm">No college defensive statistics.</p>}</section>
    {result && <p className="text-sm">{scouted ? `College production alone ranks ${player.position} outcomes at ρ ${num(result.scoutRho, 2)}` : `College production does not rank ${player.position} outcomes (ρ ${num(result.scoutRho, 2)}), so only draft capital scores them`}; with draft capital ρ {num(result.blendRho, 2)}, classes held out.</p>}
  </>;
}
