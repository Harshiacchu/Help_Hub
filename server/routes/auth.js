// server/routes/auth.js - Registration, login, logout, current user
//
// POST /api/v1/auth/register-tenant   { name, slug, supportEmailAlias, slaTargets }
// POST /api/v1/auth/register          { shareCode, name, email, password }
// POST /api/v1/auth/login             { tenantSlug, email, password }
// POST /api/v1/auth/logout
// GET  /api/v1/auth/me

import express from "express";
import bcrypt from "bcrypt";
import { rateLimit } from "express-rate-limit";

import { getDB, isDuplicateKeyError } from "../config/db.js";
import { SESSION_COOKIE_NAME, COOKIE_OPTIONS } from "../config/session.js";
import { requireAuth, asyncHandler } from "../middleware/auth.js";
import TenantModel from "../models/tenant.js";
import UserModel from "../models/user.js";
import RulesModel from "../models/rules.js";
import {
  ValidationError,
  DEFAULT_SLA_TARGETS,
  assertEmail,
  assertPassword,
  assertSlug,
  cleanText,
  validateSlaTargets,
} from "../utils/validators.js";

const router = express.Router();

const SALT_ROUNDS = 10;
// Compared against when the user doesn't exist, so "no such user" and
// "wrong password" take the same time (no account enumeration by timing).
const DUMMY_HASH = bcrypt.hashSync(
  "timing-equalizer-not-a-real-password",
  SALT_ROUNDS
);
const INVALID_LOGIN = "Invalid organization, email or password";

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many login attempts. Please try again in 15 minutes.",
  },
});

const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many registration attempts. Please try again later.",
  },
});

// Promise wrappers for the callback-style session API
const regenerateSession = (req) =>
  new Promise((resolve, reject) =>
    req.session.regenerate((err) => (err ? reject(err) : resolve()))
  );
const saveSession = (req) =>
  new Promise((resolve, reject) =>
    req.session.save((err) => (err ? reject(err) : resolve()))
  );
const destroySession = (req) =>
  new Promise((resolve, reject) =>
    req.session.destroy((err) => (err ? reject(err) : resolve()))
  );

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE_NAME, COOKIE_OPTIONS);
}

// ============================================
// POST /register-tenant
// ============================================

