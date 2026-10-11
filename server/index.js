// server/index.js - Express Server Entry Point
// TODO: Add database connection and middleware

require('dotenv').config();
const express = require('express');
const session = require('express-session');
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

// Session middleware
// TODO: Replace with MongoDB session store for production
app.use(session({
    secret: process.env.SESSION_SECRET || 'dev-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: process.env.ENVIRONMENT === 'production', // HTTPS only in production
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

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

// TODO: Add other routes as they are created
// const ticketRoutes = require('./routes/tickets');
// app.use('/api/v1/tickets', ticketRoutes);

// const apiKeyRoutes = require('./routes/apiKeys');
// app.use('/api/v1/api-keys', apiKeyRoutes);

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
        error: process.env.ENVIRONMENT === 'development' ? err.message : 'Internal server error'
    });
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`HelpHub server running on http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.ENVIRONMENT || 'development'}`);
});
