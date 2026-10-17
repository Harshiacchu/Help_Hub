// server/scripts/seed.js - Demo data for the dashboard, video and grading
//
// Creates 3 demo companies with 1,500+ users, default rules, invite codes and
// an API key each (over 1,000 records in total).
// Run: npm run seed
// Safe to re-run: it only deletes and recreates the three *-demo companies.

import "dotenv/config";
import bcrypt from "bcryptjs";

import { connectDB, getDB, closeDB } from "../config/db.js";
import TenantModel from "../models/tenant.js";
import UserModel from "../models/user.js";
import RulesModel from "../models/rules.js";
import ApiKeyModel from "../models/apiKey.js";
import { savePromptFiles } from "../services/prompts.js";

const DEMO_PASSWORD = "Password123";

const COMPANIES = [
  {
    name: "Acme Corp",
    slug: "acme-demo",
    domain: "acme.example",
    agents: 8,
    customers: 500,
    categories: ["Billing", "Technical Support", "Shipping", "Returns"],
  },
  {
    name: "Globex Inc",
    slug: "globex-demo",
    domain: "globex.example",
    agents: 6,
    customers: 500,
    categories: ["Account Access", "Bug Report", "Feature Request"],
  },
  {
    name: "Initech",
    slug: "initech-demo",
    domain: "initech.example",
    agents: 5,
    customers: 500,
    categories: ["Hardware", "Software", "Network", "General"],
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
    ["users", "rules", "apikeys", "shareCodes"].map((name) =>
      db.collection(name).deleteMany(byTenant)
    )
  );
  await db.collection("tenants").deleteOne({ _id: tenant._id });
}

async function seedCompany(db, company, passwordHash) {
  const tenantModel = new TenantModel(db);
  const rulesModel = new RulesModel(db);
  const apiKeyModel = new ApiKeyModel(db);

  const tenant = await tenantModel.create({
    name: company.name,
    slug: company.slug,
    supportEmailAlias: `support@${company.domain}`,
  });
  await rulesModel.initializeDefaults(tenant._id);
  await rulesModel.setCategories(tenant._id, company.categories);

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
    // customerId 1..N matches the customerId values in data/Mock_Tickets_1.json
    users.push(user("customer", full, email, i + 1));
  }
  // One round trip for all users instead of 500+ separate inserts
  await db.collection("users").insertMany(users, { ordered: false });

  await tenantModel.createShareCode(tenant._id, "agent");
  await tenantModel.createShareCode(tenant._id, "customer");
  const { key } = await apiKeyModel.create(tenant._id, "Order System");

  return { users: users.length, apiKey: key };
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

  // Store each demo company's prompt file (server/prompts/<slug>.md) in its record
  const prompts = await savePromptFiles(db);

  const counts = {};
  for (const name of ["tenants", "users", "rules", "apikeys", "shareCodes"]) {
    counts[name] = await db.collection(name).countDocuments();
  }
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  console.log("\nSeed complete. Records per collection:", counts);
  console.log(`Total records in these collections: ${total}\n`);
  console.log(
    `AI prompts stored for: ${
      prompts
        .filter((p) => p.saved)
        .map((p) => p.slug)
        .join(", ") || "none"
    }`
  );
  console.log(`Demo logins (password for every demo user: ${DEMO_PASSWORD})`);
  for (const { company, users, apiKey } of results) {
    console.log(
      `  ${company.name}: organization "${company.slug}", admin@${company.domain} (${users} users)`
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
