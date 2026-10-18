// server/scripts/seed.js - Demo data for the dashboard, video and grading
//
// Creates 2 demo companies - Acme Corp (an online store) and Cascade Health
// Insurance - each with an admin, agents, 500 customers, their tickets, a first
// agent reply on every ticket that has been worked on, invite codes and an API
// key (thousands of records in total). Each company's AI rules are in its
// prompt file: server/prompts/acme-demo.md and server/prompts/cascade-health-demo.md
// Safe to re-run: it only deletes and recreates the demo companies.
// Run: npm run seed

import "dotenv/config";
import bcrypt from "bcryptjs";

import { connectDB, getDB, closeDB } from "../config/db.js";
import TenantModel from "../models/tenant.js";
import UserModel from "../models/user.js";
import ApiKeyModel from "../models/apiKey.js";
import TicketModel from "../models/tickets.js";
import TicketCommentModel from "../models/ticketComments.js";
import { linkPromptFiles } from "../services/prompts.js";

const DEMO_PASSWORD = "Password123";

const STATUSES = ["Opened", "InProgress", "Completed", "Closed"];
const DONE_STATUSES = ["Completed", "Closed"];
const REPLIES = [
  "Thanks for reaching out - I'm looking into this now.",
  "Sorry about that! I've started working on your ticket.",
  "Thanks for the details. I'll update you shortly.",
];
const MAX_TICKETS_PER_CUSTOMER = 5;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const pick = (list) => list[Math.floor(Math.random() * list.length)];

// Categories and priorities match each company's prompt file
const COMPANIES = [
  {
    name: "Acme Corp",
    slug: "acme-demo",
    domain: "acme.example",
    agents: 8,
    customers: 500,
    categories: ["Billing", "Technical Support", "Shipping", "Returns"],
    priorities: ["High", "Medium", "Low"],
    descriptions: [
      "I was charged twice this month.",
      "The checkout page shows an error when I pay.",
      "I can't log in to my account.",
      "The app freezes when I open several tabs.",
      "I need a copy of my receipt.",
      "My order hasn't arrived yet.",
      "The jacket I received is the wrong size.",
    ],
  },
  {
    name: "Cascade Health Insurance",
    slug: "cascade-health-demo",
    domain: "cascadehealth.example",
    agents: 6,
    customers: 500,
    categories: [
      "Claims",
      "Prior Authorization",
      "Billing & Premiums",
      "Enrollment & Eligibility",
      "Coverage & Benefits",
      "Provider Network",
      "Pharmacy & Prescriptions",
      "ID Cards",
      "Appeals & Grievances",
      "Account Access",
    ],
    priorities: [
      "Urgent Care Access",
      "Time-Sensitive",
      "Standard",
      "Low",
      "General Inquiry",
    ],
    descriptions: [
      "My claim for last month's MRI was denied.",
      "I need prior authorization for my knee surgery next week.",
      "The pharmacy says my prescription isn't covered.",
      "I haven't received my new member ID card.",
      "Is Dr. Patel at Riverside Clinic in your network?",
      "I was billed twice for this month's premium.",
      "I can't log in to the member portal.",
      "How do I appeal a coverage decision?",
    ],
  },
];

const FIRST_NAMES = [
  "Ava",
  "Ben",
  "Chloe",
  "Daniel",
  "Ella",
  "Felix",
  "Grace",
  "Hugo",
  "Isla",
  "Jack",
  "Kara",
  "Liam",
  "Maya",
  "Noah",
  "Olivia",
  "Priya",
  "Quinn",
  "Ravi",
  "Sofia",
  "Theo",
  "Uma",
  "Victor",
  "Wen",
  "Yara",
  "Zane",
];
const LAST_NAMES = [
  "Anderson",
  "Brooks",
  "Chen",
  "Diaz",
  "Evans",
  "Fischer",
  "Garcia",
  "Huang",
  "Ito",
  "Johnson",
  "Khan",
  "Lopez",
  "Miller",
  "Nguyen",
  "Okafor",
  "Patel",
  "Rossi",
  "Singh",
  "Tanaka",
  "Walker",
];

function demoName(index) {
  const first = FIRST_NAMES[index % FIRST_NAMES.length];
  const last =
    LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length];
  return { first, last, full: `${first} ${last}` };
}

/** Removes a previous run of one demo company and everything that belongs to it. */
async function removeDemoCompany(db, slug) {
  const tenant = await db.collection("tenants").findOne({ slug });
  if (!tenant) return;
  const byTenant = { tenantId: tenant._id };
  await Promise.all(
    ["users", "apikeys", "shareCodes", "tickets", "ticketComments"].map(
      (name) => db.collection(name).deleteMany(byTenant)
    )
  );
  await db.collection("tenants").deleteOne({ _id: tenant._id });
}

