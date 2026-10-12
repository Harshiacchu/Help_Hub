// server/routes/admin.js - Dashboard, analytics and CSV export
// Mounted in index.js behind requireAuth + requireRole('superior').
// (SLA targets live with the other company rules: /api/v1/rules/sla-targets)
//
// GET /dashboard
// GET /analytics?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&priority=1-5&category=Billing
// GET /analytics/export   (same filters, downloads CSV)

import express from "express";
import { getDB } from "../config/db.js";
import { asyncHandler } from "../middleware/auth.js";
import AnalyticsController from "../controllers/analyticsController.js";

const router = express.Router();

function analyticsFilters(query) {
  return {
    startDate: query.startDate,
    endDate: query.endDate,
    priority: query.priority,
    category: query.category,
  };
}

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
  "/analytics/export",
  asyncHandler(async (req, res) => {
    const { csv, rowCount, truncated } = await new AnalyticsController(
      getDB()
    ).exportTicketsCsv(req.tenantId, analyticsFilters(req.query));

    const date = new Date().toISOString().slice(0, 10);
    res.set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="helphub-tickets-${date}.csv"`,
      "X-Row-Count": String(rowCount),
      "X-Truncated": String(truncated),
    });
    res.send("\uFEFF" + csv); // BOM so Excel reads UTF-8 correctly
  })
);

router.get(
  "/analytics",
  asyncHandler(async (req, res) => {
    const data = await new AnalyticsController(getDB()).getAnalytics(
      req.tenantId,
      analyticsFilters(req.query)
    );
    res.json({ success: true, data });
  })
);

export default router;
