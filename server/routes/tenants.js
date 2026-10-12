// server/routes/tenants.js - Tenant details, invites and team management
// Mounted in index.js behind requireAuth, so req.user / req.tenantId always exist.
//
// Specific paths are registered BEFORE "/:tenantId", otherwise Express would
// treat "share-codes" or "agents" as a tenant id.
//
// POST   /share-codes                       superior   create invite code { role }
// GET    /share-codes                       superior   list unused codes
// DELETE /share-codes/:code                 superior   cancel an unused code
// GET    /agents                            superior   list team (agents + superiors)
// POST   /agents/:agentId/deactivate        superior
// POST   /agents/:agentId/reactivate        superior
// GET    /:tenantId                         any role   (own tenant only)
// PUT    /:tenantId                         superior   { name, supportEmailAlias }

const express = require("express");
const { getDB } = require("../config/db");
const { requireRole, asyncHandler } = require("../middleware/auth");
const TenantModel = require("../models/tenant");
const UserModel = require("../models/user");
const {
  ROLES,
  STAFF_ROLES,
  ValidationError,
  assertRole,
  assertEmail,
  cleanText,
} = require("../utils/validators");

const router = express.Router();
const superiorOnly = requireRole("superior");

// ============================================
// SHARE CODES
// ============================================

router.post(
  "/share-codes",
  superiorOnly,
  asyncHandler(async (req, res) => {
    const role = assertRole(req.body.role || "agent", ROLES);
    const shareCode = await new TenantModel(getDB()).createShareCode(
      req.tenantId,
      role,
      req.user.id
    );
    res.status(201).json({ success: true, data: shareCode });
  })
);

router.get(
  "/share-codes",
  superiorOnly,
  asyncHandler(async (req, res) => {
    const codes = await new TenantModel(getDB()).listActiveShareCodes(
      req.tenantId
    );
    res.json({ success: true, data: codes });
  })
);

router.delete(
  "/share-codes/:code",
  superiorOnly,
  asyncHandler(async (req, res) => {
    const removed = await new TenantModel(getDB()).revokeShareCode(
      req.tenantId,
      req.params.code
    );
    if (!removed)
      return res.status(404).json({
        success: false,
        error: "Share code not found or already used",
      });
    res.json({ success: true, message: "Share code cancelled" });
  })
);

// ============================================
// TEAM (agents + superiors)
// ============================================

router.get(
  "/agents",
  superiorOnly,
  asyncHandler(async (req, res) => {
    const team = await new UserModel(getDB()).findByTenantAndRole(
      req.tenantId,
      STAFF_ROLES
    );
    res.json({ success: true, data: team });
  })
);

async function setMemberStatus(req, res, status) {
  if (req.params.agentId === req.user.id) {
    throw new ValidationError(
      "You cannot change the status of your own account"
    );
  }

  const userModel = new UserModel(getDB());
  const target = await userModel.findById(req.tenantId, req.params.agentId);
  if (!target || target.status === "deleted") {
    return res.status(404).json({ success: false, error: "User not found" });
  }

  const updated = await userModel.updateStatus(
    req.tenantId,
    target.userId,
    status
  );
  if (status === "inactive") {
    await userModel.revokeSessions(req.tenantId, target.userId); // sign them out everywhere
  }
  res.json({ success: true, data: updated });
}

router.post(
  "/agents/:agentId/deactivate",
  superiorOnly,
  asyncHandler((req, res) => setMemberStatus(req, res, "inactive"))
);
router.post(
  "/agents/:agentId/reactivate",
  superiorOnly,
  asyncHandler((req, res) => setMemberStatus(req, res, "active"))
);

// ============================================
// TENANT DETAILS (parameterized - keep last)
// ============================================

function assertOwnTenant(req) {
  if (req.params.tenantId !== req.tenantId) {
    // 404 rather than 403, so ids of other companies aren't confirmed to exist
    const error = new ValidationError("Organization not found", 404);
    throw error;
  }
}

router.get(
  "/:tenantId",
  asyncHandler(async (req, res) => {
    assertOwnTenant(req);
    const tenant = await new TenantModel(getDB()).findById(req.tenantId);
    if (!tenant)
      return res
        .status(404)
        .json({ success: false, error: "Organization not found" });
    res.json({ success: true, data: TenantModel.toPublic(tenant) });
  })
);

router.put(
  "/:tenantId",
  superiorOnly,
  asyncHandler(async (req, res) => {
    assertOwnTenant(req);

    const updates = {};
    if (req.body.name !== undefined)
      updates.name = cleanText(req.body.name, "Company name", {
        min: 2,
        max: 100,
      });
    if (req.body.supportEmailAlias !== undefined)
      updates.supportEmailAlias = assertEmail(
        req.body.supportEmailAlias,
        "Support email"
      );
    if (req.body.slaTargets !== undefined) {
      throw new ValidationError(
        "Update SLA targets with PUT /api/v1/rules/sla-targets"
      );
    }
    if (Object.keys(updates).length === 0) {
      throw new ValidationError(
        "Nothing to update. Send name and/or supportEmailAlias."
      );
    }

    const tenant = await new TenantModel(getDB()).update(req.tenantId, updates);
    if (updates.name) req.session.tenantName = tenant.name; // keep the navbar in sync
    res.json({ success: true, data: TenantModel.toPublic(tenant) });
  })
);

module.exports = router;
