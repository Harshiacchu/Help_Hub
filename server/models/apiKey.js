// server/models/apiKey.js - API keys for programmatic ticket creation
//
// Keys look like: hh_<40 hex chars>   (160 bits from crypto.randomBytes)
// Only a SHA-256 hash is stored. The full key is returned once, at creation.

import crypto from "node:crypto";
import { mustObjectId, toObjectId } from "../config/db.js";

const KEY_PREFIX = "hh_";
const KEY_PATTERN = /^hh_[a-f0-9]{40}$/;
const DISPLAY_PREFIX_LENGTH = KEY_PREFIX.length + 8; // e.g. "hh_3f9a1c2b"
const MAX_KEYS_PER_TENANT = 20;

class ApiKeyModel {
  constructor(db) {
    this.collection = db.collection("apikeys");
  }

  static generateKey() {
    return KEY_PREFIX + crypto.randomBytes(20).toString("hex");
  }

  static hashKey(key) {
    return crypto.createHash("sha256").update(key).digest("hex");
  }

  static looksLikeKey(key) {
    return typeof key === "string" && KEY_PATTERN.test(key);
  }

  static toPublic(doc) {
    if (!doc) return null;
    return {
      keyId: doc._id.toString(),
      name: doc.name,
      prefix: doc.prefix,
      createdAt: doc.createdAt,
      lastUsedAt: doc.lastUsedAt || null,
      revokedAt: doc.revokedAt || null,
      expiresAt: doc.expiresAt || null,
    };
  }

  /**
   * @returns {Promise<{key: string, record: Object}>} key is the full secret - show it once, never store it
   */
  async create(tenantId, name, createdBy = null) {
    const key = ApiKeyModel.generateKey();
    const doc = {
      tenantId: mustObjectId(tenantId, "tenant id"),
      name,
      keyHash: ApiKeyModel.hashKey(key),
      prefix: key.slice(0, DISPLAY_PREFIX_LENGTH),
      createdBy: createdBy ? toObjectId(createdBy) : null,
      createdAt: new Date(),
      lastUsedAt: null,
      revokedAt: null,
      expiresAt: null,
    };
    const result = await this.collection.insertOne(doc);
    return {
      key,
      record: ApiKeyModel.toPublic({ ...doc, _id: result.insertedId }),
    };
  }

  /** Returns the active key document for a plain key, or null. */
  async validate(plainKey) {
    if (!ApiKeyModel.looksLikeKey(plainKey)) return null;
    const doc = await this.collection.findOne({
      keyHash: ApiKeyModel.hashKey(plainKey),
      revokedAt: null,
    });
    if (!doc) return null;
    if (doc.expiresAt && new Date(doc.expiresAt) <= new Date()) return null;
    return doc;
  }

  async listActive(tenantId) {
    const docs = await this.collection
      .find({ tenantId: mustObjectId(tenantId, "tenant id"), revokedAt: null })
      .sort({ createdAt: -1 })
      .toArray();
    return docs.map(ApiKeyModel.toPublic);
  }

  async countActive(tenantId) {
    return this.collection.countDocuments({
      tenantId: mustObjectId(tenantId, "tenant id"),
      revokedAt: null,
    });
  }

  async activeNameExists(tenantId, name) {
    const doc = await this.collection.findOne(
      { tenantId: mustObjectId(tenantId, "tenant id"), revokedAt: null, name },
      { collation: { locale: "en", strength: 2 } } // case-insensitive
    );
    return Boolean(doc);
  }

  async findActiveById(tenantId, keyId) {
    const _id = toObjectId(keyId);
    if (!_id) return null;
    return this.collection.findOne({
      _id,
      tenantId: mustObjectId(tenantId, "tenant id"),
      revokedAt: null,
    });
  }

  async updateLastUsed(keyId) {
    await this.collection.updateOne(
      { _id: mustObjectId(keyId, "key id") },
      { $set: { lastUsedAt: new Date() } }
    );
  }

  /** Soft delete (keeps an audit trail). Returns false if not found in this tenant or already revoked. */
  async revoke(tenantId, keyId) {
    const _id = toObjectId(keyId);
    if (!_id) return false;
    const result = await this.collection.updateOne(
      { _id, tenantId: mustObjectId(tenantId, "tenant id"), revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
    return result.modifiedCount > 0;
  }

  /** Revokes the old key and issues a new one with the same name. Returns null if the key isn't active in this tenant. */
  async rotate(tenantId, keyId, rotatedBy = null) {
    const oldKey = await this.findActiveById(tenantId, keyId);
    if (!oldKey) return null;

    const revoked = await this.revoke(tenantId, keyId);
    if (!revoked) return null; // revoked by someone else in the meantime

    const created = await this.create(tenantId, oldKey.name, rotatedBy);
    return { ...created, rotatedFrom: oldKey._id.toString() };
  }
}

ApiKeyModel.MAX_KEYS_PER_TENANT = MAX_KEYS_PER_TENANT;

export default ApiKeyModel;
