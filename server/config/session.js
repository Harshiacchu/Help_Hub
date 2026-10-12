// server/config/session.js
// Session configuration with MongoDB persistence for 7-day expiration

const session = require('express-session');
const MongoStore = require('connect-mongo');
require('dotenv').config();

/**
 * Session Configuration
 * 
 * Features:
 * ✅ 7-day expiration (from last activity)
 * ✅ MongoDB persistence (survives server restarts)
 * ✅ Rolling refresh (extends on each request)
 * ✅ Auto-cleanup of expired sessions
 * ✅ Security: HttpOnly, Secure, SameSite flags
 */

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

/**
 * Setup session middleware with MongoDB store
 * 
 * @param {MongoClient} mongoClient - MongoDB client connection
 * @returns {express-session} Session middleware
 * 
 * Usage in server/index.js:
 * const setupSession = require('./config/session');
 * const sessionMiddleware = setupSession(mongoClient);
 * app.use(sessionMiddleware);
 */
module.exports = function setupSession(mongoClient) {
    return session({
        // ====================================
        // STORE: Persist sessions in MongoDB
        // ====================================
        store: MongoStore.create({
            client: mongoClient,           // MongoDB client connection
            dbName: 'helpHub',             // Database name
            collectionName: 'sessions',    // Collection for sessions
            ttl: 7 * 24 * 60 * 60,        // TTL in seconds (7 days) - Auto-delete expired
            touchAfter: 24 * 3600          // Only update DB if modified (reduces writes)
        }),

        // ====================================
        // SECRET: Sign session cookie
        // ====================================
        secret: process.env.SESSION_SECRET || 'change-this-secret-in-production',
        
        // ====================================
        // COOKIE NAME
        // ====================================
        name: 'sessionId',  // Cookie name (shown in browser)

        // ====================================
        // SESSION ID GENERATION
        // ====================================
        genid: (req) => {
            // Generate cryptographically secure session IDs
            return require('crypto').randomBytes(16).toString('hex');
        },

        // ====================================
        // COOKIE SETTINGS
        // ====================================
        cookie: {
            // ✅ EXPIRES IN 7 DAYS (from last activity)
            maxAge: SEVEN_DAYS_MS,  // 7 days in milliseconds
            
            // ✅ SECURITY: Prevents JavaScript access (XSS protection)
            // JavaScript cannot access this cookie
            httpOnly: true,
            
            // ✅ SECURITY: HTTPS only in production
            // Set to true only on HTTPS connections
            secure: process.env.NODE_ENV === 'production',
            
            // ✅ SECURITY: Prevents CSRF attacks
            // Only send cookie to same site (strict = most secure)
            sameSite: 'strict',
            
            // Cookie available on all paths
            path: '/'
        },

        // ====================================
        // SESSION BEHAVIOR
        // ====================================
        
        // Don't save session if data hasn't been modified
        saveUninitialized: false,
        
        // Resave session even if unmodified (needed for rolling refresh)
        // With rolling: true, this refreshes the TTL on every request
        resave: true,
        
        // ✅ ROLLING REFRESH: Extends session on each request
        // User makes request on day 5 → Session extends to day 12
        // Active users never expire; only inactive users logout
        rolling: true,

        // ====================================
        // PROXY SETTINGS
        // ====================================
        // Trust X-Forwarded-For header if behind reverse proxy
        proxy: process.env.NODE_ENV === 'production'
    });
};

/**
 * SESSION DATA STRUCTURE
 * 
 * Example document stored in MongoDB 'sessions' collection:
 * 
 * {
 *   "_id": "abc123def456...",  // Session ID (hex string)
 *   "session": {
 *     "userId": ObjectId("..."),
 *     "email": "user@example.com",
 *     "name": "John Smith",
 *     "role": "admin",
 *     "tenantId": ObjectId("..."),
 *     "loginTime": 2026-10-11T12:00:00Z,
 *     "lastActivity": 2026-10-16T15:30:00Z
 *   },
 *   "expires": 2026-10-23T15:30:00Z  // Auto-deleted by TTL index
 * }
 */

