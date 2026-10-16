// server/services/triage.js - AI ticket triage (Groq)
//
// Same code for every company. All of a company's rules - its categories, what
// each priority means and the SLA hours for each priority - are written in its
// prompt file (the company record stores only the file name; see prompts.js).
// Companies without a file use server/prompts/default.md.
//
// .env: GROQ_API_KEY and GROQ_MODEL. Without them, or if the AI fails, tickets
// get the defaults: category "General", priority 3 and an 8-hour SLA.
//
// Ticket creation (Emily):
//   import { triageTicket } from "../services/triage.js";
//   const result = await triageTicket(getDB(), { tenantId: req.tenantId, title, description });
//   ticket.category = result.category;
//   ticket.priority = result.priority; // 1 (most urgent) to 5
//   ticket.slaDueAt = result.slaDueAt;
//   ticket.triage = result.triage; // { source: "ai" | "default", reason }

import TenantModel from "../models/tenant.js";
import { readPrompt } from "./prompts.js";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_CATEGORY = "General";
const DEFAULT_PRIORITY = 3;
// Used when the AI gives no valid SLA: hours for priorities 1 to 5
const DEFAULT_SLA_HOURS = { 1: 2, 2: 4, 3: 8, 4: 24, 5: 48 };

/** Asks Groq to apply the company's rules: { category, priority, slaHours, reason }. */
async function askGroq(tenant, rules, title, description) {
  const instructions = [
    `You triage customer support tickets for ${tenant.name}. Follow the company's rules:`,
    rules,
    'Reply with only JSON: {"category": "<category from the rules>", "priority": <1-5, 1 is the most urgent>, "slaHours": <hours from the rules for that priority>, "reason": "<one short sentence>"}',
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
  let category = DEFAULT_CATEGORY;
  let priority = DEFAULT_PRIORITY;
  let slaHours = DEFAULT_SLA_HOURS[DEFAULT_PRIORITY];
  let reason = null;
  let source = "default";

  if (process.env.GROQ_API_KEY && process.env.GROQ_MODEL) {
    try {
      const tenant = await new TenantModel(db).findById(tenantId);
      const rules = await readPrompt(tenant.promptFile);
      const reply = await askGroq(tenant, rules, title, description);

      if (typeof reply.category === "string" && reply.category.trim()) {
        category = reply.category.trim().slice(0, 50);
      }
      if ([1, 2, 3, 4, 5].includes(Number(reply.priority))) {
        priority = Number(reply.priority);
      }
      const hours = Number(reply.slaHours);
      slaHours =
        Number.isInteger(hours) && hours >= 1 && hours <= 168
          ? hours
          : DEFAULT_SLA_HOURS[priority];
      reason = reply.reason || null;
      source = "ai";
    } catch (error) {
      console.warn(`AI triage failed, using defaults: ${error.message}`);
    }
  }

  return {
    category,
    priority,
    slaDueAt: new Date(createdAt.getTime() + slaHours * HOUR_MS),
    triage: { source, reason },
  };
}

export { triageTicket };
