// server/services/tickets.js - Opens a ticket the same way for every channel
//
// The customer portal ("web"), other systems with an API key ("api") and email
// ("email") all create tickets through openTicket:
//   1. The AI reads the company's prompt file to pick the category and priority.
//   2. The ticket goes to the active agent with the fewest unfinished tickets.
//   3. The ticket is saved with its channel, so agents see where it came from.

import TicketModel from "../models/tickets.js";
import UserModel from "../models/user.js";
import { triageTicket } from "./triage.js";

// The active agent with the fewest unfinished tickets (null if there are none)
async function pickAgent(db, tenantId) {
  const agents = (
    await new UserModel(db).findByTenantAndRole(tenantId, ["agent"])
  ).filter((agent) => agent.status === "active");
  if (agents.length === 0) return null;
  const load = await new TicketModel(db).countOpenByAgent(tenantId);
  const lightest = agents.reduce((best, agent) =>
    (load[agent.userId] || 0) < (load[best.userId] || 0) ? agent : best
  );
  return lightest.userId;
}

/** Creates a ticket from any channel: "web", "api" or "email". */
async function openTicket(
  db,
  { tenantId, customerId = null, description, source, fromEmail = null }
) {
  const { category, priority } = await triageTicket(db, {
    tenantId,
    description,
  });
  const agentId = await pickAgent(db, tenantId);
  return new TicketModel(db).create({
    tenantId,
    customerId,
    agentId,
    description,
    category,
    priority,
    source,
    fromEmail,
  });
}

export { openTicket };
