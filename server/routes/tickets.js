// server/routes/tickets.js - Tickets
// Mounted in app.js behind requireAuth.
//
// GET /mine    The logged-in customer's own tickets (customerId comes from the session)

import express from "express";
import { requireRole, asyncHandler } from "../middleware/auth.js";
import { getDB } from "../config/db.js";
import TicketModel from "../models/tickets.js";
import RulesModel from "../models/rules.js";
import { ValidationError, cleanText } from "../utils/validators.js";
import TicketCommentModel from "../models/ticketComments.js";

const router = express.Router();

router.get(
  "/mine",
  requireRole("customer"),
  asyncHandler(async (req, res) => {
    const data = await new TicketModel(getDB()).findByCustomer(
      req.tenantId,
      req.user.customerId
    );
    res.json({ success: true, data });
  })
);

//Get the tickets assigned to the logged-in agent (must stay above /:ticketId)
router.get(
  "/assigned",
  requireRole("agent"),
  asyncHandler(async (req, res) => {
    const data = await new TicketModel(getDB()).findByAgent(
      req.tenantId,
      req.user.id
    );
    res.json({ success: true, data });
  })
);

//Get a specific ticket: a customer's own, or any ticket in the company for staff
router.get(
  "/:ticketId",
  requireRole("customer", "agent", "superior"),
  asyncHandler(async (req, res) => {
    const ticket = await findAccessibleTicket(req, getDB());
    res.json({ success: true, data: ticket });
  })
);

//put a new ticket into the database
router.post(
  "/",
  requireRole("customer"),
  asyncHandler(async (req, res) => {
    //check that customer is logged in
    if(req.user.customerId==null) {
      throw new ValidationError("Please exit and log in again", 403);
    }
    const description = cleanText(req.body.description, "Description", {min:5, max:1000});
    const category = cleanText(req.body.category, "Category");
    const db = getDB();
    const categories = await new RulesModel(db).getCategories(req.tenantId);
    if(!categories.includes(category)) {
      throw new ValidationError("Please select a category that you need help with");
    }

    const ticket = await new TicketModel(db).create({
      tenantId: req.tenantId,
      customerId: req.user.customerId,
      description,
      category,
    })
    res.status(201).json({success: true, data: ticket});
  })
);

// Finds the ticket the logged-in user is allowed to see, or throws a 404.
// Customers only get their own tickets; staff get any ticket in their company.
async function findAccessibleTicket(req, db) {
  const tickets = new TicketModel(db);
  const ticket =
    req.user.role === "customer"
      ? await tickets.findTicketForCustomer(
          req.user.customerId,
          req.params.ticketId,
          req.tenantId
        )
      : await tickets.findTicketInTenant(req.tenantId, req.params.ticketId);
  if (!ticket) throw new ValidationError("Ticket not found", 404);
  return ticket;
}

//Get the comments on a ticket, oldest first
router.get(
  "/:ticketId/comments",
  requireRole("customer", "agent", "superior"),
  asyncHandler(async (req, res) => {
    const db = getDB();
    const ticket = await findAccessibleTicket(req, db);
    const comments = await new TicketCommentModel(db).findByTicket(
      req.tenantId,
      ticket.ticketId,
      { includeInternal: req.user.role !== "customer" } // customers never see internal notes
    );
    res.json({ success: true, data: comments });
  })
);

//Add a comment to a ticket
router.post(
  "/:ticketId/comments",
  requireRole("customer", "agent", "superior"),
  asyncHandler(async (req, res) => {
    const db = getDB();
    const ticket = await findAccessibleTicket(req, db);
    const comment = await new TicketCommentModel(db).createComment({
      tenantId: req.tenantId,
      ticketId: ticket.ticketId,
      authorId: req.user.id,
      authorRole: req.user.role,
      body: req.body.body,
      // Only staff can post internal notes; a customer's value is ignored
      isInternal: req.user.role !== "customer" && req.body.isInternal === true,
    });
    res.status(201).json({ success: true, data: comment });
  })
);

//A customer closes their own ticket and says why
router.post(
  "/:ticketId/close",
  requireRole("customer"),
  asyncHandler(async (req, res) => {
    const db = getDB();
    const ticket = await findAccessibleTicket(req, db);
    const alreadyClosed = new ValidationError("This ticket is already closed", 409);
    if (["Completed", "Closed"].includes(ticket.status)) throw alreadyClosed;

    const closed = await new TicketModel(db).closeTicket(
      req.tenantId,
      req.user.customerId,
      ticket.ticketId,
      req.body.reason
    );
    if (!closed) throw alreadyClosed;
    res.json({ success: true, data: { ticketId: ticket.ticketId, status: "Closed" } });
  })
);

//An agent marks a ticket as completed
router.post(
  "/:ticketId/complete",
  requireRole("agent", "superior"),
  asyncHandler(async (req, res) => {
    const db = getDB();
    const ticket = await findAccessibleTicket(req, db);
    const alreadyDone = new ValidationError("This ticket is already completed", 409);
    if (["Completed", "Closed"].includes(ticket.status)) throw alreadyDone;

    const completed = await new TicketModel(db).completeTicket(
      req.tenantId,
      ticket.ticketId
    );
    if (!completed) throw alreadyDone;
    res.json({ success: true, data: { ticketId: ticket.ticketId, status: "Completed" } });
  })
);

export default router;
