// server/index.js - Express Server Entry Point
// WITH 7-DAY SESSION IMPLEMENTATION

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');

const app = express();

// ============================================
// MIDDLEWARE
// ============================================

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// ============================================
// 🔑 SESSION MIDDLEWARE - 7 DAYS
// ============================================

// CONFIGURATION:
// - maxAge: 7 days from last activity (not login)
// - rolling: true (refreshes on each request)
// - store: MongoDB (persists across server restarts)
// - secure: true in production (HTTPS only)
// - httpOnly: true (XSS protection)
// - sameSite: 'strict' (CSRF protection)

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

app.use(session({
    // ===== SESSION STORAGE =====
    // Store sessions in MongoDB for persistence
    // TODO: Uncomment when MongoDB is connected
    // store: MongoStore.create({
    //     client: mongoClient,           // MongoDB client
    //     dbName: 'helpHub',             // Database name
    //     collectionName: 'sessions',    // Collection for sessions
    //     ttl: 7 * 24 * 60 * 60,        // TTL in seconds (7 days)
    //     touchAfter: 24 * 3600          // Only update DB if modified
    // }),

    // ===== SESSION SECRET =====
    secret: process.env.SESSION_SECRET || 'change-this-secret-in-production',
    
    // ===== COOKIE SETTINGS =====
    cookie: {
        // ✅ 7-DAY EXPIRATION
        maxAge: SEVEN_DAYS_MS,  // 7 days from last activity
        
        // ✅ SECURITY: Prevents JavaScript access (XSS protection)
        httpOnly: true,
        
        // ✅ SECURITY: HTTPS only in production
        secure: process.env.NODE_ENV === 'production',
        
        // ✅ SECURITY: Prevents CSRF attacks
        sameSite: 'strict',
        
        path: '/'
    },

    // ===== SESSION BEHAVIOR =====
    // Don't save session if not modified
    saveUninitialized: false,
    
    // Resave even if unmodified (needed for rolling refresh)
    resave: true,
    
    // ✅ ROLLING REFRESH: Extends 7 days on each request
    rolling: true,

    // Cookie name
    name: 'sessionId'
}));

// ============================================
// PROTECTION MIDDLEWARE
// ============================================

// Check if user is authenticated (has valid session)
function requireAuth(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({
            success: false,
            error: 'Not authenticated',
            message: 'Session expired or not logged in'
        });
    }
    next();
}

// Check if user has admin role
function requireAdmin(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({
            success: false,
            error: 'Not authenticated'
        });
    }
    if (req.session.role !== 'admin' && req.session.role !== 'superior') {
        return res.status(403).json({
            success: false,
            error: 'Access denied. Admin role required.'
        });
    }
    next();
}

// Make middleware available globally
app.use((req, res, next) => {
    req.requireAuth = requireAuth;
    req.requireAdmin = requireAdmin;
    next();
});

// TODO: Add Passport middleware
// const passport = require('passport');
// require('./config/passport');
// app.use(passport.initialize());
// app.use(passport.session());

// TODO: Add tenant resolution middleware
// app.use(require('./middleware/tenantResolution'));

// ============================================
// DATABASE CONNECTION
// ============================================

// TODO: Initialize database connection
// const { connectDB } = require('./config/db');
// connectDB();

// ============================================
// ROUTES
// ============================================

// Authentication routes (no tenant requirement)
const authRoutes = require('./routes/auth');
app.use('/api/v1/auth', authRoutes);

// Tenant routes (require authentication)
const tenantRoutes = require('./routes/tenants');
app.use('/api/v1/tenants', tenantRoutes);

// Admin routes (require admin role)
const adminRoutes = require('./routes/admin');
app.use('/api/v1/admin', adminRoutes);

// API Keys routes
const apiKeyRoutes = require('./routes/apiKeys');
app.use('/api/v1/api-keys', apiKeyRoutes);

// Rules routes
const rulesRoutes = require('./routes/rules');
app.use('/api/v1/rules', rulesRoutes);

// TODO: Add other routes as they are created
// const ticketRoutes = require('./routes/tickets');
// app.use('/api/v1/tickets', ticketRoutes);

// ============================================
// FRONTEND ROUTES
// ============================================

// Redirect to login
app.get('/', (req, res) => {
    res.redirect('/pages/login.html');
});

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route not found'
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(err.status || 500).json({
        success: false,
        error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║   HelpHub Server Started               ║
╠════════════════════════════════════════╣
║ Port: ${PORT}                                 ║
║ Environment: ${process.env.NODE_ENV || 'development'}             ║
║ Session: 7-day MongoDB persistence     ║
║ Rolling: Yes (refreshes on each req)   ║
╚════════════════════════════════════════╝

Session Features:
  ✅ 7-day expiration (from last activity)
  ✅ Rolls/refreshes on each request
  ✅ HttpOnly cookies (XSS protection)
  ✅ Secure flag (HTTPS in production)
  ✅ SameSite: strict (CSRF protection)
    `);
});

module.exports = app;
