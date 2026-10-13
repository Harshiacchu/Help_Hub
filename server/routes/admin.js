// server/routes/admin.js - Dashboard, analytics and CSV export
// Mounted in index.js behind requireAuth + requireRole('superior').
//
// GET /dashboard
// GET /analytics?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&priority=1-5&category=Billing
// GET /analytics/export   (same filters, downloads a CSV file)

import express from "express";
import { getDB } from "../config/db.js";
import { asyncHandler } from "../middleware/auth.js";
import AnalyticsController from "../controllers/analyticsController.js";

const router = express.Router();

const filters = (query) => ({
  startDate: query.startDate,
  endDate: query.endDate,
  priority: query.priority,
  category: query.category,
});

router.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const data = await new AnalyticsController(getDB()).getDashboardMetrics(
      req.tenantId
    );
    res.json({ success: true, data });
  })
);

router.get(
  "/analytics",
  asyncHandler(async (req, res) => {
    const data = await new AnalyticsController(getDB()).getAnalytics(
      req.tenantId,
      filters(req.query)
    );
    res.json({ success: true, data });
  })
);

router.get(
  "/analytics/export",
  asyncHandler(async (req, res) => {
    const csv = await new AnalyticsController(getDB()).exportTicketsCsv(
      req.tenantId,
      filters(req.query)
    );
    res.set({
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="helphub-tickets.csv"',
    });
    res.send(csv);
  })
);

export default router;
