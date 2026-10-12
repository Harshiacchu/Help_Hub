// server/scripts/load-prompts.js - Stores each company's prompt file in its record
// Run after adding or editing server/prompts/<company-slug>.md:
//   npm run prompts

import "dotenv/config";
import { connectDB, getDB, closeDB } from "../config/db.js";
import { savePromptFiles } from "../services/prompts.js";

async function main() {
  await connectDB();
  const results = await savePromptFiles(getDB());
  if (results.length === 0) {
    console.log("No company prompt files found in server/prompts/");
  }
  for (const { slug, saved } of results) {
    console.log(
      saved
        ? `  saved    ${slug}`
        : `  skipped  ${slug} (no company with this slug)`
    );
  }
}

main()
  .catch((error) => {
    console.error("Loading prompts failed:", error.message);
    process.exitCode = 1;
  })
  .finally(closeDB);
