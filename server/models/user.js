// server/models/user.js - Users (customers, agents, superiors)
//
// Every method takes tenantId, and every query filters by it, so a user id
// from one company can never read or change a user in another company.

import { mustObjectId, toObjectId } from "../config/db.js";
import {
  ROLES,
  USER_STATUSES,
  ValidationError,
  normalizeEmail,
} from "../utils/validators.js";

const MAX_FAILED_LOGINS = 5;
const LOCK_DURATION_MS = 30 * 60 * 1000; // 30 minutes

class UserModel {
  constructor(db) {
    this.collection = db.collection("users");
  }

  /** Public shape - never includes passwordHash or lockout internals. */
  static toPublic(user) {
    if (!user) return null;
    return {
      userId: user._id.toString(),
      tenantId: user.tenantId.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin || null,
    };
  }

  static isLocked(user) {
    return Boolean(
      user && user.lockedUntil && new Date(user.lockedUntil) > new Date()
    );
  }

  /** Builds a new user document. Shared by create() and the seed script. */
  static newDocument({ tenantId, email, passwordHash, name, role }) {
    if (!ROLES.includes(role)) throw new ValidationError("Invalid role");
    const now = new Date();
    return {
      tenantId: mustObjectId(tenantId, "tenant id"),
      email: normalizeEmail(email),
      passwordHash,
      name,
      role,
      status: "active",
      createdAt: now,
      updatedAt: now,
      lastLogin: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
    };
  }

  /** Throws the driver's duplicate-key error (code 11000) if the email already exists in this tenant. */
  async create(fields) {
    const user = UserModel.newDocument(fields);
    const result = await this.collection.insertOne(user);
    return UserModel.toPublic({ ...user, _id: result.insertedId });
  }

  /** Includes passwordHash - only for login. */
  async findByEmailWithPassword(tenantId, email) {
    return this.collection.findOne({
      tenantId: mustObjectId(tenantId, "tenant id"),
      email: normalizeEmail(email),
    });
  }

  async findById(tenantId, userId) {
    const _id = toObjectId(userId);
    if (!_id) return null;
    const user = await this.collection.findOne({
      _id,
      tenantId: mustObjectId(tenantId, "tenant id"),
    });
    return UserModel.toPublic(user);
  }

  /** Everyone with one of these roles, except deleted users. */
  async findByTenantAndRole(tenantId, roles) {
    const query = {
      tenantId: mustObjectId(tenantId, "tenant id"),
      role: { $in: roles },
      status: { $ne: "deleted" },
    };
    const users = await this.collection
      .find(query)
      .sort({ role: -1, name: 1 })
      .toArray();
    return users.map(UserModel.toPublic);
  }

  /** Returns the updated user, or null if the user is not in this tenant. */
  async updateStatus(tenantId, userId, status) {
    if (!USER_STATUSES.includes(status))
      throw new ValidationError(`Invalid status: ${status}`);
    const _id = toObjectId(userId);
    if (!_id) return null;

    const result = await this.collection.updateOne(
      { _id, tenantId: mustObjectId(tenantId, "tenant id") },
      { $set: { status, updatedAt: new Date() } }
    );
    if (result.matchedCount === 0) return null;
    return this.findById(tenantId, userId);
  }

  async recordSuccessfulLogin(tenantId, userId) {
    await this.collection.updateOne(
      {
        _id: mustObjectId(userId, "user id"),
        tenantId: mustObjectId(tenantId, "tenant id"),
      },
      {
        $set: {
          lastLogin: new Date(),
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      }
    );
  }

  /**
   * Atomically counts a failed login and locks the account for 30 minutes
   * after 5 failures. The lock lives in lockedUntil only - status is never
   * touched, so a deactivated account can't "unlock" itself back to active.
   * @returns {Promise<{attempts: number, locked: boolean}>}
   */
  async recordFailedLogin(tenantId, userId) {
    const filter = {
      _id: mustObjectId(userId, "user id"),
      tenantId: mustObjectId(tenantId, "tenant id"),
    };
    const updated = await this.collection.findOneAndUpdate(
      filter,
      { $inc: { failedLoginAttempts: 1 } },
      { returnDocument: "after", includeResultMetadata: false }
    );

    const attempts = updated ? updated.failedLoginAttempts : 0;
    if (attempts >= MAX_FAILED_LOGINS) {
      await this.collection.updateOne(filter, {
        $set: {
          lockedUntil: new Date(Date.now() + LOCK_DURATION_MS),
          failedLoginAttempts: 0,
        },
      });
      return { attempts, locked: true };
    }
    return { attempts, locked: false };
  }
}

export default UserModel;
