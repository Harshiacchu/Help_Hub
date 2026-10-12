// server/config/db.js - MongoDB Connection
// Native Node.js MongoDB Driver

const { MongoClient, ObjectId } = require('mongodb');

let client = null;
let db = null;

/**
 * Connect to MongoDB
 * @returns {Promise<Object>} Database instance
 */
async function connectDB() {
    try {
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
        
        client = new MongoClient(mongoUri);
        await client.connect();
        
        db = client.db('helpHub');
        
        console.log('✅ MongoDB Connected successfully');
        
        // Create indexes
        await createIndexes();
        
        return db;
        
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error);
        throw error;
    }
}

/**
 * Create database indexes for performance
 */
async function createIndexes() {
    try {
        // Tenant indexes
        await db.collection('tenants').createIndex({ slug: 1 }, { unique: true });
        
        // User indexes
        await db.collection('users').createIndex({ tenantId: 1, email: 1 }, { unique: true });
        await db.collection('users').createIndex({ tenantId: 1 });
        
        // API Key indexes
        await db.collection('apikeys').createIndex({ tenantId: 1 });
        await db.collection('apikeys').createIndex({ keyHash: 1 });
        
        // Rules indexes
        await db.collection('rules').createIndex({ tenantId: 1 });
        await db.collection('rules').createIndex({ tenantId: 1, ruleName: 1 }, { unique: true });
        
        // Share codes index
        await db.collection('shareCodes').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
        
        console.log('✅ Database indexes created');
        
    } catch (error) {
        console.error('Warning: Index creation:', error.message);
    }
}

/**
 * Get database connection
 */
function getDB() {
    if (!db) {
        throw new Error('Database not connected. Call connectDB first.');
    }
    return db;
}

/**
 * Close database connection
 */
async function closeDB() {
    if (client) {
        await client.close();
        console.log('MongoDB connection closed');
    }
}

module.exports = {
    connectDB,
    getDB,
    closeDB,
    ObjectId
};
