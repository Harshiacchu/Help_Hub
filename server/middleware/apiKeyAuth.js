// server/middleware/apiKeyAuth.js - X-API-Key authentication
//
// For routes that other systems call with an API key, e.g. Emily's tickets:
//   app.use("/api/v1/tickets", apiKeyAuth.optional, requireTenant, ticketRoutes);
// On success: req.tenantId, req.apiKeyId, req.source = "api" and req.user = null
// (the request comes from a system, not a logged-in person).

import { getDB } from "../config/db.js";
import ApiKeyModel from "../models/apiKey.js";

async function apiKeyAuth(req, res, next) {
  try {
    const key = await new ApiKeyModel(getDB()).validate(req.get("X-API-Key"));
    if (!key) {
      return res
        .status(401)
        .json({ success: false, error: "Invalid or missing API key" });
    }
    req.tenantId = key.tenantId.toString();
    req.apiKeyId = key._id.toString();
    req.source = "api";
    req.user = null;
    next();
  } catch (error) {
    next(error);
  }
}

/** Checks the key only when an X-API-Key header is sent; otherwise the login session is used. */
apiKeyAuth.optional = (req, res, next) =>
  req.get("X-API-Key") ? apiKeyAuth(req, res, next) : next();

export default apiKeyAuth;
