import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getLeagueBundle } from "@/lib/db/repositories/league-repository";
import { getCollegeProspects } from "@/lib/db/repositories/prospect-repository";
import { TableSkeleton } from "@/components/page-states";
import { ProspectBoard } from "@/components/prospects/prospect-board";
import { getCollegeProduction, getCollegeSyncStatus } from "@/lib/services/college-service";
import historical from "@/lib/data/historical-prospects.json";
import defense from "@/lib/data/defense-prospects.json";
import snapshot from "@/lib/data/current-class.json";
import bakeryGrades from "@/lib/data/bakery-grades.json";
import { bakeryGradeSchema } from "@/lib/domain/bakery-grades";
import { prospectSchema } from "@/lib/domain/prospects";
import { collegePlayerSchema } from "@/lib/domain/college-model";
import { getAppState } from "@/lib/db/repositories/settings-repository";
import { advancedProspectSchema } from "@/lib/domain/advanced-prospects";

export const metadata: Metadata = { title: "Prospect analysis" };
export default function ProspectsPage({ params }: PageProps<"/leagues/[leagueId]/prospects">) {
  return <Suspense fallback={<TableSkeleton />}><Prospects params={params} /></Suspense>;
}
async function Prospects({ params }: Pick<PageProps<"/leagues/[leagueId]/prospects">, "params">) {
  await connection();
  const { leagueId } = await params;
  const bundle = leagueId === "demo" ? null : await getLeagueBundle(leagueId);
  if (leagueId !== "demo" && !bundle) notFound();
  const [storedRows, storedProduction, syncStatus, storedAnalytics] = await Promise.all([getCollegeProspects(), getCollegeProduction(), getCollegeSyncStatus(), getAppState("college-advanced:v1")]);
  // Fresh deployments have an empty database; fall back to the bundled snapshot of the current class.
  const rows = storedRows.length ? storedRows : prospectSchema.array().parse(snapshot.prospects);
  const production = storedRows.length ? storedProduction : collegePlayerSchema.array().parse(snapshot.production);
  const entries = [...historical.entries, ...defense.entries, ...defense.current.map(entry => ({ ...entry, history: undefined }))];
  const history = Object.fromEntries(entries.flatMap(entry => entry.history ? [[entry.prospect.id, entry.history] as const] : []));
  const analytics = advancedProspectSchema.array().parse(storedAnalytics ?? (storedRows.length ? [] : snapshot.advanced));
  return <ProspectBoard grades={bakeryGradeSchema.array().parse(bakeryGrades)} analytics={analytics} rows={[...rows.filter(row => !history[row.id]), ...entries.map(entry => prospectSchema.parse(entry.prospect))]} production={[...production.filter(row => !history[row.prospectId]), ...entries.map(entry => collegePlayerSchema.parse(entry.college))]} history={history} syncStatus={syncStatus} leagueId={leagueId} defaultYear={new Date().getFullYear() + 1} />;
}

