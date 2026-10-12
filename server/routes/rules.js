// server/routes/rules.js - Company configuration
// Mounted in index.js behind requireAuth. Everyone in the tenant can READ the
// rules (ticket forms need categories and priorities); only superiors can change them.
//
// GET /                   { priorities, categories, slaTargets, customFields }
// PUT /priorities         { "1": "Critical", "2": "High", "3": "Medium", "4": "Low", "5": "Minimal" }
// PUT /categories         { categories: ["Billing", "Technical Support"] }
// PUT /sla-targets        { critical: 2, high: 4, medium: 8, low: 24, minimal: 48 }
// PUT /custom-fields      { customFields: [{ key, label, type, required, options }] }

import express from "express";
import { getDB } from "../config/db.js";
import { requireRole, asyncHandler } from "../middleware/auth.js";
import RulesModel from "../models/rules.js";

const router = express.Router();
const superiorOnly = requireRole("superior");

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const data = await new RulesModel(getDB()).getAll(req.tenantId);
    res.json({ success: true, data });
  })
);

router.put(
  "/priorities",
  superiorOnly,
  asyncHandler(async (req, res) => {
    const data = await new RulesModel(getDB()).setPriorityLabels(
      req.tenantId,
      req.body,
      req.user.id
    );
    res.json({ success: true, data, message: "Priority labels updated" });
  })
);

router.put(
  "/categories",
  superiorOnly,
  asyncHandler(async (req, res) => {
    const data = await new RulesModel(getDB()).setCategories(
      req.tenantId,
      req.body.categories,
      req.user.id
    );
    res.json({ success: true, data, message: "Categories updated" });
  })
);

router.put(
  "/sla-targets",
  superiorOnly,
  asyncHandler(async (req, res) => {
    const data = await new RulesModel(getDB()).setSlaTargets(
      req.tenantId,
      req.body,
      req.user.id
    );
    res.json({ success: true, data, message: "SLA targets updated" });
  })
);

router.put(
  "/custom-fields",
  superiorOnly,
  asyncHandler(async (req, res) => {
    const data = await new RulesModel(getDB()).setCustomFields(
      req.tenantId,
      req.body.customFields,
      req.user.id
    );
    res.json({ success: true, data, message: "Custom fields updated" });
  })
);

export default router;
