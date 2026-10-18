// server/routes/email.js - Tickets that arrive by email
//
// An email service (for example Mailgun or SendGrid inbound routing) receives
// mail sent to a company's support address and forwards each email here:
//
//   POST /api/v1/email/inbound
//   X-Inbound-Secret: <INBOUND_EMAIL_SECRET from .env>
//   { "from": "Ava Anderson <ava.anderson.1@customer.example>",
//     "to": "support@acme.example",
//     "subject": "Charged twice",
//     "text": "Hi, I was charged twice for my order." }
//
// 1. The "to" address picks the company: the one whose support email it is.
// 2. The "from" address links the ticket to that company's customer with the
//    same email, so it also shows on their dashboard.
// 3. The ticket then gets AI triage and an agent, like every other ticket.

import crypto from "node:crypto";
import express from "express";
import { asyncHandler } from "../middleware/auth.js";
import { getDB } from "../config/db.js";
import TenantModel from "../models/tenant.js";
import UserModel from "../models/user.js";
import { openTicket } from "../services/tickets.js";
import { ValidationError } from "../utils/validators.js";

const router = express.Router();

// "Ava <ava@x.com>, support@acme.example" -> ["ava@x.com", "support@acme.example"]
function emailAddresses(value) {
  const list = Array.isArray(value) ? value.join(",") : String(value || "");
  return [...list.matchAll(/<([^>]+)>|([^\s<>,;]+@[^\s<>,;]+)/g)].map((m) =>
    (m[1] || m[2]).trim().toLowerCase()
  );
}

// Only the email service knows the secret (compared in constant time)
function checkSecret(req) {
  const secret = process.env.INBOUND_EMAIL_SECRET;
  if (!secret) {
    throw new ValidationError(
      "Email tickets are not set up on this server",
      503
    );
  }
  const given = Buffer.from(String(req.get("x-inbound-secret") || ""));
  const expected = Buffer.from(secret);
  if (
    given.length !== expected.length ||
    !crypto.timingSafeEqual(given, expected)
  ) {
    throw new ValidationError("Not authorized", 401);
  }
}

router.post(
  "/inbound",
  asyncHandler(async (req, res) => {
    checkSecret(req);
    const db = getDB();

    // 1. Which company? The one whose support email the message was sent to
    const tenants = new TenantModel(db);
    let tenant = null;
    for (const address of emailAddresses(req.body.to)) {
      tenant = await tenants.findBySupportEmail(address);
      if (tenant) break;
    }
    if (!tenant) {
      throw new ValidationError("No company uses that support address", 404);
    }

    // 2. Who sent it? Link it to the company's customer with that email, if any
    const [fromEmail] = emailAddresses(req.body.from);
    if (!fromEmail) {
      throw new ValidationError("The email has no sender address");
    }
    const sender = await new UserModel(db).findByEmailWithPassword(
      tenant._id,
      fromEmail
    );
    const customerId =
      sender && sender.role === "customer" && sender.status === "active"
        ? sender.customerId
        : null;

    // The subject and body become the ticket's description
    const subject = String(req.body.subject || "").trim();
    const text = String(req.body.text || "").trim();
    const description = [subject, text]
      .filter(Boolean)
      .join(" - ")
      .slice(0, 1000);
    if (description.length < 5) {
      throw new ValidationError("The email is empty");
    }

    // 3. AI triage and agent assignment, the same as every other ticket
    const ticket = await openTicket(db, {
      tenantId: tenant._id,
      customerId,
      description,
      source: "email",
      fromEmail,
    });
    res.status(201).json({
      success: true,
      data: {
        company: tenant.slug,
        ticketId: ticket.ticketId,
        category: ticket.category,
        priority: ticket.priority,
        assignedToAgent: Boolean(ticket.agentId),
        linkedToCustomer: customerId !== null,
      },
    });
  })
);

export default router;
