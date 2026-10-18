// server/services/triage.js - AI ticket triage (Groq)
//
// Same code for every company. Each company's prompt file (server/prompts/,
// linked by `npm run prompts`) holds its rules: its categories and the
// priority labels it uses, e.g. "Low / Medium / High" or "Urgent Care Access".
// Companies without their own file use server/prompts/default.md.
//
// .env: GROQ_API_KEY and GROQ_MODEL. Without them, or if the AI fails, tickets
// get category "General" and priority "Medium".
//
// Used by POST /api/v1/tickets:
//   const { category, priority } = await triageTicket(db, { tenantId, description });

import TenantModel from "../models/tenant.js";
import { readPrompt } from "./prompts.js";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_CATEGORY = "General";
const DEFAULT_PRIORITY = "Medium";

// A usable label from the AI's reply, or null
const label = (value) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, 50) : null;

/** Asks Groq to apply the company's rules: { category, priority }. */
async function askGroq(tenant, rules, description) {
  const instructions = [
    `You triage customer support tickets for ${tenant.name}. Follow the company's rules:`,
    rules,
    'Reply with only JSON: {"category": "<a category from the rules>", "priority": "<a priority from the rules>"}',
  ].join("\n");

  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: `Ticket: ${description}` },
      ],
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Groq returned HTTP ${response.status}`);
  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}

/** Chooses a ticket's category and priority from the company's prompt. Never throws. */
async function triageTicket(db, { tenantId, description }) {
  let category = DEFAULT_CATEGORY;
  let priority = DEFAULT_PRIORITY;

  if (process.env.GROQ_API_KEY && process.env.GROQ_MODEL) {
    try {
      const tenant = await new TenantModel(db).findById(tenantId);
      const rules = await readPrompt(tenant.promptFile);
      const reply = await askGroq(tenant, rules, description);
      category = label(reply.category) || category;
      priority = label(reply.priority) || priority;
    } catch (error) {
      console.warn(`AI triage failed, using defaults: ${error.message}`);
    }
  }
  return { category, priority };
}

export { triageTicket };
