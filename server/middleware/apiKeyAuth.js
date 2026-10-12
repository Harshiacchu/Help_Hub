// server/middleware/apiKeyAuth.js - X-API-Key authentication
//
// Strict (key required):
//   app.use('/api/v1/integrations', apiKeyAuth, routes);
// Optional (key OR logged-in session), e.g. for ticket creation:
//   app.use('/api/v1/tickets', apiKeyAuth.optional, requireTenant, ticketRoutes);
//
// On success: req.tenantId, req.apiKeyId and req.source = 'api'

import { getDB } from "../config/db.js";
import ApiKeyModel from "../models/apiKey.js";

async function apiKeyAuth(req, res, next) {
  const apiKey = req.get("X-API-Key"); // header lookup is case-insensitive

  if (!apiKey) {
    return res
      .status(401)
      .json({ success: false, error: "X-API-Key header required" });
  }
  if (!ApiKeyModel.looksLikeKey(apiKey)) {
    return res
      .status(401)
      .json({ success: false, error: "Invalid or revoked API key" });
  }

  let db;
  try {
    db = getDB();
  } catch {
    return res
      .status(503)
      .json({ success: false, error: "Service temporarily unavailable" });
  }

  try {
    const apiKeyModel = new ApiKeyModel(db);
    const keyData = await apiKeyModel.validate(apiKey);

    if (!keyData) {
      return res
        .status(401)
        .json({ success: false, error: "Invalid or revoked API key" });
    }

    req.tenantId = keyData.tenantId.toString();
    req.apiKeyId = keyData._id.toString();
    req.source = "api";

    // Usage stats are non-critical: never fail the request because of them
    apiKeyModel.updateLastUsed(keyData._id).catch((error) => {
      console.warn("Could not update API key lastUsedAt:", error.message);
    });

    next();
  } catch (error) {
    next(error);
  }
}

/** Runs apiKeyAuth only when an X-API-Key header is present. */
apiKeyAuth.optional = function optionalApiKeyAuth(req, res, next) {
  if (!req.get("X-API-Key")) return next();
  return apiKeyAuth(req, res, next);
};

export default apiKeyAuth;
