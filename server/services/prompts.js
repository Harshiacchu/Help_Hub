// server/services/prompts.js - Company AI prompts
//
// Each company's prompt is written in its own file, server/prompts/<company-slug>.md,
// using the instructions the company gives us. `npm run prompts` stores every
// file in that company's record (tenants.triagePrompt); triage reads it from there.
// server/prompts/default.md is used for companies without a prompt of their own.

import { readdir, readFile } from "node:fs/promises";
import TenantModel from "../models/tenant.js";

const PROMPTS_DIR = new URL("../prompts/", import.meta.url);
const DEFAULT_FILE = "default.md";

async function readDefaultPrompt() {
  try {
    // A fixed path, so Vercel includes default.md when it bundles the app
    return await readFile(
      new URL("../prompts/default.md", import.meta.url),
      "utf8"
    );
  } catch {
    return "";
  }
}

/** Saves every prompts/<slug>.md into the matching company's record. */
async function savePromptFiles(db) {
  const tenants = new TenantModel(db);
  const files = (await readdir(PROMPTS_DIR)).filter(
    (file) => file.endsWith(".md") && file !== DEFAULT_FILE
  );

  const results = [];
  for (const file of files) {
    const slug = file.slice(0, -".md".length);
    const prompt = (await readFile(new URL(file, PROMPTS_DIR), "utf8")).trim();
    results.push({ slug, saved: await tenants.setTriagePrompt(slug, prompt) });
  }
  return results;
}

export { readDefaultPrompt, savePromptFiles };
