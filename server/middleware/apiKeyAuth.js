// server/middleware/apiKeyAuth.js - API Key Authentication Middleware
// TODO: Implement API key validation

const crypto = require('crypto');

/**
 * Middleware to authenticate requests using X-API-Key header
 * 
 * Usage:
 *   app.use('/api/v1/tickets', apiKeyAuth, ticketRoutes);
 * 
 * Extracts:
 *   - X-API-Key header value
 *   - Validates key exists and is not revoked
 *   - Attaches req.tenantId and req.apiKeyId
 *   - Updates lastUsedAt timestamp
 */
function apiKeyAuth(req, res, next) {
    try {
        const apiKey = req.headers['x-api-key'];

        if (!apiKey) {
            return res.status(401).json({
                success: false,
                error: 'X-API-Key header required'
            });
        }

        // TODO: Hash the incoming API key
        // const keyHash = await bcrypt.hash(apiKey, 10);
        
        // TODO: Query apikeys collection for matching keyHash
        // SELECT * FROM apikeys WHERE keyHash = ? AND revokedAt IS NULL
        
        // TODO: If key found:
        // 1. Extract tenantId from key document
        // 2. Update lastUsedAt timestamp (async, don't wait)
        // 3. Attach to request: req.tenantId = key.tenantId
        // 4. Attach to request: req.apiKeyId = key._id
        // 5. Attach to request: req.source = 'api' (for logging)
        // 6. Call next()
        
        // TODO: If key not found:
        // Return 401 Unauthorized

        // Mock implementation (remove when implementing)
        req.tenantId = 'tenant_123';
        req.apiKeyId = 'key_123';
        req.source = 'api';
        next();

    } catch (error) {
        res.status(401).json({
            success: false,
            error: 'API key validation failed'
        });
    }
}

module.exports = apiKeyAuth;
