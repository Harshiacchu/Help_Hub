// server/models/apiKey.js - API Key Model
// TODO: Implement database functions with native MongoDB driver

class ApiKeyModel {
    // Initialize with MongoDB connection
    constructor(db) {
        this.collection = db.collection('apikeys');
    }

    /**
     * Create a new API key
     * @param {Object} keyData - { tenantId, name, keyHash, prefix }
     * @returns {Promise<Object>} Created key with _id
     */
    async create(keyData) {
        // TODO: Insert into apikeys collection
        // keyData should include:
        // - tenantId
        // - name
        // - keyHash (bcrypt hashed)
        // - prefix (first 20 chars)
        // - createdAt
        // - lastUsedAt (null)
        // - revokedAt (null)
    }

    /**
     * Find API key by hash
     * Used during authentication to validate incoming API keys
     * @param {string} keyHash - Hashed API key
     * @returns {Promise<Object>} Key data including tenantId
     */
    async findByKeyHash(keyHash) {
        // TODO: Query by keyHash
        // Check that revokedAt is null (not revoked)
        // Return: { _id, tenantId, name, keyHash, createdAt }
    }

    /**
     * Get all active keys for tenant
     * @param {string} tenantId
     * @returns {Promise<Array>} Array of active keys (without keyHash)
     */
    async findByTenantId(tenantId) {
        // TODO: Query by tenantId
        // Filter where revokedAt is null
        // Return: { _id, name, prefix, createdAt, lastUsedAt }
    }

    /**
     * Update last used timestamp for key
     * Called every time API key is used
     * @param {string} keyId
     */
    async updateLastUsed(keyId) {
        // TODO: Update lastUsedAt = new Date()
        // for given keyId
    }

    /**
     * Revoke an API key
     * @param {string} keyId
     */
    async revoke(keyId) {
        // TODO: Set revokedAt = new Date()
        // Keep record for audit trail
    }

    /**
     * Delete key (soft delete via revoke)
     * @param {string} keyId
     */
    async delete(keyId) {
        // TODO: Call revoke() instead of hard delete
        return this.revoke(keyId);
    }
}

module.exports = ApiKeyModel;
