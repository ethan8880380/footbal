import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

async function main() {
  const { listLeagues } = await import("../src/lib/db/repositories/league-repository");
  const { refreshLeague } = await import("../src/lib/services/sync-service");
  const force = process.argv.includes("--force");
  const leagues = await listLeagues();
  if (leagues.length === 0) console.log("No leagues connected yet. Connect one in the app first.");

  for (const league of leagues) {
    console.log(`Syncing ${league.name} (${league.leagueId})...`);
    const { steps, historyJob } = await refreshLeague(league.leagueId, { force });
    for (const step of steps) console.log(`  ${step.status.padEnd(11)} ${step.scope}:${step.key}${step.message ? ` — ${step.message}` : ""}`);
    if (historyJob) console.log(`  fetched value history for ${await historyJob()} players`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
