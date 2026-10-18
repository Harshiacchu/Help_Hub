// server/models/apiKey.js - API keys that let other systems create tickets
//
// A key looks like hh_<40 hex characters>. Only its SHA-256 hash is stored;
// the full key is shown to the admin once, when it is created or rotated.
//
// apikeys: tenantId, name, keyHash (unique), prefix, createdAt, lastUsedAt
//   Create = new key, Read = list, Update = rotate (new secret, same record),
//   Delete = revoke (the record is removed, so the key stops working at once)

import crypto from "node:crypto";
import { mustObjectId, toObjectId } from "../config/db.js";

const MAX_KEYS_PER_TENANT = 20;

/** A new random key, plus the hash and prefix that are stored for it. */
function newSecret() {
  const key = "hh_" + crypto.randomBytes(20).toString("hex");
  return {
    key,
    keyHash: ApiKeyModel.hashKey(key),
    prefix: key.slice(0, 11), // e.g. "hh_3f9a1c2b", shown in the list
  };
}

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
    const { key, keyHash, prefix } = newSecret();
    const doc = {
      tenantId: mustObjectId(tenantId, "tenant id"),
      name,
      keyHash,
      prefix,
      createdAt: new Date(),
      lastUsedAt: null,
    };
    const result = await this.collection.insertOne(doc);
    return {
      key,
      record: ApiKeyModel.toPublic({ ...doc, _id: result.insertedId }),
    };
  }

  /** The key matching `key` (and records that it was used), or null. */
  async validate(key) {
    if (typeof key !== "string" || !key) return null;
    return this.collection.findOneAndUpdate(
      { keyHash: ApiKeyModel.hashKey(key) },
      { $set: { lastUsedAt: new Date() } },
      { returnDocument: "after" }
    );
  }

  async listActive(tenantId) {
    const docs = await this.collection
      .find({ tenantId: mustObjectId(tenantId, "tenant id") })
      .sort({ createdAt: -1 })
      .toArray();
    return docs.map(ApiKeyModel.toPublic);
  }

  async countActive(tenantId) {
    return this.collection.countDocuments({
      tenantId: mustObjectId(tenantId, "tenant id"),
    });
  }

  /** Deletes a key so it stops working at once; false if it isn't this company's key. */
  async revoke(tenantId, keyId) {
    const _id = toObjectId(keyId);
    if (!_id) return false;
    const result = await this.collection.deleteOne({
      _id,
      tenantId: mustObjectId(tenantId, "tenant id"),
    });
    return result.deletedCount > 0;
  }

  /** Gives a key a new secret, keeping its record and name; null if not found. */
  async rotate(tenantId, keyId) {
    const _id = toObjectId(keyId);
    if (!_id) return null;
    const { key, keyHash, prefix } = newSecret();
    const doc = await this.collection.findOneAndUpdate(
      { _id, tenantId: mustObjectId(tenantId, "tenant id") },
      { $set: { keyHash, prefix, createdAt: new Date(), lastUsedAt: null } },
      { returnDocument: "after" }
    );
    return doc ? { key, record: ApiKeyModel.toPublic(doc) } : null;
  }
}

ApiKeyModel.MAX_KEYS_PER_TENANT = MAX_KEYS_PER_TENANT;

export default ApiKeyModel;
