// server/scripts/load-prompts.js - Links each company's prompt file to its record
// Run after adding a new server/prompts/<company-slug>.md file:
//   npm run prompts
// (Editing an existing file needs no command: the file is read for every ticket.)

import "dotenv/config";
import { connectDB, getDB, closeDB } from "../config/db.js";
import { linkPromptFiles } from "../services/prompts.js";

async function main() {
  await connectDB();
  const results = await linkPromptFiles(getDB());
  if (results.length === 0) {
    console.log("No company prompt files found in server/prompts/");
  }
  for (const { slug, file, linked } of results) {
    console.log(
      linked
        ? `  linked   ${slug} -> ${file}`
        : `  skipped  ${file} (no company with the slug "${slug}")`
    );
  }
}

main()
  .catch((error) => {
    console.error("Linking prompts failed:", error.message);
    process.exitCode = 1;
  })
  .finally(closeDB);
