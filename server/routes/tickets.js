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

//Get a specific ticket belonging to a customer
router.get(
  "/:ticketId",
  requireRole("customer"),
  asyncHandler(async (req, res) => {
    const ticket = await new TicketModel(getDB()).findTicketForCustomer(
      req.user.customerId,
      req.params.ticketId,
      req.tenantId
    );
    if (!ticket) {
      throw new ValidationError("Ticket not found", 404);
    }
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

export default router;
