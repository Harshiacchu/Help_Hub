// server/middleware/tenantResolution.js - Tenant context for every request
//
// The tenant is taken ONLY from trusted sources:
//   1. The logged-in user's session (set at login)        -> this middleware
//   2. A validated X-API-Key header                        -> middleware/apiKeyAuth.js
// It is never read from the URL, query string or body, so one company can
// never ask for another company's data by changing an id.

function tenantResolution(req, res, next) {
  if (req.session && req.session.tenantId) {
    req.tenantId = req.session.tenantId;
    req.userId = req.session.userId;
    req.userRole = req.session.role;
    req.source = "web";
  }
  next();
}

/**
 * For routes that accept EITHER a session or an API key (e.g. creating tickets).
 * Put apiKeyAuth before it when the request carries X-API-Key.
 */
function requireTenant(req, res, next) {
  if (!req.tenantId) {
    return res
      .status(401)
      .json({ success: false, error: "Authentication required" });
  }
  next();
}

export { tenantResolution, requireTenant };
