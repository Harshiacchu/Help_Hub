// server/models/user.js - User Model
// TODO: Implement all database functions

class UserModel {
    // Initialize with MongoDB connection
    constructor(db) {
        this.collection = db.collection('users');
    }

    /**
     * Create a new user
     * @param {Object} userData - { tenantId, email, passwordHash, name, role }
     * @returns {Promise<Object>} Created user with _id
     */
    async create(userData) {
        // TODO: Implement
        // 1. Validate email is unique in tenant
        // 2. Insert into users collection
        // 3. Return created user (without password)
    }

    /**
     * Find user by email in a tenant
     * @param {string} tenantId
     * @param {string} email
     * @returns {Promise<Object>} User data including passwordHash
     */
    async findByEmail(tenantId, email) {
        // TODO: Implement
    }

    /**
     * Find user by ID
     * @param {string} userId
     * @returns {Promise<Object>} User data (without password)
     */
    async findById(userId) {
        // TODO: Implement
    }

    /**
     * Find user by ID including password hash (for authentication)
     * @param {string} userId
     * @returns {Promise<Object>} User data including passwordHash
     */
    async findByIdWithPassword(userId) {
        // TODO: Implement
    }

    /**
     * Get all agents in a tenant
     * @param {string} tenantId
     * @returns {Promise<Array>} Array of agent users
     */
    async findByTenantAndRole(tenantId, role) {
        // TODO: Implement
    }

    /**
     * Update user profile information
     * @param {string} userId
     * @param {Object} updates - { name, email, etc. }
     * @returns {Promise<Object>} Updated user
     */
    async updateProfile(userId, updates) {
        // TODO: Implement
        // Don't allow changing tenantId or role (security)
    }

    /**
     * Update user status (active/inactive)
     * @param {string} userId
     * @param {string} status - 'active' or 'inactive'
     * @returns {Promise<Object>} Updated user
     */
    async updateStatus(userId, status) {
        // TODO: Implement
    }

    /**
     * Change user password
     * @param {string} userId
     * @param {string} newPasswordHash
     * @returns {Promise<Object>} Updated user
     */
    async changePassword(userId, newPasswordHash) {
        // TODO: Implement
        // 1. Update passwordHash in database
        // 2. Log password change in audit trail (optional)
    }

    /**
     * Delete user
     * @param {string} userId
     * @returns {Promise<boolean>} Success status
     */
    async delete(userId) {
        // TODO: Implement
        // Consider soft delete (mark as deleted) vs hard delete
    }
}

module.exports = UserModel;