//Create tickets
function buildTickets(tenantId, company, users) {
  const agentIds = users.filter((u) => u.role === "agent").map((u) => u._id);
  const customers = users.filter((u) => u.role === "customer");
  const tickets = [];
  let ticketId = 1;

  for (const customer of customers) {
    const count = Math.floor(Math.random() * (MAX_TICKETS_PER_CUSTOMER + 1));
    for (let i = 0; i < count; i++) {
      const status = pick(STATUSES);
      const openedAt = new Date(
        Date.now() - (4 + Math.random() * 176) * DAY_MS
      );
      const closedAt = DONE_STATUSES.includes(status)
        ? new Date(openedAt.getTime() + (1 + Math.random() * 71) * HOUR_MS)
        : null;

      tickets.push(
        TicketModel.newDocument({
          tenantId,
          customerId: customer.customerId,
          ticketId: ticketId++,
          agentId: pick(agentIds),
          status,
          priority: pick(company.priorities),
          category: pick(company.categories),
          description: pick(company.descriptions),
          openedAt,
          closedAt,
        })
      );
    }
  }
  return tickets;
}

// The agent's first reply on each ticket that has been worked on
// (gives the dashboard real response times)
function buildFirstReplies(tenantId, tickets) {
  return tickets
    .filter((t) => t.status !== "Opened")
    .map((t) => {
      const latest = t.closedAt ? t.closedAt - t.openedAt : 24 * HOUR_MS;
      const delay = Math.random() * Math.min(latest, 24 * HOUR_MS) * 0.9;
      return TicketCommentModel.newDocument({
        tenantId,
        ticketId: t.ticketId,
        authorId: t.agentId,
        authorRole: "agent",
        body: pick(REPLIES),
        createdAt: new Date(t.openedAt.getTime() + delay),
      });
    });
}

async function seedCompany(db, company, passwordHash) {
  const tenantModel = new TenantModel(db);
  const apiKeyModel = new ApiKeyModel(db);

  const tenant = await tenantModel.create({
    name: company.name,
    slug: company.slug,
    supportEmailAlias: `support@${company.domain}`,
  });

  const user = (role, name, email, customerId = null) =>
    UserModel.newDocument({
      tenantId: tenant._id,
      email,
      passwordHash,
      name,
      role,
      customerId,
    });

  const users = [user("superior", "Demo Admin", `admin@${company.domain}`)];
  for (let i = 0; i < company.agents; i++) {
    const { full, first } = demoName(i * 7);
    users.push(
      user(
        "agent",
        full,
        `${first.toLowerCase()}.agent${i + 1}@${company.domain}`
      )
    );
  }
  for (let i = 0; i < company.customers; i++) {
    const { full, first, last } = demoName(i);
    const email = `${first}.${last}.${i + 1}@customer.example`.toLowerCase();
    // customerId 1..N links each demo customer to their tickets
    users.push(user("customer", full, email, i + 1));
  }
  // One round trip for all users instead of 500+ separate inserts
  await db.collection("users").insertMany(users, { ordered: false });

  const tickets = buildTickets(tenant._id, company, users);
  await new TicketModel(db).insertMany(tickets);
  await new TicketCommentModel(db).insertMany(
    buildFirstReplies(tenant._id, tickets)
  );

  await tenantModel.createShareCode(tenant._id, "agent");
  await tenantModel.createShareCode(tenant._id, "customer");
  const { key } = await apiKeyModel.create(tenant._id, "Order System");

  return { users: users.length, tickets: tickets.length, apiKey: key };
}

async function seed() {
  await connectDB();
  const db = getDB();
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10); // same password for every demo user

  const results = [];
  for (const company of COMPANIES) {
    await removeDemoCompany(db, company.slug);
    results.push({
      company,
      ...(await seedCompany(db, company, passwordHash)),
    });
  }

  // Link each demo company to its prompt file (server/prompts/<slug>.md)
  const prompts = await linkPromptFiles(db);

  const counts = {};
  for (const name of [
    "tenants",
    "users",
    "apikeys",
    "shareCodes",
    "tickets",
    "ticketComments",
  ]) {
    counts[name] = await db.collection(name).countDocuments();
  }
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  console.log("\nSeed complete. Records per collection:", counts);
  console.log(`Total records in these collections: ${total}\n`);
  console.log(
    `AI prompt files linked for: ${
      prompts
        .filter((p) => p.linked)
        .map((p) => p.slug)
        .join(", ") || "none"
    }`
  );
  console.log(`Demo logins (password for every demo user: ${DEMO_PASSWORD})`);
  for (const { company, users, tickets, apiKey } of results) {
    console.log(
      `  ${company.name}: organization "${company.slug}", admin@${company.domain} (${users} users, ${tickets} tickets)`
    );
    console.log(`    API key for testing ticket creation: ${apiKey}`);
  }
}

seed()
  .catch((error) => {
    console.error("Seed failed:", error.message);
    process.exitCode = 1;
  })
  .finally(closeDB);
