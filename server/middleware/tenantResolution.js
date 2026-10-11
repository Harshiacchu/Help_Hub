// server/middleware/tenantResolution.js - Tenant Resolution Middleware
// TODO: Implement tenant extraction logic

/**
 * Middleware to extract and validate tenant from request
 * Tenant can come from:
 * 1. Session (for logged-in users)
 * 2. API key header (for API requests)
 * 3. URL parameter (for tenant-specific routes)
 * 
 * Attaches req.tenantId and req.user to the request object
 */

function tenantResolution(req, res, next) {
    try {
        let tenantId = null;

        // Priority 1: Check session (logged-in user)
        if (req.session && req.session.tenantId) {
            tenantId = req.session.tenantId;
            req.userId = req.session.userId;
            req.userRole = req.session.role;
        }
        // Priority 2: Check X-API-Key header (API authentication)
        else if (req.headers['x-api-key']) {
            // TODO: Validate API key and extract tenantId
            // This is handled separately in middleware/apiKeyAuth.js
            return next();
        }
        // Priority 3: Check URL parameters
        else if (req.params.tenantId) {
            tenantId = req.params.tenantId;
            // Note: For URL-based tenant access, still need authentication
        }

        // Attach to request
        if (tenantId) {
            req.tenantId = tenantId;
        }

        // Continue to next middleware
        next();

    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Error resolving tenant'
        });
    }
}

/**
 * Middleware to ensure tenant is resolved (required for protected routes)
 * Use this middleware on routes that require tenant context
 */
function requireTenant(req, res, next) {
    if (!req.tenantId) {
        return res.status(401).json({
            success: false,
            error: 'Authentication required'
        });
    }
    next();
}

/**
 * Middleware to check if user is admin of the tenant
 * Use this middleware on admin-only routes
 */
function requireTenantAdmin(req, res, next) {
    if (!req.tenantId) {
        return res.status(401).json({
            success: false,
            error: 'Authentication required'
        });
    }

    if (req.userRole !== 'admin') {
        return res.status(403).json({
            success: false,
            error: 'Admin access required'
        });
    }

    next();
}

module.exports = {
    tenantResolution,
    requireTenant,
    requireTenantAdmin
};