/**
 * CONFIGURATION EXPLAINED
 * 
 * ✅ rolling: true
 *    - Refreshes cookie expiration on EVERY request
 *    - User gets full 7 days from LAST ACTIVITY
 *    - Active users stay logged in indefinitely
 *    - Inactive users expire after 7 days
 *
 * ✅ resave: true
 *    - Resaves session even if data hasn't changed
 *    - With rolling: true, refreshes the TTL
 *    - Keeps active sessions alive
 *
 * ✅ saveUninitialized: false
 *    - Don't create sessions for unauthenticated users
 *    - Only creates session when user logs in
 *    - Reduces database bloat
 *
 * ✅ store: MongoStore
 *    - Persists sessions in MongoDB
 *    - Survives server restarts
 *    - Supports multi-server deployments
 *    - TTL index auto-deletes expired sessions
 *
 * ✅ secure: true (production only)
 *    - Cookie only sent over HTTPS
 *    - Prevents man-in-the-middle attacks
 *    - MUST be enabled in production!
 *
 * ✅ httpOnly: true
 *    - Cookie cannot be accessed by JavaScript
 *    - Prevents XSS attacks
 *    - Already secured by this flag
 *
 * ✅ sameSite: 'strict'
 *    - Cookie only sent to same site
 *    - Prevents CSRF attacks
 *    - Strictest setting (most secure)
 */

/**
 * REFRESH BEHAVIOR - HOW 7-DAY SESSION WORKS
 * 
 * Timeline Example:
 * 
 * Day 0 12:00 PM: User logs in
 *   - Session created
 *   - Session expires on: Day 7 12:00 PM
 *   - Status: ✅ ACTIVE
 *   
 * Day 4 3:00 PM: User makes request
 *   - Cookie refreshed (rolling: true)
 *   - Session now expires on: Day 11 3:00 PM
 *   - Status: ✅ ACTIVE
 *   
 * Day 8 10:00 AM: Original expiration time passes
 *   - BUT user was active on day 4
 *   - Session NOT expired yet
 *   - Status: ✅ STILL ACTIVE (until day 11)
 *   
 * Day 11 3:00 PM: New expiration time
 *   - User hasn't made requests since day 4
 *   - Session EXPIRES
 *   - User must login again
 *   - Status: ❌ EXPIRED
 * 
 * Day 12 10:00 AM: User makes request after expiration
 *   - GET /api/v1/auth/me
 *   - Response: 401 Unauthorized
 *   - Message: "Session expired. Please login."
 */

/**
 * INSTALLATION
 * 
 * Required packages (already in package.json):
 *   npm install express-session
 *   npm install connect-mongo
 */

/**
 * USAGE IN server/index.js
 * 
 * // 1. Import setup function
 * const setupSession = require('./config/session');
 * 
 * // 2. Get MongoDB client
 * const { connectDB, getClient } = require('./config/db');
 * const mongoClient = getClient();
 * 
 * // 3. Create session middleware
 * const sessionMiddleware = setupSession(mongoClient);
 * 
 * // 4. Add to Express app
 * app.use(sessionMiddleware);
 * 
 * // Now all routes have access to req.session!
 */

/**
 * ACCESSING SESSION IN ROUTES
 * 
 * Set session data (in login):
 *   req.session.userId = user._id;
 *   req.session.email = user.email;
 *   req.session.role = user.role;
 *   req.session.tenantId = user.tenantId;
 *   req.session.save((err) => { ... });
 * 
 * Access session data (in any route):
 *   const userId = req.session.userId;
 *   const role = req.session.role;
 *   const email = req.session.email;
 * 
 * Check if logged in:
 *   if (!req.session.userId) {
 *     return res.status(401).json({ error: 'Not authenticated' });
 *   }
 * 
 * Destroy session (on logout):
 *   req.session.destroy((err) => { ... });
 */
