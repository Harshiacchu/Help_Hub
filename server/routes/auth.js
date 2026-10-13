// server/routes/auth.js - Registration, login, logout and the current user
//
// POST /api/v1/auth/register-tenant   { name, slug, supportEmailAlias, slaTargets }
// POST /api/v1/auth/register          { shareCode, name, email, password }
// POST /api/v1/auth/login             { tenantSlug, email, password }
// POST /api/v1/auth/logout
// GET  /api/v1/auth/me

import express from "express";
import bcrypt from "bcrypt";

import { getDB, isDuplicateKeyError } from "../config/db.js";
import { SESSION_COOKIE_NAME, COOKIE_OPTIONS } from "../config/session.js";
import { requireAuth, asyncHandler } from "../middleware/auth.js";
import TenantModel from "../models/tenant.js";
import UserModel from "../models/user.js";
import RulesModel from "../models/rules.js";
import {
  ValidationError,
  assertEmail,
  assertPassword,
  assertSlug,
  cleanText,
  validateSlaTargets,
} from "../utils/validators.js";

const router = express.Router();
const SALT_ROUNDS = 10;

// Registers a company. The returned share code lets its admin create an account.
router.post(
  "/register-tenant",
  asyncHandler(async (req, res) => {
    const name = cleanText(req.body.name, "Company name", { min: 2, max: 100 });
    const slug = assertSlug(req.body.slug);
    const supportEmailAlias = assertEmail(
      req.body.supportEmailAlias,
      "Support email"
    );
    const slaTargets = req.body.slaTargets
      ? validateSlaTargets(req.body.slaTargets)
      : undefined;

    const db = getDB();
    const tenants = new TenantModel(db);
    let tenant;
    try {
      tenant = await tenants.create({ name, slug, supportEmailAlias });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ValidationError("That company slug is already taken", 409);
      }
      throw error;
    }

    await new RulesModel(db).initializeDefaults(tenant._id, { slaTargets });
    // The first share code makes the person registering the company its admin
    const shareCode = await tenants.createShareCode(tenant._id, "superior");

    res.status(201).json({
      success: true,
      data: {
        tenantId: tenant._id.toString(),
        slug,
        shareCode: shareCode.code,
      },
    });
  })
);

// Creates an account in the company (and with the role) of the share code
router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const name = cleanText(req.body.name, "Name", { max: 100 });
    const email = assertEmail(req.body.email);
    const password = assertPassword(req.body.password);

    const db = getDB();
    const tenants = new TenantModel(db);
    const shareCode = await tenants.findShareCode(req.body.shareCode);
    const tenant = shareCode && (await tenants.findById(shareCode.tenantId));
    if (!tenant) {
      throw new ValidationError(
        "This share code is invalid, expired or already used"
      );
    }

    let user;
    try {
      user = await new UserModel(db).create({
        tenantId: tenant._id,
        email,
        passwordHash: await bcrypt.hash(password, SALT_ROUNDS),
        name,
        role: shareCode.role,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ValidationError(
          "An account with this email already exists in this organization",
          409
        );
      }
      throw error;
    }
    await tenants.markShareCodeUsed(shareCode.code, user.userId);

    res.status(201).json({
      success: true,
      data: { ...user, tenantSlug: tenant.slug, tenantName: tenant.name },
    });
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { tenantSlug, email, password } = req.body;
    const db = getDB();
    const users = new UserModel(db);

    const tenant = await new TenantModel(db).findBySlug(tenantSlug);
    const user =
      tenant && (await users.findByEmailWithPassword(tenant._id, email));
    if (user && UserModel.isLocked(user)) {
      throw new ValidationError(
        "Too many failed login attempts. Try again in 30 minutes.",
        429
      );
    }

    const passwordOk =
      user &&
      typeof password === "string" &&
      (await bcrypt.compare(password, user.passwordHash));
    if (!passwordOk) {
      if (user && (await users.recordFailedLogin(user))) {
        throw new ValidationError(
          "Too many failed login attempts. Your account is locked for 30 minutes.",
          429
        );
      }
      throw new ValidationError("Invalid organization, email or password", 401);
    }
    if (user.status !== "active") {
      throw new ValidationError("This account has been deactivated", 403);
    }

    await users.recordLogin(tenant._id, user._id);
    Object.assign(req.session, {
      userId: user._id.toString(),
      tenantId: tenant._id.toString(),
      role: user.role,
      email: user.email,
      name: user.name,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
    });

    res.json({
      success: true,
      user: {
        ...UserModel.toPublic(user),
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
      },
    });
  })
);

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie(SESSION_COOKIE_NAME, COOKIE_OPTIONS);
    res.json({ success: true });
  });
});

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    // Deactivated users are signed out the next time a page checks who they are
    const user = await new UserModel(getDB()).findById(
      req.tenantId,
      req.user.id
    );
    if (!user || user.status !== "active") {
      req.session.destroy(() => {
        res.status(401).json({ success: false, error: "Not authenticated" });
      });
      return;
    }
    res.json({
      success: true,
      user: {
        ...user,
        tenantName: req.session.tenantName,
        tenantSlug: req.session.tenantSlug,
      },
    });
  })
);

export default router;
