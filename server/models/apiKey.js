// server/models/apiKey.js - API keys that let other systems create tickets
//
// A key looks like hh_<40 hex characters>. Only its SHA-256 hash is stored;
// the full key is shown to the admin once, when it is created.

import crypto from "node:crypto";
import { mustObjectId, toObjectId } from "../config/db.js";

const MAX_KEYS_PER_TENANT = 20;

class ApiKeyModel {
  constructor(db) {
    this.collection = db.collection("apikeys");
  }

  static hashKey(key) {
    return crypto.createHash("sha256").update(key).digest("hex");
  }

  static toPublic(doc) {
    return {
      keyId: doc._id.toString(),
      name: doc.name,
      prefix: doc.prefix,
      createdAt: doc.createdAt,
      lastUsedAt: doc.lastUsedAt,
    };
  }

  /** Returns the full key (to show once) and the stored record. */
  async create(tenantId, name) {
    const key = "hh_" + crypto.randomBytes(20).toString("hex");
    const doc = {
      tenantId: mustObjectId(tenantId, "tenant id"),
      name,
      keyHash: ApiKeyModel.hashKey(key),
      prefix: key.slice(0, 11), // e.g. "hh_3f9a1c2b", shown in the list
      createdAt: new Date(),
      lastUsedAt: null,
      revokedAt: null,
    };
    const result = await this.collection.insertOne(doc);
    return {
      key,
      record: ApiKeyModel.toPublic({ ...doc, _id: result.insertedId }),
    };
  }

  /** The active key matching `key` (and records that it was used), or null. */
  async validate(key) {
    if (typeof key !== "string" || !key) return null;
    return this.collection.findOneAndUpdate(
      { keyHash: ApiKeyModel.hashKey(key), revokedAt: null },
      { $set: { lastUsedAt: new Date() } },
      { returnDocument: "after" }
    );
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

  /** Revokes a key; false if it isn't an active key of this company. */
  async revoke(tenantId, keyId) {
    const _id = toObjectId(keyId);
    if (!_id) return false;
    const result = await this.collection.updateOne(
      { _id, tenantId: mustObjectId(tenantId, "tenant id"), revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
    return result.modifiedCount > 0;
  }

  /** Revokes a key and issues a new one with the same name; null if not found. */
  async rotate(tenantId, keyId) {
    const _id = toObjectId(keyId);
    const old =
      _id &&
      (await this.collection.findOne({
        _id,
        tenantId: mustObjectId(tenantId, "tenant id"),
        revokedAt: null,
      }));
    if (!old) return null;
    await this.revoke(tenantId, keyId);
    return this.create(tenantId, old.name);
  }
}

ApiKeyModel.MAX_KEYS_PER_TENANT = MAX_KEYS_PER_TENANT;

export default ApiKeyModel;
