import { syncCollegeProduction } from "../src/lib/services/college-service";

syncCollegeProduction(process.argv.includes("--force"), console.log).then(result => {
  console.log(JSON.stringify(result, null, 2));
}).catch(error => { console.error(error); process.exitCode = 1; });
