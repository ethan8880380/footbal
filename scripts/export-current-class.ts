import { writeFile } from "node:fs/promises";
import { getCollegeProspects } from "@/lib/db/repositories/prospect-repository";
import { getAppState } from "@/lib/db/repositories/settings-repository";
import { getCollegeProduction } from "@/lib/services/college-service";

// Snapshots the locally imported class so deployments with an empty database still show it.
async function main() {
  const prospects = await getCollegeProspects();
  const production = await getCollegeProduction();
  const advanced = ((await getAppState("college-advanced:v1")) ?? []) as unknown[];
  await writeFile("src/lib/data/current-class.json", JSON.stringify({ exportedAt: new Date().toISOString(), prospects, production, advanced }));
  console.log(`Exported ${prospects.length} prospects, ${production.length} production rows, ${advanced.length} analytics rows`);
}
main();
