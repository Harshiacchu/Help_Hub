// server/models/tenant.js - Tenants (organizations) and invite share codes

import crypto from "node:crypto";
import { mustObjectId, toObjectId } from "../config/db.js";
import {
  ROLES,
  DEFAULT_SLA_TARGETS,
  ValidationError,
} from "../utils/validators.js";

const SHARE_CODE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

class TenantModel {
  constructor(db) {
    this.collection = db.collection("tenants");
    this.shareCodes = db.collection("shareCodes");
  }

  static toPublic(tenant) {
    if (!tenant) return null;
    return {
      tenantId: tenant._id.toString(),
      name: tenant.name,
      slug: tenant.slug,
      supportEmailAlias: tenant.supportEmailAlias,
      slaTargets: tenant.slaTargets,
      status: tenant.status,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    };
  }

  static generateShareCode() {
    // 64 bits of cryptographic randomness, e.g. SHARE_9F3A1C77B2E04D5A
    return "SHARE_" + crypto.randomBytes(8).toString("hex").toUpperCase();
  }

  static normalizeCode(code) {
    return typeof code === "string" ? code.trim().toUpperCase() : "";
  }

  /** Throws the driver's duplicate-key error (code 11000) if the slug is taken. */
  async create({ name, slug, supportEmailAlias, slaTargets }) {
    const now = new Date();
    const tenant = {
      name,
      slug,
      supportEmailAlias,
      slaTargets: slaTargets || { ...DEFAULT_SLA_TARGETS },
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    const result = await this.collection.insertOne(tenant);
    return { ...tenant, _id: result.insertedId };
  }

  async findById(tenantId) {
    const _id = toObjectId(tenantId);
    if (!_id) return null;
    return this.collection.findOne({ _id, status: { $ne: "deleted" } });
  }

  async findBySlug(slug) {
    if (typeof slug !== "string" || !slug.trim()) return null;
    return this.collection.findOne({
      slug: slug.trim().toLowerCase(),
      status: "active",
    });
  }

  /** Only name and supportEmailAlias can change here. SLA changes go through RulesModel. */
  async update(tenantId, { name, supportEmailAlias }) {
    const set = {};
    if (name !== undefined) set.name = name;
    if (supportEmailAlias !== undefined)
      set.supportEmailAlias = supportEmailAlias;
    if (Object.keys(set).length === 0) return this.findById(tenantId);

    set.updatedAt = new Date();
    await this.collection.updateOne(
      { _id: mustObjectId(tenantId, "tenant id") },
      { $set: set }
    );
    return this.findById(tenantId);
  }

  /** Stores the company's AI triage prompt in its record. Returns false if no such company. */
  async setTriagePrompt(slug, prompt) {
    const result = await this.collection.updateOne(
      { slug, status: "active" },
      { $set: { triagePrompt: prompt, updatedAt: new Date() } }
    );
    return result.matchedCount > 0;
  }

  /** Hard delete - only used to roll back a half-finished tenant registration. */
  async remove(tenantId) {
    await this.collection.deleteOne({
      _id: mustObjectId(tenantId, "tenant id"),
    });
  }

  // ============================================
  // SHARE CODES (invites)
  // ============================================

  async createShareCode(tenantId, role = "agent", createdBy = null) {
    if (!ROLES.includes(role)) {
      throw new ValidationError(`Role must be one of: ${ROLES.join(", ")}`);
    }

    const now = new Date();
    const shareCode = {
      tenantId: mustObjectId(tenantId, "tenant id"),
      code: TenantModel.generateShareCode(),
      role,
      createdBy: createdBy ? toObjectId(createdBy) : null,
      createdAt: now,
      expiresAt: new Date(now.getTime() + SHARE_CODE_TTL_MS),
      usedAt: null,
      usedBy: null,
    };

    await this.shareCodes.insertOne(shareCode);
    return {
      code: shareCode.code,
      role: shareCode.role,
      expiresAt: shareCode.expiresAt,
    };
  }

  /**
   * Atomically claims an unused, unexpired code. Two people submitting the
   * same code at the same moment can't both get in.
   * @returns {Promise<Object|null>} the claimed code document (with tenantId and role), or null
   */
  async claimShareCode(code) {
    const normalized = TenantModel.normalizeCode(code);
    if (!normalized) return null;
    const now = new Date();

    return this.shareCodes.findOneAndUpdate(
      { code: normalized, usedAt: null, expiresAt: { $gt: now } },
      { $set: { usedAt: now } },
      { returnDocument: "after", includeResultMetadata: false }
    );
  }

  /** Gives a claimed code back if creating the user failed (e.g. duplicate email). */
  async releaseShareCode(code) {
    await this.shareCodes.updateOne(
      { code: TenantModel.normalizeCode(code), usedBy: null },
      { $set: { usedAt: null } }
    );
  }

  /** Records who used the code once their account exists. */
  async markShareCodeUsed(code, userId) {
    await this.shareCodes.updateOne(
      { code: TenantModel.normalizeCode(code) },
      { $set: { usedBy: mustObjectId(userId, "user id") } }
    );
  }

  /** Unused, unexpired codes for this tenant. */
  async listActiveShareCodes(tenantId) {
    const codes = await this.shareCodes
      .find({
        tenantId: mustObjectId(tenantId, "tenant id"),
        usedAt: null,
        expiresAt: { $gt: new Date() },
      })
      .sort({ createdAt: -1 })
      .toArray();
    return codes.map((c) => ({
      code: c.code,
      role: c.role,
      createdAt: c.createdAt,
      expiresAt: c.expiresAt,
    }));
  }

  async revokeShareCode(tenantId, code) {
    const result = await this.shareCodes.deleteOne({
      tenantId: mustObjectId(tenantId, "tenant id"),
      code: TenantModel.normalizeCode(code),
      usedAt: null,
    });
    return result.deletedCount > 0;
  }
}

export default TenantModel;
