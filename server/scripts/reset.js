// server/scripts/reset.js - Empties the HelpHub database (every collection)
// Run: npm run reset   (empties the database, then runs the seed)
// Warning: this deletes ALL data in the database named in .env - including
// companies registered through the app - not just the demo companies.

import "dotenv/config";
import { connectDB, getDB, closeDB } from "../config/db.js";

async function reset() {
  await connectDB();
  const db = getDB();
  const collections = (
    await db.listCollections({}, { nameOnly: true }).toArray()
  ).filter(({ name }) => !name.startsWith("system."));

  for (const { name } of collections) {
    await db.collection(name).drop();
    console.log(`  dropped ${name}`);
  }
  console.log(
    `Database "${db.databaseName}" is now empty (${collections.length} collections removed).`
  );
}

reset()
  .catch((error) => {
    console.error("Reset failed:", error.message);
    process.exitCode = 1;
  })
  .finally(closeDB);
