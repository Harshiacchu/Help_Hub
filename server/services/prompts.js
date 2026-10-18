// server/services/prompts.js - Company AI prompts
//
// Each company has its own prompt file in server/prompts/ (e.g. acme-demo.md)
// holding its rules: its categories and the priority labels it uses.
// The company's record stores only the file name
// (tenants.promptFile). `npm run prompts` links every <company-slug>.md file
// to that company. Companies without a file use server/prompts/default.md.
//
// Paths start from process.cwd() - the project folder both locally (npm
// scripts) and on Vercel - which lets Vercel's bundler see that the files in
// server/prompts/ are needed at runtime.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import TenantModel from "../models/tenant.js";

const DEFAULT_FILE = "default.md";

/** The text of a prompt file in server/prompts/ (default.md if it is missing). */
async function readPrompt(fileName) {
  const name = /^[a-z0-9-]+\.md$/.test(fileName || "")
    ? fileName
    : DEFAULT_FILE;
  try {
    return await readFile(
      path.join(process.cwd(), "server", "prompts", name),
      "utf8"
    );
  } catch {
    if (name === DEFAULT_FILE) return "";
    console.warn(`Prompt file ${name} not found - using ${DEFAULT_FILE}`);
    return readPrompt(DEFAULT_FILE);
  }
}

/** Links every prompts/<slug>.md file to the company with that slug. */
async function linkPromptFiles(db) {
  const tenants = new TenantModel(db);
  const files = (
    await readdir(path.join(process.cwd(), "server", "prompts"))
  ).filter((file) => file.endsWith(".md") && file !== DEFAULT_FILE);

  const results = [];
  for (const file of files) {
    const slug = file.slice(0, -".md".length);
    results.push({
      slug,
      file,
      linked: await tenants.setPromptFile(slug, file),
    });
  }
  return results;
}

export { readPrompt, linkPromptFiles };
