// server/models/tenant.js - Tenant Model
// TODO: Implement all database functions

class TenantModel {
    // Initialize with MongoDB connection
    constructor(db) {
        this.collection = db.collection('tenants');
        this.shareCodesCollection = db.collection('shareCodes');
    }

    /**
     * Create a new tenant
     * @param {Object} tenantData - { name, slug, supportEmailAlias, slaTargets }
     * @returns {Promise<Object>} Created tenant with _id
     */
    async create(tenantData) {
        // TODO: Implement
        // 1. Validate slug is unique
        // 2. Insert into tenants collection
        // 3. Return created tenant
    }

    /**
     * Find tenant by ID
     * @param {string} tenantId
     * @returns {Promise<Object>} Tenant data
     */
    async findById(tenantId) {
        // TODO: Implement
    }

    /**
     * Find tenant by slug
     * @param {string} slug
     * @returns {Promise<Object>} Tenant data
     */
    async findBySlug(slug) {
        // TODO: Implement
    }

    /**
     * Update tenant information
     * @param {string} tenantId
     * @param {Object} updates
     * @returns {Promise<Object>} Updated tenant
     */
    async update(tenantId, updates) {
        // TODO: Implement
    }

    /**
     * Update SLA targets for tenant
     * @param {string} tenantId
     * @param {Object} slaTargets - { low, normal, high, urgent }
     * @returns {Promise<Object>} Updated tenant
     */
    async updateSLA(tenantId, slaTargets) {
        // TODO: Implement
    }

    /**
     * Generate and store a share code for inviting agents
     * @param {string} tenantId
     * @param {string} role - 'agent' or 'admin'
     * @returns {Promise<string>} Share code
     */
    async generateShareCode(tenantId, role = 'agent') {
        // TODO: Implement
        // 1. Generate random code
        // 2. Set expiration to 24 hours from now
        // 3. Store in shareCodes collection
        // 4. Return code
    }

    /**
     * Validate share code
     * @param {string} shareCode
     * @returns {Promise<Object>} { tenantId, role, isValid }
     */
    async validateShareCode(shareCode) {
        // TODO: Implement
        // 1. Find share code in database
        // 2. Check if expired
        // 3. Return validation result
    }

    /**
     * Revoke a share code after use
     * @param {string} shareCode
     */
    async revokeShareCode(shareCode) {
        // TODO: Implement
    }
}

module.exports = TenantModel;
