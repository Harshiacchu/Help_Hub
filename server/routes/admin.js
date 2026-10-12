// server/routes/admin.js - Dashboard, analytics, CSV export, SLA targets
// Mounted in index.js behind requireAuth + requireRole('superior').
//
// GET /dashboard
// GET /analytics?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&priority=1-5&category=Billing
// GET /analytics/export   (same filters, downloads CSV)
// GET /sla
// PUT /sla                { critical, high, medium, low, minimal }  (hours, 1-168)

const express = require("express");
const { getDB } = require("../config/db");
const { asyncHandler } = require("../middleware/auth");
const AnalyticsController = require("../controllers/analyticsController");
const RulesModel = require("../models/rules");

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

// Registered before "/analytics" for readability; paths are distinct either way
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

router.get(
  "/sla",
  asyncHandler(async (req, res) => {
    const data = await new RulesModel(getDB()).getSlaTargets(req.tenantId);
    res.json({ success: true, data });
  })
);

router.put(
  "/sla",
  asyncHandler(async (req, res) => {
    const data = await new RulesModel(getDB()).setSlaTargets(
      req.tenantId,
      req.body,
      req.user.id
    );
    res.json({ success: true, data, message: "SLA targets updated" });
  })
);

module.exports = router;
