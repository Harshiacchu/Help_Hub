// server/routes/tickets.js - Tickets
// Mounted in app.js behind requireAuth.
//
// GET /mine    The logged-in customer's own tickets (customerId comes from the session)

import express from "express";
import { requireRole, asyncHandler } from "../middleware/auth.js";
import TicketModel from "../models/tickets.js";

const router = express.Router();

router.get(
  "/mine",
  requireRole("customer"),
  asyncHandler(async (req, res) => {
    const data = await new TicketModel().findByCustomer(req.user.customerId);
    res.json({ success: true, data });
  })
);

export default router;
