// server/services/triage.js - AI ticket triage (Groq)
//
// Shared by every company. Each company's prompt is stored in its record
// (tenants.triagePrompt, loaded from server/prompts/<company-slug>.md by
// `npm run prompts`); companies without one use server/prompts/default.md.
// The AI only chooses from that company's own categories and priority labels.
//
// .env:
//   GROQ_API_KEY=...   (from console.groq.com)
//   GROQ_MODEL=...     (any Groq chat model)
// Without them, tickets are still created, using the default category/priority.
//
// Ticket creation (Emily) - one call:
//   import { triageTicket } from "../services/triage.js";
//   const result = await triageTicket(getDB(), { tenantId: req.tenantId, title, description });
//   ticket.category = result.category;
//   ticket.priority = result.priority;
//   ticket.slaDueAt = result.slaDueAt;
//   ticket.triage = result.triage; // { source, suggestedPriority, needsReview, reason, model }
//
// The AI suggests, the rules decide:
//   - the category must be one of the company's categories, otherwise the default
//   - the priority must be a whole number 1-5, otherwise 3
//   - the AI can never apply priority 1 on its own: it applies 2 and sets needsReview
//   - any failure (not configured, timeout, bad reply) falls back to the defaults

import TenantModel from "../models/tenant.js";
import RulesModel from "../models/rules.js";
import { readDefaultPrompt } from "./prompts.js";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const TIMEOUT_MS = 8000;
const DEFAULT_PRIORITY = 3;
const MOST_URGENT = 1;
const HOUR_MS = 60 * 60 * 1000;
const MAX_TITLE = 200;
const MAX_DESCRIPTION = 4000;
const MAX_REASON = 300;

function isAiConfigured() {
  return Boolean(process.env.GROQ_API_KEY && process.env.GROQ_MODEL);
}

function clip(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Case-insensitive match against the company's categories; null if no match. */
function matchCategory(value, categories) {
  if (typeof value !== "string") return null;
  const wanted = value.trim().toLowerCase();
  return categories.find((c) => c.toLowerCase() === wanted) || null;
}

async function loadCompanyContext(db, tenantId) {
  const rules = new RulesModel(db);
  const [categories, labels, tenant] = await Promise.all([
    rules.getCategories(tenantId),
    rules.getPriorityLabels(tenantId),
    new TenantModel(db).findById(tenantId),
  ]);
  return {
    rules,
    categories,
    labels,
    prompt: (tenant && tenant.triagePrompt) || null,
    companyName: tenant ? tenant.name : "the company",
    defaultCategory: matchCategory("General", categories) || categories[0],
  };
}

function buildMessages(context, instructions, title, description) {
  const system = [
    `You triage customer support tickets for ${context.companyName}.`,
    "Instructions:",
    instructions || "(none)",
    "Allowed categories - use one exactly as written:",
    ...context.categories.map((c) => `- ${c}`),
    "Priority levels - 1 is the most urgent:",
    ...[1, 2, 3, 4, 5].map((level) => `${level} = ${context.labels[level]}`),
    'Reply with only a JSON object: {"category": "<allowed category>", "priority": <1-5>, "reason": "<one short sentence>"}',
  ].join("\n");

  const user = `Title: ${clip(title, MAX_TITLE)}\nDescription: ${clip(description, MAX_DESCRIPTION)}`;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

async function postToGroq(body, signal) {
  return fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });
}

async function groqErrorMessage(response) {
  const data = await response.json().catch(() => ({}));
  const detail = data && data.error && data.error.message;
  return `Groq API error (HTTP ${response.status})${detail ? `: ${detail}` : ""}`;
}

/** Returns the model's reply text. One shared timeout covers both attempts. */
async function callGroq(messages) {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const body = {
    model: process.env.GROQ_MODEL,
    messages,
    temperature: 0,
    max_completion_tokens: 1024,
    response_format: { type: "json_object" },
  };

  let response = await postToGroq(body, signal);
  if (response.status === 400) {
    // Some models don't support JSON mode - retry once without it
    delete body.response_format;
    response = await postToGroq(body, signal);
  }
  if (!response.ok) throw new Error(await groqErrorMessage(response));

  const data = await response.json();
  return (
    (data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content) ||
    ""
  );
}

/** Pulls the JSON object out of a reply, ignoring any <think> reasoning around it. */
function parseReply(content) {
  const text = String(content).replace(/<think>[\s\S]*?<\/think>/gi, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("AI reply did not contain a JSON object");
  }
  return JSON.parse(text.slice(start, end + 1));
}

/** Turns the raw reply into values the rules allow. */
function applyGuardrails(raw, context) {
  const category = matchCategory(raw.category, context.categories);
  const suggested = Number(raw.priority);
  const validPriority =
    Number.isInteger(suggested) && suggested >= 1 && suggested <= 5;
  const priority = validPriority
    ? Math.max(suggested, MOST_URGENT + 1)
    : DEFAULT_PRIORITY;

  return {
    category: category || context.defaultCategory,
    priority,
    suggestedPriority: validPriority ? suggested : null,
    needsReview: !category || !validPriority || suggested === MOST_URGENT,
    reason: clip(raw.reason, MAX_REASON) || null,
  };
}

/**
 * For ticket creation. Never throws because of the AI: if AI is not
 * configured or fails, the ticket gets the default category and priority
 * and is flagged for an agent to review.
 * `category` (optional) - a valid category the person already chose is kept.
 */
async function triageTicket(
  db,
  { tenantId, title, description, category, createdAt = new Date() }
) {
  const context = await loadCompanyContext(db, tenantId);
  const chosenCategory = matchCategory(category, context.categories);

  let result = {
    category: chosenCategory || context.defaultCategory,
    priority: DEFAULT_PRIORITY,
    suggestedPriority: null,
    needsReview: true,
    reason: null,
  };
  let source = "default";

  if (isAiConfigured()) {
    try {
      const prompt = context.prompt || (await readDefaultPrompt());
      const reply = parseReply(
        await callGroq(buildMessages(context, prompt, title, description))
      );
      result = applyGuardrails(reply, context);
      if (chosenCategory) result.category = chosenCategory;
      source = "ai";
    } catch (error) {
      console.warn(`AI triage failed, using defaults: ${error.message}`);
    }
  }

  const slaHours = await context.rules.getSlaHoursForPriority(
    tenantId,
    result.priority
  );
  return {
    category: result.category,
    priority: result.priority,
    slaHours,
    slaDueAt: new Date(createdAt.getTime() + slaHours * HOUR_MS),
    triage: {
      source,
      suggestedPriority: result.suggestedPriority,
      needsReview: result.needsReview,
      reason: result.reason,
      model: source === "ai" ? process.env.GROQ_MODEL : null,
    },
  };
}

export { triageTicket };
