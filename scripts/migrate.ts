import { getDb } from "../src/lib/db/client";

async function main() {
  await getDb();
  console.log(`Database ready at ${process.env.DATABASE_URL ?? "file:./data/dynasty-desk.db"}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
