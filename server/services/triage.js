// server/services/triage.js - AI ticket triage (Groq)
//
// Same code for every company. Each company's prompt is stored in its record
// (loaded from server/prompts/<company-slug>.md by `npm run prompts`);
// companies without one use server/prompts/default.md. The AI picks a category
// and priority from that company's own lists; anything else gets the defaults.
//
// .env: GROQ_API_KEY and GROQ_MODEL. Without them, tickets get the defaults.
//
// Ticket creation (Emily):
//   import { triageTicket } from "../services/triage.js";
//   const result = await triageTicket(getDB(), { tenantId: req.tenantId, title, description });
//   ticket.category = result.category;
//   ticket.priority = result.priority;
//   ticket.slaDueAt = result.slaDueAt;
//   ticket.triage = result.triage; // { source: "ai" | "default", reason }

import TenantModel from "../models/tenant.js";
import RulesModel from "../models/rules.js";
import { readDefaultPrompt } from "./prompts.js";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_PRIORITY = 3;
const HOUR_MS = 60 * 60 * 1000;

/** Asks Groq for { category, priority, reason }. */
async function askGroq(tenant, prompt, categories, labels, title, description) {
  const instructions = [
    `You triage customer support tickets for ${tenant.name}.`,
    prompt,
    `Categories: ${categories.join(", ")}`,
    `Priorities (1 is the most urgent): ${[1, 2, 3, 4, 5]
      .map((level) => `${level} = ${labels[level]}`)
      .join(", ")}`,
    'Reply with only JSON: {"category": "<one of the categories>", "priority": <1-5>, "reason": "<one short sentence>"}',
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
        {
          role: "user",
          content: `Title: ${title}\nDescription: ${description}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Groq returned HTTP ${response.status}`);
  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}

async function triageTicket(
  db,
  { tenantId, title, description, createdAt = new Date() }
) {
  const rules = new RulesModel(db);
  const [tenant, categories, labels] = await Promise.all([
    new TenantModel(db).findById(tenantId),
    rules.getCategories(tenantId),
    rules.getPriorityLabels(tenantId),
  ]);

  let category = categories.includes("General") ? "General" : categories[0];
  let priority = DEFAULT_PRIORITY;
  let reason = null;
  let source = "default";

  if (process.env.GROQ_API_KEY && process.env.GROQ_MODEL) {
    try {
      const prompt = tenant.triagePrompt || (await readDefaultPrompt());
      const reply = await askGroq(
        tenant,
        prompt,
        categories,
        labels,
        title,
        description
      );
      if (categories.includes(reply.category)) category = reply.category;
      if ([1, 2, 3, 4, 5].includes(Number(reply.priority))) {
        priority = Number(reply.priority);
      }
      reason = reply.reason || null;
      source = "ai";
    } catch (error) {
      console.warn(`AI triage failed, using defaults: ${error.message}`);
    }
  }

  const slaHours = await rules.getSlaHoursForPriority(tenantId, priority);
  return {
    category,
    priority,
    slaDueAt: new Date(createdAt.getTime() + slaHours * HOUR_MS),
    triage: { source, reason },
  };
}

export { triageTicket };
