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
  const [rows, production, syncStatus] = await Promise.all([getCollegeProspects(), getCollegeProduction(), getCollegeSyncStatus()]);
  const history = Object.fromEntries(historical.entries.map(entry => [entry.prospect.id, entry.history]));
  const analytics = advancedProspectSchema.array().parse(await getAppState("college-advanced:v1") ?? []);
  return <ProspectBoard analytics={analytics} rows={[...rows.filter(row => !history[row.id]), ...historical.entries.map(entry => prospectSchema.parse(entry.prospect))]} production={[...production.filter(row => !history[row.prospectId]), ...historical.entries.map(entry => collegePlayerSchema.parse(entry.college))]} history={history} syncStatus={syncStatus} leagueId={leagueId} defaultYear={new Date().getFullYear() + 1} />;
}

