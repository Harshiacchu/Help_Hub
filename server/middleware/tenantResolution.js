// server/middleware/tenantResolution.js - Tenant context for every request
//
// The tenant is taken ONLY from trusted sources:
//   1. The logged-in user's session (set at login)        -> this middleware
//   2. A validated X-API-Key header                        -> middleware/apiKeyAuth.js
// It is never read from the URL, query string or body, so one company can
// never ask for another company's data by changing an id.

/** The one place the session is read. Sets req.user, req.tenantId and req.source. */
function tenantResolution(req, res, next) {
  const s = req.session;
  if (s && s.userId && s.tenantId) {
    req.user = {
      id: s.userId,
      tenantId: s.tenantId,
      role: s.role,
      email: s.email,
      name: s.name,
    };
    req.tenantId = s.tenantId;
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
