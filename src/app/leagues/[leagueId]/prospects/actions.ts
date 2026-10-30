"use server";

import { refresh } from "next/cache";
import type { ActionState } from "@/app/actions";
import { parseProspectCsv } from "@/lib/providers/prospect-csv";
import { saveCollegeProspects } from "@/lib/db/repositories/prospect-repository";
import { getLeagueBundle } from "@/lib/db/repositories/league-repository";
import { syncCollegeProduction } from "@/lib/services/college-service";

export async function syncProspectsAction(leagueId: string): Promise<ActionState> {
  if (leagueId !== "demo" && !await getLeagueBundle(leagueId)) return { ok: false, message: "League not found." };
  try {
    const result = await syncCollegeProduction();
    refresh();
    return { ok: result.updated > 0, message: `Updated ${result.updated}/${result.total}. ${result.unmatched.length} unmatched; ${result.errors.length} source errors.` };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "College sync failed. Saved data is unchanged." }; }
}

export async function importProspectsAction(leagueId: string, _: ActionState, form: FormData): Promise<ActionState> {
  if (leagueId !== "demo" && !await getLeagueBundle(leagueId)) return { ok: false, message: "League not found." };
  const file = form.get("file");
  if (file instanceof File && file.size > 900_000) return { ok: false, message: "CSV must be smaller than 900 KB." };
  const text = file instanceof File && file.size ? await file.text() : String(form.get("text") ?? "");
  if (text.length > 900_000) return { ok: false, message: "CSV must be smaller than 900 KB." };
  const result = parseProspectCsv(text);
  if (result.errors.length) return { ok: false, message: result.errors.slice(0, 3).join(" ") };
  try {
    await saveCollegeProspects(result.rows);
  } catch {
    return { ok: false, message: "Could not save prospects. Try again." };
  }
  refresh();
  return { ok: true, message: `Saved ${result.rows.length} prospects across all leagues.` };
}