router.post(
  "/register-tenant",
  registrationLimiter,
  asyncHandler(async (req, res) => {
    const name = cleanText(req.body.name, "Company name", { min: 2, max: 100 });
    const slug = assertSlug(req.body.slug);
    const supportEmailAlias = assertEmail(
      req.body.supportEmailAlias,
      "Support email"
    );
    const slaTargets = req.body.slaTargets
      ? validateSlaTargets(req.body.slaTargets)
      : { ...DEFAULT_SLA_TARGETS };

    const db = getDB();
    const tenantModel = new TenantModel(db);
    const rulesModel = new RulesModel(db);

    let tenant;
    try {
      tenant = await tenantModel.create({
        name,
        slug,
        supportEmailAlias,
        slaTargets,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ValidationError(
          "That company slug is already taken. Please choose another.",
          409
        );
      }
      throw error;
    }

    // If setup fails half-way, remove the tenant so the slug isn't stuck
    let shareCode;
    try {
      await rulesModel.initializeDefaults(tenant._id, { slaTargets });
      // The first code makes the person registering the organization its superior (admin)
      shareCode = await tenantModel.createShareCode(tenant._id, "superior");
    } catch (error) {
      await rulesModel.deleteByTenant(tenant._id).catch(() => {});
      await tenantModel.remove(tenant._id).catch(() => {});
      throw error;
    }

    res.status(201).json({
      success: true,
      data: {
        tenantId: tenant._id.toString(),
        slug: tenant.slug,
        shareCode: shareCode.code,
        shareCodeRole: shareCode.role,
        shareCodeExpiresAt: shareCode.expiresAt,
      },
      message:
        "Organization registered. Use the share code to create your admin account.",
    });
  })
);

// ============================================
// POST /register  (join a tenant with a share code)
// ============================================

router.post(
  "/register",
  registrationLimiter,
  asyncHandler(async (req, res) => {
    if (!req.body.shareCode)
      throw new ValidationError("Share code is required");
    const name = cleanText(req.body.name, "Name", { min: 1, max: 100 });
    const email = assertEmail(req.body.email);
    assertPassword(req.body.password);

    const db = getDB();
    const tenantModel = new TenantModel(db);
    const userModel = new UserModel(db);

    // Hash before claiming the code, so a slow hash can't leave a code claimed
    const passwordHash = await bcrypt.hash(req.body.password, SALT_ROUNDS);

    const claimed = await tenantModel.claimShareCode(req.body.shareCode);
    if (!claimed) {
      throw new ValidationError(
        "This share code is invalid, expired or already used"
      );
    }

    const tenant = await tenantModel.findById(claimed.tenantId);
    if (!tenant || tenant.status !== "active") {
      await tenantModel.releaseShareCode(claimed.code);
      throw new ValidationError(
        "This share code is invalid, expired or already used"
      );
    }

    let user;
    try {
      user = await userModel.create({
        tenantId: claimed.tenantId,
        email,
        passwordHash,
        name,
        role: claimed.role,
      });
    } catch (error) {
      await tenantModel.releaseShareCode(claimed.code);
      if (isDuplicateKeyError(error)) {
        throw new ValidationError(
          "An account with this email already exists in this organization",
          409
        );
      }
      throw error;
    }

    await tenantModel.markShareCodeUsed(claimed.code, user.userId);

    res.status(201).json({
      success: true,
      data: {
        userId: user.userId,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantSlug: tenant.slug,
        tenantName: tenant.name,
      },
      message: "Account created. Please log in.",
    });
  })
);

// ============================================
// POST /login
// ============================================

router.post(
  "/login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { tenantSlug, email, password } = req.body;

    if (!tenantSlug || !email || !password) {
      throw new ValidationError(
        "Organization, email and password are required"
      );
    }
    if (typeof password !== "string" || typeof email !== "string") {
      throw new ValidationError(INVALID_LOGIN, 401);
    }

    const db = getDB();
    const tenantModel = new TenantModel(db);
    const userModel = new UserModel(db);

    const tenant = await tenantModel.findBySlug(String(tenantSlug));
    const user = tenant
      ? await userModel.findByEmailWithPassword(tenant._id, email)
      : null;

    if (!user) {
      await bcrypt.compare(password, DUMMY_HASH);
      throw new ValidationError(INVALID_LOGIN, 401);
    }

    if (UserModel.isLocked(user)) {
      const minutes = Math.max(
        1,
        Math.ceil((new Date(user.lockedUntil) - Date.now()) / 60000)
      );
      throw new ValidationError(
        `Too many failed login attempts. Try again in ${minutes} minute(s).`,
        429
      );
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      const { locked } = await userModel.recordFailedLogin(
        tenant._id,
        user._id
      );
      if (locked) {
        throw new ValidationError(
          "Too many failed login attempts. Your account is locked for 30 minutes.",
          429
        );
      }
      throw new ValidationError(INVALID_LOGIN, 401);
    }

    // Only reveal account status to someone who knows the password
    if (user.status !== "active") {
      throw new ValidationError(
        "This account has been deactivated. Contact your organization admin.",
        403
      );
    }

    await userModel.recordSuccessfulLogin(tenant._id, user._id);

    // New session id on login prevents session fixation
    await regenerateSession(req);

    req.session.userId = user._id.toString();
    req.session.tenantId = tenant._id.toString();
    req.session.role = user.role;
    req.session.email = user.email;
    req.session.name = user.name;
    req.session.tenantName = tenant.name;
    req.session.tenantSlug = tenant.slug;
    req.session.loginTime = new Date().toISOString();

    await saveSession(req);

    res.json({
      success: true,
      user: {
        userId: req.session.userId,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: req.session.tenantId,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
      },
      message: "Login successful",
    });
  })
);

// ============================================
// POST /logout
// ============================================

router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    if (req.session) {
      await destroySession(req);
    }
    clearSessionCookie(res);
    res.json({ success: true, message: "Logged out successfully" });
  })
);

// ============================================
// GET /me
// ============================================

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    // Re-check the database so deactivated users are signed out on their next page load
    const user = await new UserModel(getDB()).findById(
      req.tenantId,
      req.user.id
    );
    if (!user || user.status !== "active") {
      await destroySession(req);
      clearSessionCookie(res);
      return res.status(401).json({
        success: false,
        error: "Not authenticated",
        message: "Session expired or not logged in",
      });
    }

    res.json({
      success: true,
      user: {
        userId: user.userId,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
        tenantName: req.session.tenantName,
        tenantSlug: req.session.tenantSlug,
      },
      session: { loginTime: req.session.loginTime },
    });
  })
);

export default router;
