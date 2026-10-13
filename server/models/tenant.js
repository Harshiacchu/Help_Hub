// server/models/tenant.js - Companies (tenants) and their invite share codes

import crypto from "node:crypto";
import { mustObjectId, toObjectId } from "../config/db.js";
import { ROLES, ValidationError } from "../utils/validators.js";

const SHARE_CODE_HOURS = 24;

const normalizeCode = (code) =>
  typeof code === "string" ? code.trim().toUpperCase() : "";

class TenantModel {
  constructor(db) {
    this.collection = db.collection("tenants");
    this.shareCodes = db.collection("shareCodes");
  }

  /** What the API returns - never the AI prompt. */
  static toPublic(tenant) {
    if (!tenant) return null;
    return {
      tenantId: tenant._id.toString(),
      name: tenant.name,
      slug: tenant.slug,
      supportEmailAlias: tenant.supportEmailAlias,
      createdAt: tenant.createdAt,
    };
  }

  /** Throws a duplicate-key error (code 11000) if the slug is taken. */
  async create({ name, slug, supportEmailAlias }) {
    const tenant = {
      name,
      slug,
      supportEmailAlias,
      status: "active",
      createdAt: new Date(),
    };
    const result = await this.collection.insertOne(tenant);
    return { ...tenant, _id: result.insertedId };
  }

  async findById(tenantId) {
    const _id = toObjectId(tenantId);
    return _id ? this.collection.findOne({ _id }) : null;
  }

  async findBySlug(slug) {
    if (typeof slug !== "string") return null;
    return this.collection.findOne({
      slug: slug.trim().toLowerCase(),
      status: "active",
    });
  }

  /** Changes the name and/or support email. */
  async update(tenantId, changes) {
    await this.collection.updateOne(
      { _id: mustObjectId(tenantId, "tenant id") },
      { $set: changes }
    );
    return this.findById(tenantId);
  }

  /** Stores the company's AI prompt in its record (used by `npm run prompts`). */
  async setTriagePrompt(slug, prompt) {
    const result = await this.collection.updateOne(
      { slug, status: "active" },
      { $set: { triagePrompt: prompt } }
    );
    return result.matchedCount > 0;
  }

  // ============================================
  // SHARE CODES (single-use invites, valid for 24 hours)
  // ============================================

  async createShareCode(tenantId, role = "agent") {
    if (!ROLES.includes(role)) {
      throw new ValidationError(`Role must be one of: ${ROLES.join(", ")}`);
    }
    const shareCode = {
      tenantId: mustObjectId(tenantId, "tenant id"),
      code: "SHARE_" + crypto.randomBytes(8).toString("hex").toUpperCase(),
      role,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + SHARE_CODE_HOURS * 60 * 60 * 1000),
      usedAt: null,
      usedBy: null,
    };
    await this.shareCodes.insertOne(shareCode);
    return { code: shareCode.code, role, expiresAt: shareCode.expiresAt };
  }

  /** An unused, unexpired code, or null. */
  async findShareCode(code) {
    return this.shareCodes.findOne({
      code: normalizeCode(code),
      usedAt: null,
      expiresAt: { $gt: new Date() },
    });
  }

  async markShareCodeUsed(code, userId) {
    await this.shareCodes.updateOne(
      { code: normalizeCode(code) },
      { $set: { usedAt: new Date(), usedBy: mustObjectId(userId, "user id") } }
    );
  }

  /** Unused, unexpired codes for this company. */
  async listActiveShareCodes(tenantId) {
    const codes = await this.shareCodes
      .find({
        tenantId: mustObjectId(tenantId, "tenant id"),
        usedAt: null,
        expiresAt: { $gt: new Date() },
      })
      .sort({ createdAt: -1 })
      .toArray();
    return codes.map(({ code, role, createdAt, expiresAt }) => ({
      code,
      role,
      createdAt,
      expiresAt,
    }));
  }

  /** Cancels an unused code; false if there was none. */
  async revokeShareCode(tenantId, code) {
    const result = await this.shareCodes.deleteOne({
      tenantId: mustObjectId(tenantId, "tenant id"),
      code: normalizeCode(code),
      usedAt: null,
    });
    return result.deletedCount > 0;
  }
}

export default TenantModel;
