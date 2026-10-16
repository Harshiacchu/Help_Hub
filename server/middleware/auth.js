// server/middleware/auth.js - Session authentication & role checks
//
// Usage:
//   app.use('/api/v1/admin', requireAuth, requireRole('superior'), adminRoutes);
//   router.put('/x', requireRole('superior'), asyncHandler(async (req, res) => { ... }));
//
// After requireAuth, every handler can rely on:
//   req.user     = { id, tenantId, role, email, name }
//   req.tenantId = the logged-in user's tenant (from the session, never from the request)

/** req.user is filled in by tenantResolution, which server/app.js runs on every request. */
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: "Not authenticated",
      message: "Session expired or not logged in",
    });
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, error: "Not authenticated" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: "You do not have permission to do this",
      });
    }
    next();
  };
}

/** Express 4 does not catch rejected promises - this forwards them to the error handler. */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export { requireAuth, requireRole, asyncHandler };
