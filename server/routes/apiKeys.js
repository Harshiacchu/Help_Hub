// server/routes/apiKeys.js - API Key Management
// TODO: Implement API key operations using native MongoDB driver

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// ============================================
// CREATE API KEY
// ============================================

/**
 * POST /api/v1/api-keys
 * Generate a new API key for external integrations
 * 
 * Body:
 * {
 *   name: string - Key name (e.g., "Order System Integration")
 * }
 * 
 * Response:
 * {
 *   success: boolean,
 *   data: {
 *     keyId: string,
 *     key: string (ONLY shown once!),
 *     prefix: string (e.g., "helpHub_abc123..."),
 *     name: string,
 *     createdAt: string
 *   },
 *   message: string (warn user to save key)
 * }
 */
router.post('/', async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ 
                success: false, 
                error: 'API key name is required' 
            });
        }

        // TODO: Generate random API key
        // Format: "helpHub_" + 32 random characters
        const apiKey = 'helpHub_' + crypto.randomBytes(16).toString('hex');
        
        // TODO: Hash the key with bcrypt before storing
        // const keyHash = await bcrypt.hash(apiKey, 10);
        
        // TODO: Save to database
        // const keyData = {
        //   tenantId,
        //   name,
        //   keyHash,
        //   prefix: apiKey.substring(0, 20), // Show only first 20 chars
        //   createdAt: new Date(),
        //   lastUsedAt: null,
        //   revokedAt: null
        // };
        // const result = await apiKeyModel.create(keyData);

        res.json({
            success: true,
            data: {
                keyId: 'key_' + Math.random().toString(36).substr(2, 9),
                key: apiKey, // Only shown once!
                prefix: apiKey.substring(0, 20) + '...',
                name: name,
                createdAt: new Date().toISOString()
            },
            message: '⚠️ SAVE THIS KEY NOW! You will not see it again. Anyone with this key can create tickets.'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================
// LIST API KEYS
// ============================================

/**
 * GET /api/v1/api-keys
 * List all API keys for tenant (without showing full key)
 * 
 * Response:
 * {
 *   success: boolean,
 *   data: [
 *     {
 *       keyId: string,
 *       name: string,
 *       prefix: string,
 *       createdAt: string,
 *       lastUsedAt: string,
 *       status: "active" | "revoked"
 *     }
 *   ]
 * }
 */
router.get('/', async (req, res) => {
    try {
        const tenantId = req.tenantId;

        // TODO: Query apikeys collection
        // SELECT keyId, name, prefix, createdAt, lastUsedAt, revokedAt
        // WHERE tenantId = ? AND revokedAt IS NULL

        res.json({
            success: true,
            data: [
                {
                    keyId: 'key_123',
                    name: 'Order System Integration',
                    prefix: 'helpHub_abc123abc...',
                    createdAt: '2024-01-15T10:30:00Z',
                    lastUsedAt: '2024-01-20T14:22:00Z',
                    status: 'active'
                },
                {
                    keyId: 'key_456',
                    name: 'Mobile App',
                    prefix: 'helpHub_xyz789xyz...',
                    createdAt: '2024-02-01T09:00:00Z',
                    lastUsedAt: null,
                    status: 'active'
                }
            ]
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================
// REVOKE API KEY
// ============================================

/**
 * DELETE /api/v1/api-keys/:keyId
 * Revoke an API key (doesn't delete, marks as revoked)
 */
router.delete('/:keyId', async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const { keyId } = req.params;

        // TODO: Find key and verify it belongs to this tenant
        // TODO: Mark as revoked (set revokedAt timestamp)
        // TODO: Do NOT delete the record (keep audit trail)

        res.json({
            success: true,
            data: {
                keyId: keyId,
                status: 'revoked',
                message: 'API key revoked successfully'
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================
// ROTATE API KEY
// ============================================

/**
 * POST /api/v1/api-keys/:keyId/rotate
 * Generate new key for existing key name
 * Old key is revoked, new key is returned
 */
router.post('/:keyId/rotate', async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const { keyId } = req.params;

        // TODO: Find old key and get name
        // TODO: Generate new key
        // TODO: Hash and save new key
        // TODO: Mark old key as revoked
        // TODO: Return new key (only time shown)

        res.json({
            success: true,
            data: {
                keyId: 'key_' + Math.random().toString(36).substr(2, 9),
                key: 'helpHub_' + Math.random().toString(36).substr(2, 30),
                prefix: 'helpHub_abc123abc...',
                message: 'Key rotated. Old key revoked. Save new key!'
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
